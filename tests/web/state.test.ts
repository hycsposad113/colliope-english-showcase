// Extracted from a larger private codebase (CALLIOPE). Source: apps/web/src/contexts/SocketContext.tsx, apps/web/src/features/live-training/ReportConfirmation.tsx; adapted: offline reducer and confirmation tests.
import { describe, expect, it } from 'vitest';
import { initialSocketState, socketReducer } from '../../src/web/socket-context';
import { confirmationDetails } from '../../src/web/ReportConfirmation';
describe('speaking state', () => {
  it('deduplicates final learner transcripts and clears partial text', () => {
    let state = socketReducer(initialSocketState, { type: 'transcript', text: 'hello', isFinal: false });
    state = socketReducer(state, { type: 'transcript', text: 'hello', isFinal: true });
    state = socketReducer(state, { type: 'transcript', text: 'hello', isFinal: true });
    expect(state.history).toHaveLength(1); expect(state.transcript).toBe('');
  });
  it('shows typed fallback after a starting error', () => { const state = socketReducer(socketReducer(initialSocketState, { type: 'start' }), { type: 'notice', message: 'unavailable' }); expect(state.speakingState).toBe('active'); expect(state.notice).toBe('unavailable'); });
  it('requires explicit acknowledgement of absent timing', () => { const report = { preview: {} }; expect(() => confirmationDetails(report, false, '', [])).toThrow(); expect(confirmationDetails(report, true, ' note ', [])).toEqual({ acceptMissingTiming: true, confirmedSelfReflection: { notes: 'note', confidence: undefined, difficulty: undefined } }); });
});
