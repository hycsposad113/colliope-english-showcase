// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/prompts/final-report.prompt.ts; adapted: local contracts and embedded fallback, no private template file access.
import { createVoiceSessionReportV2Template } from '../contracts/live-training.js';

type ReportSchemaVersion = '1.0' | '2.0';

const LEGACY_RECOVERY_PROMPT = `# CALLIOPE ChatGPT Live Report Recovery Prompt

Use this only in the same ChatGPT conversation after a CALLIOPE voice mission when the normal end command did not produce an importable report.

The CALLIOPE voice mission has ended. Do not continue the roleplay.

Reconstruct the final report using only evidence actually available in this conversation. Do not invent exact timing, speaking duration, quotes, pronunciation facts, success criteria, or scores. Use null, empty arrays, and not_observed whenever evidence is unavailable.

Session Pack ID: {{SESSION_PACK_ID}}
Mission title: {{MISSION_TITLE}}

Output exactly one report block using schema version 1.0:
CALLIOPE_REPORT_BEGIN
one valid JSON object matching the original CALLIOPE Session Pack schema
CALLIOPE_REPORT_END

Do not use Markdown fences. Do not add a preface or closing sentence. Preserve the exact Session Pack ID. If you cannot find the original schema, say only CALLIOPE_REPORT_SCHEMA_MISSING.`;

function readRecoveryTemplate(): string {
  return `The CALLIOPE voice mission has ended.\nSession Pack ID: {{SESSION_PACK_ID}}\nMission title: {{MISSION_TITLE}}\nGrammar focus ID: {{GRAMMAR_FOCUS_ID}}`;
}

export function renderFinalReportRecoveryPrompt(
  sessionPackId: string,
  missionTitle: string,
  reportSchemaVersion: ReportSchemaVersion = '2.0',
  grammarFocusId = 'grammar_register_focus',
): string {
  if (reportSchemaVersion === '1.0') {
    return LEGACY_RECOVERY_PROMPT.replaceAll(
      '{{SESSION_PACK_ID}}',
      sessionPackId,
    ).replaceAll('{{MISSION_TITLE}}', missionTitle);
  }

  const template = readRecoveryTemplate();
  const schemaExample = createVoiceSessionReportV2Template({
    sessionPackId,
    missionTitle,
    grammarFocusId,
  });

  const rendered = template
    .replaceAll('{{SESSION_PACK_ID}}', sessionPackId)
    .replaceAll('{{MISSION_TITLE}}', missionTitle)
    .replaceAll('{{GRAMMAR_FOCUS_ID}}', grammarFocusId);

  return [
    rendered,
    '',
    '## Schema 2.0 completeness check',
    '',
    'The JSON object must retain these required fields: `schemaVersion`, `sessionPackId`, `completion`, `mission`, `assessment`, `strengths`, `corrections`, `targetLanguageUsed`, `targetLanguageMissed`, `notableMoments`, `learnerSelfReflection`, `nextSessionRecommendation`, `reportConfidence`, `unobservedFields`, `segmentResults`, `grammarUsage`, `languageGrowth`, and top-level `upgradeNudges`.',
    '',
    'The following is a schema-valid empty shape. Use it only as a structural guide and replace values only with evidence from the conversation:',
    '',
    '```json',
    JSON.stringify(schemaExample, null, 2),
    '```',
  ].join('\n');
}
