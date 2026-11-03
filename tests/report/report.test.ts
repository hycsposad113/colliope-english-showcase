// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/report-import.service.spec.ts and apps/api/src/common/extract-calliope-report.spec.ts; adapted: synthetic offline tests.
import { describe, expect, it } from 'vitest';
import { createVoiceSessionReportV2Template } from '../../src/contracts/live-training.js';
import { extractCalliopeReport } from '../../src/report/report-extract.js';
import { InMemoryReportStore, ReportImportService } from '../../src/report/report-import.js';
const report = () => createVoiceSessionReportV2Template({ sessionPackId: 'pack-synthetic', missionTitle: 'Practice', grammarFocusId: 'focus-synthetic' });
const raw = () => { const data = report(); data.completion.status = 'partial_clear'; data.completion.durationMinutes = 30; data.completion.speakingMinutes = 20; return `CALLIOPE_REPORT_BEGIN\n${JSON.stringify(data)}\nCALLIOPE_REPORT_END`; };
async function setup() {
 const store = new InMemoryReportStore();
 await store.seed({ id: 'pack-synthetic', learnerId: 'learner-synthetic', status: 'issued', expiresAt: 5000, reportSchemaVersion: '2.0', successCriteria: [] });
 return { store, service: new ReportImportService(store, () => 1000) };
}
describe('report pipeline', () => {
 it('extracts valid reports and rejects missing or duplicated delimiters', () => {
  expect(extractCalliopeReport(raw()).success).toBe(true);
  expect(extractCalliopeReport('{}').success).toBe(false);
  expect(extractCalliopeReport(raw() + raw()).success).toBe(false);
 });
 it('retries the same pending import without duplicating it', async () => {
  const { service } = await setup();
  const first = await service.importValidatedReport('learner-synthetic', raw());
  const second = await service.importValidatedReport('learner-synthetic', raw());
  expect(second.idempotent).toBe(true); expect(second.report.id).toBe(first.report.id);
 });
 it('accepts only one concurrent confirmation', async () => {
  const { service, store } = await setup();
  const imported = await service.importValidatedReport('learner-synthetic', raw());
  const results = await Promise.allSettled([service.confirm(imported.report.id, 'learner-synthetic', { confirmed: true, acceptMissingTiming: true }), service.confirm(imported.report.id, 'learner-synthetic', { confirmed: true, acceptMissingTiming: true })]);
  expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
  expect(store.total('learner-synthetic')).toBe(60);
 });
 it('requires confirmation and rolls back failed transactions', async () => {
  const { service, store } = await setup();
  const imported = await service.importValidatedReport('learner-synthetic', raw());
  await expect(service.confirm(imported.report.id, 'learner-synthetic')).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  await expect(store.transaction(tx => { tx.addXp('learner-synthetic', 99); throw new Error('fail'); })).rejects.toThrow();
  expect(store.total('learner-synthetic')).toBe(0);
 });
});

describe('report lifecycle boundaries', () => {
 it('rejects expired evidence without awarding XP', async () => {
  const store = new InMemoryReportStore();
  await store.seed({ id: 'pack-synthetic', learnerId: 'learner-synthetic', status: 'issued', expiresAt: 1000, reportSchemaVersion: '2.0', successCriteria: [] });
  const service = new ReportImportService(store, () => 1000);
  await expect(service.importValidatedReport('learner-synthetic', raw())).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await service.transitionPack('pack-synthetic', 'learner-synthetic', 'expired')).status).toBe('expired');
  expect(store.total('learner-synthetic')).toBe(0);
 });
 it('rejects illegal transitions and another learner', async () => {
  const { service } = await setup();
  await expect(service.transitionPack('pack-synthetic', 'learner-synthetic', 'confirmed')).rejects.toMatchObject({ code: 'CONFLICT' });
  const imported = await service.importValidatedReport('learner-synthetic', raw());
  await expect(service.confirm(imported.report.id, 'other', { confirmed: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
 });
 it('records import and confirmation only after successful transactions', async () => {
  const { service, store } = await setup();
  const imported = await service.importValidatedReport('learner-synthetic', raw());
  await service.confirm(imported.report.id, 'learner-synthetic', { confirmed: true });
  expect(store.audits().map(e => e.action)).toEqual(['report.imported', 'report.confirmed']);
 });
 it('rejects confirmation after a pack is superseded', async () => {
  const { service, store } = await setup();
  const imported = await service.importValidatedReport('learner-synthetic', raw());
  await service.transitionPack('pack-synthetic', 'learner-synthetic', 'superseded');
  await expect(service.confirm(imported.report.id, 'learner-synthetic', { confirmed: true })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.total('learner-synthetic')).toBe(0);
 });
});
