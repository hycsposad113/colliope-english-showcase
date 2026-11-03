// Extracted from a larger private codebase (CALLIOPE). Source: apps/web/src/features/live-training/ReportConfirmation.tsx; adapted: inline presentation and local types replace private components, icons and contracts.
import { useReducer, useRef, useState } from 'react';
import { initialReviewState, reviewReducer } from './report-confirmation-state';
type RecordValue = Record<string, unknown>;
export interface ReportPreview extends RecordValue {
  speakingMinutes?: number | null;
  durationMinutes?: number | null;
  successCriteriaMet?: string[];
  successCriteriaMissed?: string[];
  criteriaIssues?: string[];
  targetLanguageUsed?: string[];
  targetLanguageMissed?: string[];
  strengths?: Array<{ observation?: string; evidence?: string }>;
  corrections?: Array<{ observed?: string; original?: string; correction?: string; explanation?: string }>;
  selfReflection?: RecordValue;
}
export interface Validation extends RecordValue {
  reportId?: string;
  reportConfidence?: number;
  requiresTimingConfirmation?: boolean;
  timingEvidenceMissing?: boolean;
  preview?: ReportPreview;
  extractedReport?: RecordValue;
}
export interface ConfirmationDetails {
  acceptMissingTiming?: true;
  confirmedSelfReflection?: { notes: string; confidence?: number; difficulty?: number };
  confirmedTargetLanguage?: string[];
}
export interface Proposal { current: string; status: 'accepted' | 'rejected' }
export function missingTiming(validation: Validation): boolean {
  return validation.requiresTimingConfirmation === true || validation.timingEvidenceMissing === true || validation.preview?.speakingMinutes == null || validation.preview?.durationMinutes == null;
}
export function confirmationDetails(validation: Validation, accepted: boolean, notes: string, proposals: Proposal[]): ConfirmationDetails | undefined {
  if (missingTiming(validation) && !accepted) throw new Error('Acknowledge missing timing before confirmation.');
  const reflection = validation.preview?.selfReflection ?? {};
  const trimmed = notes.trim();
  const details: ConfirmationDetails = {
    ...(missingTiming(validation) && accepted ? { acceptMissingTiming: true as const } : {}),
    ...(trimmed ? { confirmedSelfReflection: { notes: trimmed, confidence: typeof reflection.confidence === 'number' ? reflection.confidence : undefined, difficulty: typeof reflection.difficulty === 'number' ? reflection.difficulty : undefined } } : {}),
    ...(proposals.length ? { confirmedTargetLanguage: proposals.filter(item => item.status === 'accepted').map(item => item.current) } : {}),
  };
  return Object.keys(details).length ? details : undefined;
}
const card = { border: '1px solid #9aa', borderRadius: 10, padding: 16, margin: '12px 0' };
function Items({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <section style={card}><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>;
}
function minutes(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? `${value} minutes` : 'Not provided'; }
export function ReportConfirmation({ reportValidation, onConfirm, onReject }: { reportValidation: Validation; onConfirm(reportId: string, details?: ConfirmationDetails): Promise<unknown>; onReject(): void }) {
  const preview = reportValidation.preview;
  const extracted = reportValidation.extractedReport;
  const rawReflection = preview?.selfReflection ?? (extracted?.learnerSelfReflection as RecordValue | undefined) ?? {};
  const [notes, setNotes] = useState(typeof rawReflection.notes === 'string' ? rawReflection.notes : '');
  const [accepted, setAccepted] = useState(false);
  const [review, dispatch] = useReducer(reviewReducer, { ...initialReviewState, phase: 'review' });
  const confirming = review.phase === 'confirming';
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  if (!preview && !extracted) return null;
  const reportId = reportValidation.reportId ?? '';
  const missing = missingTiming(reportValidation);
  const confidence = reportValidation.reportConfidence;
  const used = preview?.targetLanguageUsed ?? [];
  const missed = preview?.targetLanguageMissed ?? [];
  const toggle = (item: string, checked: boolean) => setProposals(previous => [...previous.filter(p => p.current !== item), { current: item, status: checked ? 'accepted' : 'rejected' }]);
  async function confirm() {
    if (!reportId || confirming || (missing && !accepted)) return;
    if (!review.confirmRequested) return;
    dispatch({ type: 'confirm', timingMissing: missing, hasReportId: Boolean(reportId) });
    setError(null);
    try { await onConfirm(reportId, confirmationDetails(reportValidation, accepted, notes, proposals)); dispatch({ type: 'confirmed' }); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Confirmation failed. Your pending report is preserved; retry.';
      setError(message);
      dispatch({ type: 'confirmationFailed', message });
      setTimeout(() => errorRef.current?.focus(), 0);
    }
  }
  return <section role="region" aria-labelledby="report-confirmation-heading" style={card}>
    <h2 id="report-confirmation-heading">Review &amp; Confirm Mission Results</h2>
    <p>Confidence: {typeof confidence === 'number' && Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : 'Not provided'}</p>
    <section style={card} aria-label="Session descriptive metrics">
      <h3>Session preview</h3>
      <p>Completion: {typeof preview?.completionStatus === 'string' ? preview.completionStatus : 'Not provided'}</p>
      <p>Speaking time: {minutes(preview?.speakingMinutes)}</p>
      <p>Total duration: {minutes(preview?.durationMinutes)}</p>
      <p>Criteria satisfied: {preview?.successCriteriaMet?.length ?? 0}</p>
    </section>
    <Items title="Criteria met" items={preview?.successCriteriaMet ?? []} />
    <Items title="Criteria not met" items={preview?.successCriteriaMissed ?? []} />
    <Items title="Criteria reconciliation issues" items={preview?.criteriaIssues ?? []} />
    <Items title="Target language used" items={used} />
    <Items title="Target language missed" items={missed} />
    {!!preview?.strengths?.length && <section style={card}><h3>Observed strengths</h3><ul>{preview.strengths.map((item, index) => <li key={index}>{item.observation ?? 'Not provided'} — {item.evidence ?? 'Evidence not provided'}</li>)}</ul></section>}
    {!!preview?.corrections?.length && <section style={card}><h3>Suggested changes</h3>{preview.corrections.map((item, index) => <div key={index} style={{ marginBottom: 12 }}><p>Observed: {item.observed ?? item.original ?? 'Not provided'}</p><p>Suggested: {item.correction ?? 'Not provided'}</p>{item.explanation && <p>{item.explanation}</p>}</div>)}</section>}
    {!!missed.length && <section style={card}><h3>Choose target language for next practice</h3>{missed.map((item, index) => <label key={index} style={{ display: 'block' }}><input type="checkbox" checked={proposals.some(p => p.current === item && p.status === 'accepted')} onChange={event => toggle(item, event.target.checked)} /> {item}</label>)}</section>}
    <section style={card}><h3>Learner self-reflection</h3><label htmlFor="reflection">Notes editable before confirmation</label><textarea id="reflection" value={notes} onChange={event => setNotes(event.target.value)} rows={3} style={{ display: 'block', width: '100%' }} /></section>
    <section style={card}><h3>Evidence provenance</h3><p>{typeof preview?.provenance === 'string' ? preview.provenance : 'Pasted report; untrusted until learner confirmation.'}</p><p>Mandatory criteria: {typeof preview?.mandatoryCriteriaSatisfied === 'boolean' ? preview.mandatoryCriteriaSatisfied ? 'Satisfied' : 'Not satisfied' : 'Not provided'}</p></section>
    <p role="note">Validation and import are evidence only. Confirm applies progression; reject discards the pending import.</p>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" style={card}>{error}</div>}
    {missing && <label style={{ display: 'block', ...card }}><input type="checkbox" checked={accepted} onChange={event => { setAccepted(event.target.checked); dispatch({ type: 'acknowledgeTiming', value: event.target.checked }); }} /> I understand timing evidence is missing and accept a no-timing progression result.</label>}
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}><button type="button" onClick={onReject} disabled={confirming}>Reject report</button><button type="button" disabled={confirming || !reportId || (missing && !accepted)} onClick={() => dispatch({ type: 'requestConfirmation' })}>{confirming ? 'Applying progression…' : 'Review confirmation'}</button></div>
    {review.confirmRequested && <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-final-title" style={card}><h3 id="confirm-final-title">Apply these results?</h3><p>This will apply progression from the reviewed report.</p><button type="button" onClick={() => dispatch({ type: 'cancelConfirmation' })}>Go back</button> <button type="button" onClick={() => void confirm()}>Confirm &amp; award rewards</button></section>}
  </section>;
}

/** The caller validates pasted text and supplies the pending report identifier. */
export function ReportPortal({ onValidate, onConfirm, onReject }: {
  onValidate(report: string): Promise<Validation>;
  onConfirm(reportId: string, details?: ConfirmationDetails): Promise<unknown>;
  onReject(): void;
}) {
  const [state, dispatch] = useReducer(reviewReducer, initialReviewState);
  const [validation, setValidation] = useState<Validation | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  async function validate() {
    if (!state.report.trim() || state.phase !== 'editing') {
      dispatch({ type: 'validate' });
      return;
    }
    dispatch({ type: 'validate' });
    try {
      const result = await onValidate(state.report);
      if (!result.reportId || (!result.preview && !result.extractedReport)) {
        throw new Error('The report could not be previewed. Check the pasted text and retry.');
      }
      setValidation(result);
      dispatch({ type: 'validated' });
    } catch (cause) {
      dispatch({ type: 'validationFailed', message: cause instanceof Error ? cause.message : 'Validation failed. Retry.' });
      setTimeout(() => errorRef.current?.focus(), 0);
    }
  }
  if (validation) {
    return <ReportConfirmation reportValidation={validation} onConfirm={onConfirm} onReject={() => {
      setValidation(null);
      dispatch({ type: 'reset' });
      onReject();
    }} />;
  }
  return <section aria-labelledby="report-paste-heading" style={card}>
    <h2 id="report-paste-heading">Paste your session report</h2>
    <p>The report will be validated and shown for review before any progression is applied.</p>
    <label htmlFor="report-text">Session report</label>
    <textarea id="report-text" value={state.report} rows={10} style={{ display: 'block', width: '100%' }}
      disabled={state.phase === 'validating'} onChange={event => dispatch({ type: 'edit', report: event.target.value })}
      aria-describedby="report-paste-help" />
    <p id="report-paste-help">Review the extracted evidence and warnings on the next screen.</p>
    {state.error && <div ref={errorRef} tabIndex={-1} role="alert">{state.error}</div>}
    <button type="button" disabled={state.phase === 'validating'} onClick={() => void validate()}>
      {state.phase === 'validating' ? 'Preparing preview…' : 'Preview report'}
    </button>
  </section>;
}
