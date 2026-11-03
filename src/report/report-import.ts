// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/report-import.service.ts; adapted: framework-free service and transactional in-memory port.
import { randomUUID, createHash } from 'node:crypto';
import type { VoiceSessionReport } from '../contracts/live-training.js';
import { extractCalliopeReport, scoreReport } from './report-extract.js';
import { calculateDailyXp, reconcileSuccessCriteria, type SuccessCriterionRef } from '../game/xp-policy.js';
import type { Report } from '../contracts/report.js';
import { xpForScore } from '../game/xp-policy.js';

export type PackStatus = 'issued' | 'exported' | 'reported' | 'confirmed' | 'abandoned' | 'expired' | 'superseded';
export interface ReportPack {
  id: string;
  learnerId: string;
  status: PackStatus;
  expiresAt: number;
  reportSchemaVersion: '1.0' | '2.0';
  successCriteria: SuccessCriterionRef[];
}
export interface PendingReport {
  id: string;
  packId: string;
  learnerId: string;
  rawHash: string;
  report: VoiceSessionReport;
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  xp?: number;
}
export class ImportError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID' | 'CONFIRMATION_REQUIRED', message: string) { super(message); }
}
export interface ReportTransaction {
  getPack(id: string): ReportPack | undefined;
  getReport(id: string): PendingReport | undefined;
  findByPack(id: string): PendingReport | undefined;
  putPack(pack: ReportPack): void;
  putReport(report: PendingReport): void;
  addXp(learnerId: string, xp: number): void;
  audit?(event: ReportAuditEvent): void;
}
export interface ReportStore {
  transaction<T>(operation: (tx: ReportTransaction) => T | Promise<T>): Promise<T>;
}
export interface ReportAuditEvent { packId: string; learnerId: string; action: string; at: number; reportId?: string }
interface State { audits: ReportAuditEvent[]; packs: Map<string, ReportPack>; reports: Map<string, PendingReport>; totals: Map<string, number> }

/** Serializes transactions and commits a copy only after success; this simulates
 * atomic rollback within one process, not a durable or distributed database. */
