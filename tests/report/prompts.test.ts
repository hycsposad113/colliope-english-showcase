// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/prompts/final-report.prompt.ts; adapted: synthetic offline tests.
import { describe, expect, it } from 'vitest';
import { renderFinalReportRecoveryPrompt } from '../../src/prompts/final-report.prompt.js';
describe('recovery prompts', () => {
 it('includes a schema 2 template with the requested pack ID', () => { const text = renderFinalReportRecoveryPrompt('synthetic-pack', 'Practice', '2.0', 'focus'); expect(text).toContain('synthetic-pack'); expect(text).toContain('"schemaVersion": "2.0"'); });
 it('uses the legacy report delimiter requirement', () => { const text = renderFinalReportRecoveryPrompt('synthetic-pack', 'Practice', '1.0'); expect(text).toContain('CALLIOPE_REPORT_BEGIN'); expect(text).toContain('CALLIOPE_REPORT_END'); });
});
