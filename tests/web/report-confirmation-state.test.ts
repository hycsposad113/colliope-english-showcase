// Extracted from a larger private codebase (CALLIOPE). Source: apps/web/src/features/live-training/ReportPortal.tsx, ReportConfirmation.tsx; adapted: synthetic offline reducer tests.
import { describe, expect, it } from 'vitest';
import { initialReviewState as initial, reviewReducer as reduce } from '../../src/web/report-confirmation-state';
describe('report review', () => {
  it('rejects an empty report', () => expect(reduce(initial, { type: 'validate' }).error).toBeTruthy());
  it('starts validation for pasted text', () => expect(reduce(reduce(initial, { type: 'edit', report: 'report' }), { type: 'validate' }).phase).toBe('validating'));
  it('preserves the report after validation failure', () => { const state = reduce({ ...initial, phase: 'validating', report: 'report' }, { type: 'validationFailed', message: 'offline' }); expect(state).toMatchObject({ report: 'report', phase: 'editing', error: 'offline' }); });
  it('enters review after validation', () => expect(reduce({ ...initial, phase: 'validating' }, { type: 'validated' }).phase).toBe('review'));
  it('requires a second confirmation', () => expect(reduce({ ...initial, phase: 'review' }, { type: 'confirm', timingMissing: false, hasReportId: true }).phase).toBe('review'));
  it('requires missing timing acknowledgement', () => expect(reduce({ ...initial, phase: 'review', confirmRequested: true }, { type: 'confirm', timingMissing: true, hasReportId: true }).phase).toBe('review'));
  it('requires an identifier', () => expect(reduce({ ...initial, phase: 'review', confirmRequested: true }, { type: 'confirm', timingMissing: false, hasReportId: false }).phase).toBe('review'));
  it('returns to review on failure for retry', () => expect(reduce({ ...initial, phase: 'confirming', report: 'report' }, { type: 'confirmationFailed', message: 'offline' })).toMatchObject({ phase: 'review', report: 'report', error: 'offline' }));
  it('finishes only after confirmation succeeds', () => expect(reduce({ ...initial, phase: 'confirming' }, { type: 'confirmed' }).phase).toBe('complete'));
});