export class InMemoryReportStore implements ReportStore {
  private state: State = { audits: [], packs: new Map(), reports: new Map(), totals: new Map() };
  private tail: Promise<void> = Promise.resolve();
  async transaction<T>(operation: (tx: ReportTransaction) => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      const copy: State = structuredClone(this.state);
      const tx: ReportTransaction = {
        getPack: id => copy.packs.get(id),
        getReport: id => copy.reports.get(id),
        findByPack: id => [...copy.reports.values()].find(row => row.packId === id),
        putPack: pack => { copy.packs.set(pack.id, structuredClone(pack)); },
        putReport: report => { copy.reports.set(report.id, structuredClone(report)); },
        addXp: (id, xp) => { copy.totals.set(id, (copy.totals.get(id) ?? 0) + xp); },
        audit: event => { copy.audits.push(structuredClone(event)); },
      };
      const result = await operation(tx);
      this.state = copy;
      return structuredClone(result);
    } finally { release(); }
  }
  async seed(pack: ReportPack): Promise<void> { await this.transaction(tx => tx.putPack(pack)); }
  total(id: string): number { return this.state.totals.get(id) ?? 0; }
  audits(): ReportAuditEvent[] { return structuredClone(this.state.audits); }
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function active(pack: ReportPack, now: number): boolean {
  return pack.expiresAt > now && ['issued', 'exported', 'reported'].includes(pack.status);
}
function owned(pack: ReportPack | undefined, learnerId: string): asserts pack is ReportPack {
  if (!pack) throw new ImportError('NOT_FOUND', 'Session Pack not found');
  if (pack.learnerId !== learnerId) throw new ImportError('FORBIDDEN', 'Session Pack does not belong to learner');
}
const transitions: Record<PackStatus, readonly PackStatus[]> = {
  issued: ['exported', 'reported', 'abandoned', 'expired', 'superseded'],
  exported: ['reported', 'abandoned', 'expired', 'superseded'],
  reported: ['confirmed', 'abandoned', 'expired', 'superseded'],
  confirmed: [], abandoned: [], expired: [], superseded: [],
};
export function assertPackTransition(from: PackStatus, to: PackStatus): void {
  if (!transitions[from].includes(to)) {
    throw new ImportError('CONFLICT', `Invalid Session Pack transition: ${from} → ${to}`);
  }
}
export interface ReportPreview {
  sessionPackId: string;
  status: VoiceSessionReport['completion']['status'];
  timingEvidenceMissing: boolean;
  confidence: number;
  criteriaIssues: string[];
}
export class ReportImportService {
  constructor(private readonly store: ReportStore, private readonly now: () => number = Date.now) {}
  async transitionPack(packId: string, learnerId: string, to: PackStatus): Promise<ReportPack> {
    return this.store.transaction(tx => {
      const pack = tx.getPack(packId);
      owned(pack, learnerId);
      assertPackTransition(pack.status, to);
      if (to !== 'expired' && pack.expiresAt <= this.now()) {
        throw new ImportError('CONFLICT', 'Session Pack has expired');
      }
      if (to === 'expired' && pack.expiresAt > this.now()) {
        throw new ImportError('CONFLICT', 'Session Pack has not expired');
      }
      const updated = { ...pack, status: to };
      tx.putPack(updated);
      tx.audit?.({ packId, learnerId, action: `pack.${to}`, at: this.now() });
      return updated;
    });
  }
  async validateReport(learnerId: string, rawText: string, expectedPackId?: string): Promise<{ report: VoiceSessionReport; preview: ReportPreview }> {
    const extraction = extractCalliopeReport(rawText);
    if (!extraction.success || !extraction.report) throw new ImportError('INVALID', extraction.error ?? 'Report validation failed');
    const report = extraction.report;
    if (expectedPackId && report.sessionPackId !== expectedPackId) throw new ImportError('INVALID', 'Session Pack ID mismatch');
    return this.store.transaction(tx => {
      const pack = tx.getPack(report.sessionPackId);
      owned(pack, learnerId);
      if (!active(pack, this.now())) throw new ImportError('CONFLICT', 'Session Pack cannot accept evidence');
      if (pack.reportSchemaVersion !== report.schemaVersion) throw new ImportError('INVALID', 'Report schema version mismatch');
      const criteria = reconcileSuccessCriteria(pack.successCriteria, report.mission.successCriteriaMet, report.mission.successCriteriaMissed);
      // Missing mandatory IDs are tolerated for partial reports; invented or contradictory IDs are not.
      const blocking = criteria.issues.filter(issue => report.completion.status === 'full_clear' || !issue.startsWith('mandatory criterion'));
      if (blocking.length) throw new ImportError('INVALID', 'Report success criteria do not match the Session Pack');
      return { report, preview: { sessionPackId: pack.id, status: report.completion.status, timingEvidenceMissing: report.completion.durationMinutes == null || report.completion.speakingMinutes == null, confidence: report.reportConfidence ?? 0, criteriaIssues: criteria.issues } };
    });
  }
  async importValidatedReport(learnerId: string, rawText: string, expectedPackId?: string): Promise<{ report: PendingReport; idempotent: boolean; preview: ReportPreview }> {
    const validated = await this.validateReport(learnerId, rawText, expectedPackId);
    const rawHash = digest(rawText);
    return this.store.transaction(tx => {
      const pack = tx.getPack(validated.report.sessionPackId);
      owned(pack, learnerId);
      const existing = tx.findByPack(pack.id);
      if (existing) {
        if (existing.status === 'pending_confirmation' && existing.rawHash === rawHash && active(pack, this.now())) return { report: existing, idempotent: true, preview: validated.preview };
        throw new ImportError('CONFLICT', 'Session Pack already has report evidence');
      }
      if (!active(pack, this.now()) || pack.status === 'reported') throw new ImportError('CONFLICT', 'Session Pack cannot accept a new report');
      const report: PendingReport = { id: randomUUID(), packId: pack.id, learnerId, rawHash, report: validated.report, status: 'pending_confirmation' };
      assertPackTransition(pack.status, 'reported');
      tx.putReport(report);
      tx.putPack({ ...pack, status: 'reported' });
      tx.audit?.({ packId: pack.id, learnerId, reportId: report.id, action: 'report.imported', at: this.now() });
      return { report, idempotent: false, preview: validated.preview };
    });
  }
  async confirm(reportId: string, learnerId: string, options: { confirmed: boolean; acceptMissingTiming?: boolean } = { confirmed: false }): Promise<PendingReport> {
    if (!options.confirmed) throw new ImportError('CONFIRMATION_REQUIRED', 'Explicit confirmation required');
    return this.store.transaction(tx => {
      const row = tx.getReport(reportId);
      if (!row) throw new ImportError('NOT_FOUND', 'Report not found');
      if (row.learnerId !== learnerId) throw new ImportError('FORBIDDEN', 'Report does not belong to learner');
      if (row.status !== 'pending_confirmation') throw new ImportError('CONFLICT', 'Report is not pending confirmation');
      const pack = tx.getPack(row.packId);
      owned(pack, learnerId);
      if (!active(pack, this.now()) || pack.status !== 'reported') throw new ImportError('CONFLICT', 'Session Pack cannot be confirmed');
      const parsed = extractCalliopeReport(`CALLIOPE_REPORT_BEGIN\n${JSON.stringify(row.report)}\nCALLIOPE_REPORT_END`);
      if (!parsed.success || !parsed.report || parsed.report.sessionPackId !== pack.id || parsed.report.schemaVersion !== pack.reportSchemaVersion) {
        throw new ImportError('INVALID', 'Stored report no longer matches the Session Pack');
      }
      const criteria = reconcileSuccessCriteria(pack.successCriteria, row.report.mission.successCriteriaMet, row.report.mission.successCriteriaMissed);
      const blocking = criteria.issues.filter(issue => row.report.completion.status === 'full_clear' || !issue.startsWith('mandatory criterion'));
      if (blocking.length) throw new ImportError('INVALID', 'Report success criteria do not match the Session Pack');
      const completion = row.report.completion;
      if ((completion.durationMinutes == null || completion.speakingMinutes == null) && !options.acceptMissingTiming) throw new ImportError('CONFIRMATION_REQUIRED', 'Missing timing requires explicit acknowledgement');
      const xp = calculateDailyXp({ completionStatus: completion.status, durationMinutes: completion.durationMinutes, speakingMinutes: completion.speakingMinutes, mainDungeonCompleted: completion.phasesCompleted.includes('main_dungeon'), pressureEncounterCompleted: completion.pressureEncounterCompleted, reportConfidence: row.report.reportConfidence, packSuccessCriteria: pack.successCriteria, successCriteriaMet: row.report.mission.successCriteriaMet, successCriteriaMissed: row.report.mission.successCriteriaMissed });
      const updated: PendingReport = { ...row, status: 'confirmed', xp: xp.totalAwarded };
      assertPackTransition(pack.status, 'confirmed');
      tx.putReport(updated);
      tx.putPack({ ...pack, status: 'confirmed' });
      tx.audit?.({ packId: pack.id, learnerId, reportId, action: 'report.confirmed', at: this.now() });
      tx.addXp(learnerId, xp.totalAwarded);
      return updated;
    });
  }
  async reject(reportId: string, learnerId: string): Promise<void> {
    await this.store.transaction(tx => {
      const row = tx.getReport(reportId);
      if (!row) throw new ImportError('NOT_FOUND', 'Report not found');
      if (row.learnerId !== learnerId) throw new ImportError('FORBIDDEN', 'Report does not belong to learner');
      if (row.status !== 'pending_confirmation') throw new ImportError('CONFLICT', 'Report is not pending confirmation');
      tx.putReport({ ...row, status: 'rejected' });
      tx.audit?.({ packId: row.packId, learnerId, reportId, action: 'report.rejected', at: this.now() });
    });
  }
}
// Compatibility with the original showcase demo.
export type Receipt = { id: string; learnerId: string; xp: number };
export class InMemoryStore {
  private receipts = new Map<string, Receipt>();
  private totals = new Map<string, number>();
  confirm(id: string, report: Report, approved: boolean): Receipt {
    if (!approved) throw new Error('Explicit confirmation required');
    const existing = this.receipts.get(id);
    if (existing) { if (existing.learnerId !== report.learnerId) throw new Error('Idempotency key conflict'); return existing; }
    const receipt = { id, learnerId: report.learnerId, xp: xpForScore(scoreReport(report)) };
    this.receipts.set(id, receipt); this.totals.set(report.learnerId, (this.totals.get(report.learnerId) ?? 0) + receipt.xp); return receipt;
  }
  total(learnerId: string): number { return this.totals.get(learnerId) ?? 0; }
}
