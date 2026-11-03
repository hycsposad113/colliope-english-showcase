// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/session-pack.service.ts; adapted: synthetic offline tests.
import { describe, expect, it } from 'vitest';
import { assembleSessionPack, buildPhaseSchedule } from '../../src/report/session-pack.js';
describe('session pack', () => {
 it('allocates the complete time budget for each duration', () => { for (const n of [10, 20, 30] as const) expect(buildPhaseSchedule(n).reduce((a, b) => a + b.minutes, 0)).toBe(n); });
 it('bounds context and hashes the assembled content deterministically', () => {
  const input = { id: 'pack', missionTitle: 'Practice', targetLanguage: ['a', 'b'], successCriteria: [], maxContextItems: 1, learnerSituation: 'x'.repeat(2000) };
  const pack = assembleSessionPack(input); expect(pack.retrievalItems).toHaveLength(1); expect(pack.learnerSituation).toHaveLength(1000); expect(assembleSessionPack(input).promptHash).toBe(pack.promptHash);
 });
 it('rejects invalid budgets', () => { expect(() => assembleSessionPack({ id: 'p', missionTitle: 'm', targetLanguage: [], successCriteria: [], maxContextItems: -1 })).toThrow(); });
});

it('changes content hash when the prompt version changes', () => {
 const input = { id: 'p', missionTitle: 'm', targetLanguage: [], successCriteria: [] };
 expect(assembleSessionPack({ ...input, promptVersion: 'v1' }).promptHash).not.toBe(assembleSessionPack({ ...input, promptVersion: 'v2' }).promptHash);
});

it('normalizes and deduplicates bounded learner context', async () => {
 const { normalizeContextList } = await import('../../src/report/session-pack.js');
 expect(normalizeContextList(['  Tea  time ', 'tea time', '{{x', 'other'], 2)).toEqual(['Tea time', '{ {x']);
 expect(() => normalizeContextList([], -1)).toThrow(/budget/);
});
