// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/agent-jobs/agent-jobs.processor.ts; adapted: offline queue and repair tests.
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { JobPipeline, InMemoryQueue } from '../../src/llm/job-pipeline.js';

describe('job pipeline', () => {
  it('repairs malformed JSON with the actual parse error', async () => {
    const prompts: string[] = [];
    const pipeline = new JobPipeline(new InMemoryQueue(), { run: async (prompt) => { prompts.push(prompt); return prompts.length === 1 ? '{broken' : '{"title":"ok"}'; } });
    const job = await pipeline.submit('key', 'make a proposal', z.object({title:z.string()}));
    await pipeline.process(job.id);
    expect(job.status).toBe('completed');
    expect(prompts[1]).toMatch(/parse JSON/i);
    expect(job.result).toEqual({title:'ok'});
  });
  it('deduplicates repeated submissions', async () => {
    const pipeline = new JobPipeline(new InMemoryQueue(), {run: async () => '{"title":"ok"}'});
    const schema = z.object({title:z.string()});
    expect(await pipeline.submit('same','input',schema)).toBe(await pipeline.submit('same','input',schema));
  });
  it('fails after invalid correction', async () => {
    const pipeline = new JobPipeline(new InMemoryQueue(), {run: async () => '{}'});
    const job = await pipeline.submit('bad','input',z.object({title:z.string()}));
    await pipeline.process(job.id);
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/title/);
  });
  it('waits for quota and permits an explicit retry', async () => {
    let calls = 0;
    const queue = new InMemoryQueue();
    const pipeline = new JobPipeline(queue, { run: async () => ++calls === 1 ? 'rate limit exceeded' : '{"title":"ready"}' });
    const job = await pipeline.submit('quota', 'input', z.object({ title: z.string() }));
    await pipeline.process(job.id);
    expect(job.status).toBe('waiting_for_quota');
    await pipeline.retry(job.id);
    expect(await queue.has(job.id)).toBe(true);
    await pipeline.process(job.id);
    expect(job.status).toBe('completed');
  });
  it('does not overwrite cancellation when a provider returns late', async () => {
    let finish!: (value: string) => void;
    const response = new Promise<string>(resolve => { finish = resolve; });
    const pipeline = new JobPipeline(new InMemoryQueue(), { run: () => response });
    const job = await pipeline.submit('cancel', 'input', z.object({ title: z.string() }));
    const running = pipeline.process(job.id);
    await Promise.resolve();
    await pipeline.cancel(job.id);
    finish('{"title":"late"}');
    await running;
    expect(job.status).toBe('failed');
    expect(job.result).toBeUndefined();
  });
});

it('rejects reuse of an idempotency key for different input', async () => {
 const pipeline = new JobPipeline(new InMemoryQueue(), { run: async () => '{}' });
 await pipeline.submit('key', 'first', z.object({}));
 await expect(pipeline.submit('key', 'second', z.object({}))).rejects.toThrow(/different input/);
});
it('forwards cancellation to the running provider', async () => {
 let cancelled = '';
 let finish!: (value: string) => void;
 const pipeline = new JobPipeline(new InMemoryQueue(), { run: () => new Promise(resolve => { finish = resolve; }), cancel: id => { cancelled = id; } });
 const job = await pipeline.submit('cancel-process', 'input', z.object({}));
 const running = pipeline.process(job.id);
 await Promise.resolve(); await pipeline.cancel(job.id); finish('{}'); await running;
 expect(cancelled).toBe(job.id); expect(job.status).toBe('failed');
});

it('retries transient timeouts with bounded backoff', async () => {
 let calls = 0;
 const pipeline = new JobPipeline(new InMemoryQueue(), { run: async () => { if (++calls === 1) throw new Error('timed out'); return '{}'; } }, undefined, 2, 0);
 const job = await pipeline.submit('transient', 'input', z.object({}));
 await pipeline.process(job.id);
 expect(job.status).toBe('completed'); expect(job.attempts).toBe(2);
 expect(job.events.some(event => event.message.includes('retrying'))).toBe(true);
});
