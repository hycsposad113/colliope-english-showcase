// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/local-workers/local-workers.service.ts; adapted: offline tests using synthetic providers and a local child process.
import { describe, it, expect } from 'vitest';
import { LocalCliWorker, ProcessProvider, extractJson } from '../../src/llm/local-cli-worker.js';

describe('local workers', () => {
  it('falls back after an unavailable provider', async () => {
    const worker = new LocalCliWorker([
      { name: 'first', run: async () => { throw new Error('missing'); } },
      { name: 'second', run: async () => ({ stdout: 'answer', stderr: '', exitCode: 0 }) },
    ]);
    expect((await worker.run('hello')).stdout).toBe('answer');
  });
  it('terminates a child on timeout', async () => {
    const provider = new ProcessProvider('node', process.execPath, ['-e', 'setTimeout(() => {}, 1000)']);
    await expect(provider.run('hello', { timeoutMs: 30 })).rejects.toThrow(/timed out/i);
  });
  it('extracts fenced JSON', () => expect(JSON.parse(extractJson('```json\n{"ok":true}\n```'))).toEqual({ok:true}));
  it('validates the response envelope against the schema', async () => {
    const { z } = await import('zod');
    const worker = new LocalCliWorker([{ name: 'synthetic', run: async () => ({
      stdout: JSON.stringify({ response: '{"score":120}' }), stderr: '', exitCode: 0,
    }) }]);
    await expect(worker.runStructured('score', z.object({ score: z.number().max(100) }))).rejects.toThrow(/validation/i);
  });
  it('rejects oversized and null-byte input before running a provider', async () => {
    let calls = 0;
    const worker = new LocalCliWorker([{ name: 'synthetic', run: async () => {
      calls++; return { stdout: 'ok', stderr: '', exitCode: 0 };
    } }]);
    await expect(worker.run('bad\0input')).rejects.toThrow(/Null bytes/);
    await expect(worker.run('x'.repeat(100_001))).rejects.toThrow(/100KB/);
    expect(calls).toBe(0);
  });
});

it('rejects a cancelled process and does not start a fallback', async () => {
 let fallbackCalls = 0;
 const provider = new ProcessProvider('node', process.execPath, ['-e', 'setTimeout(() => {}, 1000)']);
 const worker = new LocalCliWorker([provider, { name: 'fallback', run: async () => { fallbackCalls++; return { stdout: 'ok', stderr: '', exitCode: 0 }; } }]);
 const running = worker.run('input', { jobId: 'synthetic', timeoutMs: 2000 });
 worker.cancel('synthetic');
 await expect(running).rejects.toMatchObject({ kind: 'cancelled' });
 expect(fallbackCalls).toBe(0);
});
it('stops an oversized child output', async () => {
 const provider = new ProcessProvider('node', process.execPath, ['-e', "process.stdout.write('x'.repeat(1100000))"]);
 await expect(provider.run('input')).rejects.toMatchObject({ kind: 'output_limit' });
});
