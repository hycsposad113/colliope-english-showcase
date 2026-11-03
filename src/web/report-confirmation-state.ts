// Extracted from a larger private codebase (CALLIOPE). Source: apps/web/src/features/live-training/ReportPortal.tsx, apps/web/src/features/live-training/ReportConfirmation.tsx; adapted: explicit pure reducer for offline review and confirmation.
export type ReviewPhase = 'editing' | 'validating' | 'review' | 'confirming' | 'complete';
export interface ReviewState {
  phase: ReviewPhase;
  report: string;
  error: string | null;
  acknowledgeTiming: boolean;
  confirmRequested: boolean;
}
export type ReviewAction =
  | { type: 'edit'; report: string }
  | { type: 'validate' }
  | { type: 'validated' }
  | { type: 'validationFailed'; message: string }
  | { type: 'acknowledgeTiming'; value: boolean }
  | { type: 'requestConfirmation' }
  | { type: 'cancelConfirmation' }
  | { type: 'confirm'; timingMissing: boolean; hasReportId: boolean }
  | { type: 'confirmed' }
  | { type: 'confirmationFailed'; message: string }
  | { type: 'reset' };
export const initialReviewState: ReviewState = {
  phase: 'editing', report: '', error: null, acknowledgeTiming: false, confirmRequested: false,
};
export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'edit':
      if (state.phase === 'validating' || state.phase === 'confirming') return state;
      return { ...state, report: action.report, phase: 'editing', error: null, confirmRequested: false };
    case 'validate':
      if (state.phase !== 'editing') return state;
      if (!state.report.trim()) return { ...state, error: 'Paste a report before previewing.' };
      return { ...state, phase: 'validating', error: null };
    case 'validated':
      return state.phase === 'validating' ? { ...state, phase: 'review', error: null } : state;
    case 'validationFailed':
      return state.phase === 'validating' ? { ...state, phase: 'editing', error: action.message } : state;
    case 'acknowledgeTiming':
      return { ...state, acknowledgeTiming: action.value, confirmRequested: false };
    case 'requestConfirmation':
      return state.phase === 'review' ? { ...state, confirmRequested: true, error: null } : state;
    case 'cancelConfirmation':
      return { ...state, confirmRequested: false };
    case 'confirm':
      if (state.phase !== 'review' || !state.confirmRequested || !action.hasReportId || (action.timingMissing && !state.acknowledgeTiming)) return state;
      return { ...state, phase: 'confirming', error: null, confirmRequested: false };
    case 'confirmed':
      return state.phase === 'confirming' ? { ...state, phase: 'complete' } : state;
    case 'confirmationFailed':
      return state.phase === 'confirming' ? { ...state, phase: 'review', error: action.message, confirmRequested: false } : state;
    case 'reset': return initialReviewState;
  }
}
