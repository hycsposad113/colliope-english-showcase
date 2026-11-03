// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/report-scoring.service.spec.ts; adapted: synthetic offline tests.
import { describe, expect, it } from 'vitest';
import { createVoiceSessionReportV2Template } from '../../src/contracts/live-training.js';
import { ReportScoringService, persistableSkillUpdates } from '../../src/report/report-scoring.js';
const template = () => createVoiceSessionReportV2Template({ sessionPackId: 'pack', missionTitle: 'Practice', grammarFocusId: 'focus' });
describe('report scoring', () => {
 it('does not persist unobserved evidence', () => { expect(persistableSkillUpdates(new ReportScoringService().calculateSkillUpdates(template(), []))).toHaveLength(0); });
 it('rejects uncertain V2 speech evidence', () => {
  const report = template(); report.assessmentV2 = { accuracy: { score: 70, confidence: 0.9, status: 'observed', evidence: ['Synthetic example'], asrUncertain: true } };
  const accuracy = new ReportScoringService().calculateSkillUpdates(report, []).find(x => x.dimension === 'accuracy');
  expect(accuracy?.persist).toBe(false); expect(accuracy?.observationStatus).toBe('rejected_uncertain');
 });
 it('requires repeated anchor evidence before changing a rating', () => {
  const report = template(); report.assessment.voice = { score: 90, confidence: 1, status: 'observed', evidence: ['Synthetic example'] };
  const current = [{ dimension: 'voice', rating: 50, confidence: 0.5, evidenceCount: 2 }];
  const svc = new ReportScoringService();
  expect(svc.calculateSkillUpdates(report, current)[0].newRating).toBe(50);
  expect(svc.calculateSkillUpdates(report, current, false, { isAnchor: true })[0].newRating).toBe(52);
 });
});
