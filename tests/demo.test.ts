// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/report-import.service.spec.ts; adapted: synthetic end-to-end offline orchestration tests.
import { describe, expect, it } from 'vitest';
import { runDemo } from '../demo/run.js';
import { FakeLocalCli, InMemoryQueue } from '../demo/fakes.js';
import { JobPipeline } from '../src/llm/job-pipeline.js';
import { Proposal } from '../src/contracts/report.js';

describe('offline demo', () => {
  it('repairs, previews, deduplicates and confirms exactly once in memory', async () => {
    const result = await runDemo(() => {});
    expect(result).toMatchObject({ attempts: 2, repairIncludedErrors: true, reportExtracted: true, replayIdempotent: true, beforeConfirmation: 0, confirmedReplayRejected: true, fulfilled: 1, rejected: 1 });
    expect(result.total).toBe(result.expectedScore);
    expect(result.total).toBeGreaterThan(0);
  });
  it('fails without awarding a result when no repair attempt is allowed', async () => {
    const pipeline = new JobPipeline(new InMemoryQueue(), new FakeLocalCli(), undefined, 1);
    const job = await pipeline.submit('one-attempt', 'synthetic', Proposal);
    await pipeline.process(job.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('question');
    expect(job.result).toBeUndefined();
  });
  it('can disable the invalid first response', async () => {
    const cli = new FakeLocalCli(false);
    expect(JSON.parse(await cli.run('synthetic')).question).toBeTruthy();
    expect(cli.inputs).toHaveLength(1);
  });
});
