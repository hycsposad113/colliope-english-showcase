// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/common/extract-calliope-report.ts; adapted: local imports and framework-free execution.
import {
  VoiceSessionReportSchema,
  VoiceSessionReport,
  VoiceSessionReportV1Schema,
  VoiceSessionReportV2Schema,
} from '../contracts/live-training.js';

export interface ExtractionResult {
  success: boolean;
  report?: VoiceSessionReport;
  rawJson?: string;
  error?: string;
  recoveryHint?: string;
}

const BEGIN = 'CALLIOPE_REPORT_BEGIN';
const END = 'CALLIOPE_REPORT_END';

/**
 * Require exactly one ordered delimiter pair.
 * Delimiterless JSON is rejected (not silently trusted).
 */
export function extractCalliopeReport(rawText: string): ExtractionResult {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, error: 'Raw report text is empty or missing' };
  }

  const text = rawText;
  const beginMatches = text.match(/CALLIOPE_REPORT_BEGIN/g) || [];
  const endMatches = text.match(/CALLIOPE_REPORT_END/g) || [];

  if (beginMatches.length === 0 || endMatches.length === 0) {
    return {
      success: false,
      error:
        'Missing CALLIOPE report delimiters. Paste the full report including CALLIOPE_REPORT_BEGIN and CALLIOPE_REPORT_END.',
      recoveryHint:
        'In ChatGPT Live, say or type END CALLIOPE SESSION, then copy the entire generated report block with both delimiters.',
    };
  }

  if (beginMatches.length !== 1 || endMatches.length !== 1) {
    return {
      success: false,
      error: `Expected exactly one ordered delimiter pair, found BEGIN×${beginMatches.length} END×${endMatches.length}`,
      recoveryHint:
        'Copy only one final report block bounded by a single CALLIOPE_REPORT_BEGIN / CALLIOPE_REPORT_END pair.',
    };
  }

  const startIndex = text.indexOf(BEGIN) + BEGIN.length;
  const endIndex = text.indexOf(END);

  if (endIndex <= startIndex) {
    return {
      success: false,
      error: 'Report delimiters are out of order (END before BEGIN content)',
      recoveryHint:
        'Ensure CALLIOPE_REPORT_BEGIN appears before CALLIOPE_REPORT_END with JSON between them.',
    };
  }

  // Ensure END is the only structural end and appears after BEGIN.
  if (text.indexOf(END) < text.indexOf(BEGIN)) {
    return {
      success: false,
      error: 'Report delimiters are out of order',
      recoveryHint:
        'Ensure CALLIOPE_REPORT_BEGIN appears before CALLIOPE_REPORT_END.',
    };
  }

  const jsonStr = text.substring(startIndex, endIndex).trim();

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    const validated = VoiceSessionReportSchema.safeParse(parsed);

    if (!validated.success) {
      const version =
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>).schemaVersion
          : undefined;
      if (version !== '1.0' && version !== '2.0') {
        return {
          success: false,
          error: 'Schema validation failed for fields: schemaVersion',
          recoveryHint: 'Use report schemaVersion 2.0 for a new Session Pack.',
        };
      }
      const versioned =
        version === '2.0'
          ? VoiceSessionReportV2Schema.safeParse(parsed)
          : VoiceSessionReportV1Schema.safeParse(parsed);
      // Bounded public error only — Zod "received" values can echo learner content.
      const invalidPaths = [
        ...new Set(
          (versioned.success ? validated.error : versioned.error).issues
            .map((issue) => issue.path.filter(Boolean).join('.'))
            .filter((path) => path.length > 0),
        ),
      ].slice(0, 8);
      return {
        success: false,
        error:
          invalidPaths.length > 0
            ? `Schema validation failed for fields: ${invalidPaths.join(', ')}`
            : 'Schema validation failed',
        recoveryHint:
          'Regenerate the final report in ChatGPT with the required schema fields.',
      };
    }

    return {
      success: true,
      report: validated.data,
      rawJson: jsonStr,
    };
  } catch {
    return {
      success: false,
      error: 'JSON parsing failed',
      recoveryHint: 'Ensure the content between delimiters is valid JSON only.',
    };
  }
}

// Compatibility with the original showcase demo.
import { Report } from '../contracts/report.js';
export function extractReport(text: string): Report {
  const begin = 'CALLIOPE_REPORT_BEGIN', end = 'CALLIOPE_REPORT_END';
  if (text.split(begin).length !== 2 || text.split(end).length !== 2) throw new Error('Expected exactly one delimiter pair');
  const start = text.indexOf(begin) + begin.length, stop = text.indexOf(end);
  if (stop <= start) throw new Error('Report delimiters out of order');
  return Report.parse(JSON.parse(text.slice(start, stop).trim()));
}
export function scoreReport(report: Report): number { return report.score * 20; }
