// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/live-training.ts, mcp.ts and packages/course-schema/src/index.ts; adapted: synthetic offline tests.
import { describe, expect, it } from 'vitest';
import { createVoiceSessionReportV2Template, VoiceSessionReportV2Schema } from '../../src/contracts/live-training.js';
import { McpConfirmVoiceReportInputSchema, findForbiddenMcpOutputField } from '../../src/contracts/mcp.js';
import { ModalitiesSchema } from '../../src/contracts/course.js';
describe('contracts', () => {
 it('validates the report template and rejects duplicate segments', () => {
  const data = createVoiceSessionReportV2Template({ sessionPackId: 'pack', missionTitle: 'Practice', grammarFocusId: 'focus' });
  expect(VoiceSessionReportV2Schema.safeParse(data).success).toBe(true);
  data.segmentResults[1] = data.segmentResults[0]; expect(VoiceSessionReportV2Schema.safeParse(data).success).toBe(false);
 });
 it('rejects unsafe nested output fields and invalid confirmations', () => {
  expect(findForbiddenMcpOutputField({ nested: { rawText: 'synthetic' } })).not.toBeNull();
  expect(McpConfirmVoiceReportInputSchema.safeParse({}).success).toBe(false);
 });
 it('checks modality totals', () => { expect(ModalitiesSchema.safeParse({ speaking: 0.8, listening: 0.8, reading: 0, writing: 0 }).success).toBe(false); });
});
