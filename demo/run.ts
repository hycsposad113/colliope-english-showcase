// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/agent-jobs/agent-jobs.processor.ts, apps/api/src/live-training/session-pack.service.ts, apps/api/src/live-training/report-import.service.ts; adapted: offline synthetic orchestration with injected in-memory ports.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Proposal } from '../src/contracts/report.js';
import { createVoiceSessionReportV2Template } from '../src/contracts/live-training.js';
import { JobPipeline } from '../src/llm/job-pipeline.js';
import { assembleSessionPack } from '../src/report/session-pack.js';
import { extractCalliopeReport } from '../src/report/report-extract.js';
import { ImportError, ReportImportService } from '../src/report/report-import.js';
import { calculateDailyXp } from '../src/game/xp-policy.js';
import { FakeLocalCli, FakeStt, FakeTts, InMemoryQueue, InMemoryReportStore } from './fakes.js';

export async function runDemo(log: (line: string) => void = console.log) {
  const learner = 'synthetic-learner-01';
  const cli = new FakeLocalCli();
  const pipeline = new JobPipeline(new InMemoryQueue(), cli, {
    status: (_id, status) => log(`Job: ${status}`),
    event: (_id, event) => log(`Event: ${event.message.replace(/\n/g, ' ')}`),
  });
  const job = await pipeline.submit('synthetic-proposal', 'Create an interview speaking question.', Proposal);
  await pipeline.process(job.id);
  if (!job.result || job.status !== 'completed') throw new Error(`Proposal failed: ${job.error}`);
  log(`Proposal: ${job.result.question}`);
  const repairIncludedErrors = cli.inputs[1]?.includes('question:');
  if (!repairIncludedErrors) throw new Error('Repair prompt did not include validation errors');
  log('Repair retry: validation errors included in the second prompt');
  const pack = assembleSessionPack({ id: 'synthetic-pack-01', missionTitle: job.result.topic, targetLanguage: ['I contributed to the prototype'], successCriteria: [], preferredSessionMinutes: '30' });
  log(`Session pack: ${pack.id}, ${pack.targetMinutes} minutes, ${pack.phases.length} phases`);
  const audio = new FakeTts().synthesize(job.result.question);
  const transcript = new FakeStt().transcribe(audio);
  log(`Synthetic participant: ${transcript} (fake audio: ${audio.length} bytes)`);
  const report = createVoiceSessionReportV2Template({ sessionPackId: pack.id, missionTitle: pack.missionTitle, grammarFocusId: 'synthetic-focus' });
  report.completion.status = 'partial_clear';
  report.completion.durationMinutes = 30;
  report.completion.speakingMinutes = 20;
  const raw = `CALLIOPE_REPORT_BEGIN\n${JSON.stringify(report)}\nCALLIOPE_REPORT_END`;
  const extracted = extractCalliopeReport(raw);
  if (!extracted.success || !extracted.report) throw new Error(extracted.error);
  const score = calculateDailyXp({ completionStatus: report.completion.status, durationMinutes: 30, speakingMinutes: 20, reportConfidence: report.reportConfidence });
  log(`Report extracted and scored: ${score.totalAwarded} XP`);
  const store = new InMemoryReportStore();
  await store.seed({ id: pack.id, learnerId: learner, status: 'issued', expiresAt: 5000, reportSchemaVersion: '2.0', successCriteria: pack.successCriteria });
  const service = new ReportImportService(store, () => 1000);
  const imported = await service.importValidatedReport(learner, raw, pack.id);
  log(`Preview: ${imported.preview.status}, timing missing: ${imported.preview.timingEvidenceMissing}`);
  const replay = await service.importValidatedReport(learner, raw, pack.id);
  log(`Identical pending report replay: idempotent=${replay.idempotent}`);
  const beforeConfirmation = store.total(learner);
  log(`Before human confirmation: ${beforeConfirmation} XP`);
  const outcomes = await Promise.allSettled([
    service.confirm(imported.report.id, learner, { confirmed: true }),
    service.confirm(imported.report.id, learner, { confirmed: true }),
  ]);
  const fulfilled = outcomes.filter(result => result.status === 'fulfilled').length;
  const rejected = outcomes.length - fulfilled;
  const total = store.total(learner);
  let confirmedReplayRejected = false;
  try { await service.importValidatedReport(learner, raw, pack.id); }
  catch (error) {
    if (!(error instanceof ImportError) || error.code !== 'CONFLICT') throw error;
    confirmedReplayRejected = true;
  }
  if (!confirmedReplayRejected) throw new Error('Confirmed report replay unexpectedly accepted');
  log('Confirmed report replay: rejected; XP unchanged');
  log(`Human confirmation race: ${fulfilled} accepted, ${rejected} rejected`);
  log(`XP after confirmation: ${total}; replay awarded no additional XP`);
  const result = { attempts: job.attempts, repairIncludedErrors: Boolean(repairIncludedErrors), reportExtracted: extracted.success, replayIdempotent: replay.idempotent, beforeConfirmation, confirmedReplayRejected, fulfilled, rejected, total, expectedScore: score.totalAwarded };
  await mkdir('demo/out', { recursive: true });
  await writeFile('demo/out/result.json', JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDemo().catch(error => { console.error(error); process.exitCode = 1; });
}
