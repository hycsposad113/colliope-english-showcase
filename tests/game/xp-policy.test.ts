// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/game/xp-policy.spec.ts; adapted: synthetic offline tests.
import { describe, expect, it } from 'vitest';
import { calculateDailyXp, reconcileSuccessCriteria, cumulativeXpForLevel, levelFromXp } from '../../src/game/xp-policy.js';
describe('XP policy', () => {
 it('downgrades an unsupported full clear and preserves zero confidence', () => {
  const result = calculateDailyXp({ completionStatus: 'full_clear', reportConfidence: 0 });
  expect(result.effectiveStatus).toBe('partial_clear'); expect(result.timingEvidenceMissing).toBe(true); expect(result.evidenceQualityBonus).toBe(0);
 });
 it('rejects invented and contradictory criteria', () => {
  const result = reconcileSuccessCriteria([{ id: 'c1', text: 'Practice', mandatory: true }], ['c1', 'extra'], ['c1']);
  expect(result.ok).toBe(false); expect(result.issues.length).toBeGreaterThan(1);
 });
 it('maps cumulative XP boundaries consistently', () => { expect(levelFromXp(cumulativeXpForLevel(4))).toBe(4); });
});
