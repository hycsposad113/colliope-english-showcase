// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/agent-jobs/agent-jobs.service.ts, apps/api/src/agent-jobs/agent-jobs.processor.ts, apps/api/src/agent-jobs/schemas.ts; adapted: NestJS, Prisma and BullMQ replaced by injected ports and an in-memory queue; repair retries and idempotency added.
import { z } from 'zod';
import { Proposal } from '../contracts/report.js';
import { classifyWorkerError, extractJson, type LocalCli } from './local-cli-worker.js';

export const ResearchSourceSchema = z.object({
  title: z.string(), url: z.string().nullable().optional(), publisher: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(), language: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(), purpose: z.string().nullable().optional(),
  segment: z.string().nullable().optional(), license: z.string().nullable().optional(),
  reason: z.string().nullable().optional(), risks: z.string().nullable().optional(),
});
export const ResearchBriefOutputSchema = z.object({ sources: z.array(ResearchSourceSchema) });
export const ValidationOutputSchema = z.object({ valid: z.boolean(), errors: z.array(z.string()).nullable().optional() });
export const OneshotOutputSchema = z.object({ response: z.string() });

export type JobStatus = 'pending' | 'active' | 'waiting_for_quota' | 'completed' | 'failed';
export type JobEventType = 'info' | 'warn' | 'error';
export interface JobEvent { type: JobEventType; message: string; createdAt: Date }
export interface PipelineJob<T = unknown> {
  id: string;
  key: string;
  prompt: string;
  schema: z.ZodType<T>;
  status: JobStatus;
  attempts: number;
  result?: T;
  error?: string;
  events: JobEvent[];
}
export interface QueuePort {
  add(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  has(id: string): Promise<boolean>;
}
export interface PipelineEvents {
  status(jobId: string, status: JobStatus): void;
  event(jobId: string, event: JobEvent): void;
}
export class InMemoryQueue implements QueuePort {
  private readonly ids = new Set<string>();
  async add(id: string): Promise<void> {
    if (this.ids.has(id)) throw new Error(`Job ${id} already queued`);
    this.ids.add(id);
  }
  async remove(id: string): Promise<void> { this.ids.delete(id); }
  async has(id: string): Promise<boolean> { return this.ids.has(id); }
  async take(): Promise<string | undefined> {
    const id = this.ids.values().next().value as string | undefined;
    if (id) this.ids.delete(id);
    return id;
  }
}

export class JobPipeline {
  private readonly jobs = new Map<string, PipelineJob>();
  private readonly keys = new Map<string, string>();
  private readonly processing = new Set<string>();
  private nextId = 1;
  constructor(private readonly queue: QueuePort, private readonly cli: LocalCli, private readonly events?: PipelineEvents, private readonly maxAttempts = 2, private readonly backoffMs = 25) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('maxAttempts must be a positive integer');
    if (!Number.isFinite(backoffMs) || backoffMs < 0) throw new Error('backoffMs must be non-negative');
  }
  async submit<T>(key: string, prompt: string, schema: z.ZodType<T>): Promise<PipelineJob<T>> {
    if (!key.trim()) throw new Error('An idempotency key is required');
    const existingId = this.keys.get(key);
    if (existingId) {
      const existing = this.jobs.get(existingId)!;
      if (existing.prompt !== prompt) throw new Error('Idempotency key reused with different input');
      return existing as PipelineJob<T>;
    }
    const job: PipelineJob<T> = { id: String(this.nextId++), key, prompt, schema, status: 'pending', attempts: 0, events: [] };
    this.jobs.set(job.id, job);
    this.keys.set(key, job.id);
    try {
      await this.queue.add(job.id);
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      this.emit(job, 'error', `Job could not be queued: ${job.error}`);
      this.events?.status(job.id, job.status);
      throw error;
    }
    this.events?.status(job.id, job.status);
    this.emit(job, 'info', 'Job queued.');
    return job;
  }
  get(id: string): PipelineJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found`);
    return job;
  }
  list(): PipelineJob[] { return [...this.jobs.values()]; }
  private emit(job: PipelineJob, type: JobEventType, message: string): void {
    const event = { type, message, createdAt: new Date() };
    job.events.push(event);
    this.events?.event(job.id, event);
  }
  private setStatus(job: PipelineJob, status: JobStatus): void {
    job.status = status;
    this.events?.status(job.id, status);
  }
  async process(id: string): Promise<void> {
    const job = this.get(id);
    if (job.status !== 'pending' || this.processing.has(id)) return;
    this.processing.add(id);
    this.setStatus(job, 'active');
    this.emit(job, 'info', 'Job status changed to active.');
    try {
      await this.queue.remove(id);
      let prompt = job.prompt;
      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        job.attempts = attempt;
        let raw: string;
        try {
          raw = await this.cli.run(prompt, { jobId: id });
        } catch (error) {
          const kind = classifyWorkerError(error);
          if ((kind === 'timeout' || kind === 'unavailable') && attempt < this.maxAttempts && (job.status as JobStatus) === 'active') {
            const delay = Math.min(this.backoffMs * 2 ** (attempt - 1), 30_000);
            this.emit(job, 'warn', `Worker ${kind}; retrying after ${delay} ms.`);
            await new Promise<void>(resolve => setTimeout(resolve, delay));
            if ((job.status as JobStatus) !== 'active') return;
            continue;
          }
          throw error;
        }
        // A cancellation may have happened while the provider was executing.
        if ((job.status as JobStatus) !== 'active') return;
        if (/quota exhausted|rate limit exceeded|\b429\b/i.test(raw)) {
          job.error = 'Provider quota exhausted';
          this.emit(job, 'warn', 'Subscription quota exhausted. Job is waiting for quota.');
          this.setStatus(job, 'waiting_for_quota');
          return;
        }
        let value: unknown;
        let errors: string[] = [];
        try {
          value = JSON.parse(extractJson(raw));
          const parsed = job.schema.safeParse(value);
          if (parsed.success) {
            job.result = parsed.data;
            job.error = undefined;
            this.emit(job, 'info', 'Job completed successfully.');
            this.setStatus(job, 'completed');
            return;
          }
          errors = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        } catch (error) {
          errors = [`Failed to parse JSON output: ${error instanceof Error ? error.message : String(error)}`];
        }
        job.error = errors.join('\n');
        this.emit(job, attempt < this.maxAttempts ? 'warn' : 'error', `Output validation failed:\n${job.error}`);
        if (attempt < this.maxAttempts) {
          prompt = `${job.prompt}\n\nYour previous output failed validation. Correct the JSON using these errors:\n${job.error}\nReturn only valid JSON.`;
        }
      }
      this.setStatus(job, 'failed');
    } catch (error) {
      if ((job.status as JobStatus) !== 'active') return;
      job.error = error instanceof Error ? error.message : String(error);
      if (/quota exhausted|rate limit exceeded|\b429\b/i.test(job.error)) {
        this.emit(job, 'warn', 'Subscription quota exhausted. Job is waiting for quota.');
        this.setStatus(job, 'waiting_for_quota');
      } else {
        this.emit(job, 'error', `Job failed: ${job.error}`);
        this.setStatus(job, 'failed');
      }
    } finally {
      this.processing.delete(id);
    }
  }
  async cancel(id: string): Promise<void> {
    const job = this.get(id);
    if (!['pending', 'active', 'waiting_for_quota'].includes(job.status)) return;
    this.cli.cancel?.(id);
    await this.queue.remove(id);
    this.setStatus(job, 'failed');
    job.error = 'Job was manually cancelled.';
    this.emit(job, 'error', job.error);
  }
  async retry(id: string): Promise<void> {
    const job = this.get(id);
    if (!['failed', 'waiting_for_quota'].includes(job.status)) throw new Error(`Job ${id} cannot be retried from status ${job.status}`);
    if (this.processing.has(id)) throw new Error(`Job ${id} is still active`);
    await this.queue.add(id);
    job.error = undefined;
    job.attempts = 0;
    this.setStatus(job, 'pending');
    this.emit(job, 'info', 'Job requeued.');
  }
}

export async function propose(cli: LocalCli, input: string, notify: (event: string) => void = () => {}) {
  const pipeline = new JobPipeline(new InMemoryQueue(), cli, {
    status: () => {}, event: (_id, event) => notify(event.message),
  });
  const job = await pipeline.submit('proposal', input, Proposal);
  await pipeline.process(job.id);
  if (job.status !== 'completed' || !job.result) throw new Error(`Proposal validation failed: ${job.error ?? 'unknown error'}`);
  return job.result;
}
export class FakeQueue { async add<T>(job: () => Promise<T>): Promise<T> { return job(); } }
