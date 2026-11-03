// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/local-workers/local-workers.service.ts, apps/api/src/local-workers/hermes-json.service.ts, apps/api/src/common/extract-json.ts; adapted: NestJS configuration replaced by injected provider ports and process runner.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { z } from 'zod';

export interface LocalCli { run(input: string, options?: RunOptions): Promise<string>; cancel?(jobId: string): void }
export interface RunOptions { timeoutMs?: number; jobId?: string }
export interface WorkerResult { stdout: string; stderr: string; exitCode: number | null }
export interface Provider {
  readonly name: string;
  run(input: string, options?: RunOptions): Promise<WorkerResult>;
  cancel?(jobId: string): void;
}
export type WorkerErrorKind = 'timeout' | 'unavailable' | 'quota' | 'output_limit' | 'exit' | 'invalid_json' | 'validation' | 'cancelled';
export class WorkerError extends Error {
  constructor(public readonly kind: WorkerErrorKind, message: string) {
    super(message);
    this.name = 'WorkerError';
  }
}

/** Pull JSON from CLI stdout, including fenced blocks. */
export function extractJson(stdout: string): string {
  const trimmed = stdout.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function validateInput(input: string): void {
  if (input.includes('\u0000')) throw new WorkerError('validation', 'Null bytes are not allowed in worker input');
  if (Buffer.byteLength(input, 'utf8') > 100_000) throw new WorkerError('validation', 'Worker input exceeds the 100KB limit');
}

export function extractResponseText(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(extractJson(trimmed)) as { response?: unknown } | null;
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.response === 'string' && parsed.response.trim()) return parsed.response.trim();
      if (parsed.response !== undefined) return JSON.stringify(parsed.response);
    }
  } catch {
    // Providers may return plain text, or JSON without a response envelope.
  }
  return trimmed;
}

export function classifyWorkerError(error: unknown): WorkerErrorKind {
  if (error instanceof WorkerError) return error.kind;
  const value = error as { code?: string; message?: string } | null;
  const message = value?.message ?? String(error);
  if (/quota exhausted|rate limit exceeded|\b429\b/i.test(message)) return 'quota';
  if (/timed? out/i.test(message)) return 'timeout';
  if (/limit of 1MB exceeded/i.test(message)) return 'output_limit';
  if (value?.code === 'ENOENT' || value?.code === 'ECONNREFUSED') return 'unavailable';
  return 'exit';
}

export class ProcessProvider implements Provider {
  private readonly active = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly cancellations = new Map<string, () => void>();
  constructor(readonly name: string, private readonly command: string, private readonly args: string[] = [], private readonly defaultTimeoutMs = 30_000) {}

  cancel(jobId: string): void {
    this.cancellations.get(jobId)?.();
  }

  run(input: string, options: RunOptions = {}): Promise<WorkerResult> {
    validateInput(input);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new WorkerError('validation', 'Timeout must be positive'));
    if (options.jobId && this.active.has(options.jobId)) return Promise.reject(new WorkerError('validation', 'Job already has an active process'));
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const maxBytes = 1024 * 1024;
      if (options.jobId) this.active.set(options.jobId, child);
      const cleanup = () => {
        clearTimeout(timer);
        if (options.jobId && this.active.get(options.jobId) === child) {
          this.active.delete(options.jobId);
          this.cancellations.delete(options.jobId);
        }
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        cleanup();
        reject(error);
      };
      if (options.jobId) this.cancellations.set(options.jobId, () => fail(new WorkerError('cancelled', 'Job was manually cancelled')));
      const timer = setTimeout(() => fail(new WorkerError('timeout', `Execution timed out after ${timeoutMs} ms`)), timeoutMs);
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (Buffer.byteLength(stdout) > maxBytes) fail(new WorkerError('output_limit', 'Stdout limit of 1MB exceeded'));
      });
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (Buffer.byteLength(stderr) > maxBytes) fail(new WorkerError('output_limit', 'Stderr limit of 1MB exceeded'));
      });
      child.stdin.on('error', () => { /* A child can exit before consuming stdin. */ });
      child.on('error', (error) => fail(new WorkerError(classifyWorkerError(error), error.message)));
      child.on('close', (exitCode) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ stdout, stderr, exitCode });
      });
      child.stdin.end(input);
    });
  }
}

export class LocalCliWorker {
  constructor(private readonly providers: Provider[], private readonly optionalTimeoutMs = 3_000) {
    if (!providers.length) throw new WorkerError('validation', 'At least one provider is required');
  }
  async run(prompt: string, options: RunOptions = {}): Promise<WorkerResult> {
    validateInput(prompt);
    const total = options.timeoutMs ?? 30_000;
    const startedAt = Date.now();
    let lastError: unknown = new WorkerError('unavailable', 'No provider completed');
    for (let i = 0; i < this.providers.length; i++) {
      const remaining = total - (Date.now() - startedAt);
      if (remaining <= 0) throw new WorkerError('timeout', `Execution timed out after ${total} ms`);
      const timeoutMs = i < this.providers.length - 1 ? Math.min(this.optionalTimeoutMs, remaining) : remaining;
      try {
        const result = await this.providers[i].run(prompt, { ...options, timeoutMs });
        const combined = `${result.stdout}\n${result.stderr}`;
        if (/quota exhausted|rate limit exceeded|\b429\b/i.test(combined)) throw new WorkerError('quota', 'Provider quota exhausted');
        if (result.exitCode === 0 && extractResponseText(result.stdout)) return result;
        lastError = new WorkerError('exit', `Provider ${this.providers[i].name} exited with code ${result.exitCode ?? 'unknown'} or returned empty output`);
      } catch (error) {
        lastError = error;
        if (classifyWorkerError(error) === 'cancelled') throw error;
        // Preserve the original hard failure for an explicitly refused connection.
        if ((error as { code?: string })?.code === 'ECONNREFUSED') throw error;
      }
    }
    throw lastError;
  }
  cancel(jobId: string): void { for (const provider of this.providers) provider.cancel?.(jobId); }

  async runStructured<T>(prompt: string, schema: z.ZodType<T>, options?: RunOptions): Promise<T> {
    const result = await this.run(`${prompt}\n\nReturn only valid JSON matching the requested schema. No markdown fences and no commentary outside the JSON object.`, options);
    const response = extractResponseText(result.stdout);
    if (!response) throw new WorkerError('invalid_json', 'Provider returned an empty response');
    let parsed: unknown;
    try { parsed = JSON.parse(extractJson(response)); }
    catch (error) { throw new WorkerError('invalid_json', `Failed to parse JSON from provider response: ${error instanceof Error ? error.message : String(error)}`); }
    const validated = schema.safeParse(parsed);
    if (!validated.success) throw new WorkerError('validation', `Schema validation failed: ${validated.error.errors.map(e => e.message).join('; ')}`);
    return validated.data;
  }
}

// Compatibility adapter for callers that need the original string-only interface.
export class ProcessCli implements LocalCli {
  private readonly provider: ProcessProvider;
  constructor(command: string, args: string[] = [], timeoutMs = 30_000) { this.provider = new ProcessProvider('process', command, args, timeoutMs); }
  cancel(jobId: string): void { this.provider.cancel(jobId); }
  async run(input: string, options?: RunOptions): Promise<string> {
    const result = await this.provider.run(input, options);
    if (result.exitCode !== 0) throw new WorkerError('exit', `CLI failed with exit code ${result.exitCode}`);
    return result.stdout;
  }
}
export class FakeLocalCli implements LocalCli {
  private calls = 0;
  constructor(private readonly failFirst = true) {}
  async run(_input: string): Promise<string> {
    this.calls++;
    return this.failFirst && this.calls === 1 ? '{invalid' : JSON.stringify({ topic: 'Interview practice', question: 'Tell me about a project.' });
  }
}
