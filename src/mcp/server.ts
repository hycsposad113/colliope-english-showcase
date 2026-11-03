// Extracted from a larger private codebase (CALLIOPE). Source: apps/mcp/src/server.ts, apps/mcp/src/tool-handlers.ts; adapted: SDK registration replaced by a transport-neutral port and local schemas.
import { z } from 'zod';
import { CalliopeClient, CalliopeClientError } from './calliope-client';

const base = z.object({ learnerId: z.string().min(1).optional() }).passthrough();
const date = base.extend({ localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const report = base.extend({ rawText: z.string().min(1), sessionPackId: z.string().min(1).optional() });
const reportId = base.extend({ reportId: z.string().min(1) });
const confirmation = reportId.extend({ confirmationToken: z.string().min(1) });
const pack = base.extend({ questInstanceId: z.string().min(1) });
type Client = Pick<CalliopeClient, 'getTodayMission' | 'prepareVoiceSession' | 'markSessionPackExported' | 'getProgress' | 'validateVoiceReport' | 'importVoiceReport' | 'confirmVoiceReport' | 'rejectVoiceReport'>;
type Input = Record<string, unknown>;
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  annotations: { readOnlyHint: boolean; idempotentHint: boolean; destructiveHint?: boolean };
  invoke(input: unknown): Promise<ToolResult>;
}
export interface ToolResult { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
export interface ToolRegistry { registerTool(definition: ToolDefinition): void }

/** An SDK adapter can map these definitions onto its own registration API. */
export function registerCalliopeTools(registry: ToolRegistry, client: Client): void {
  const definitions: Array<[string, string, z.ZodTypeAny, boolean, boolean, (input: Input) => Promise<unknown>, boolean?]> = [
    ['calliope_get_today_mission', 'Get or create a daily mission without awarding XP.', date, false, true, (i) => client.getTodayMission(i)],
    ['calliope_prepare_voice_session', 'Create or reuse a session pack, then mark it exported.', pack, false, true, async (i) => {
      const result = await client.prepareVoiceSession(i);
      const parsed = z.object({ sessionPackId: z.string().min(1) }).passthrough().parse(result);
      // Only mark exported after the complete response has been obtained.
      await client.markSessionPackExported(parsed.sessionPackId);
      return result;
    }],
    ['calliope_get_progress', 'Read learner progress.', base, true, true, (i) => client.getProgress(i)],
    ['calliope_validate_voice_report', 'Validate evidence without writing progression.', report, true, true, (i) => client.validateVoiceReport(i)],
    ['calliope_import_voice_report', 'Persist evidence pending learner confirmation.', report, false, true, (i) => client.importVoiceReport(i)],
    ['calliope_confirm_voice_report', 'Apply progression after explicit learner confirmation.', confirmation, false, false, (i) => client.confirmVoiceReport(i), true],
    ['calliope_reject_voice_report', 'Reject pending evidence without awarding XP.', reportId, false, true, (i) => client.rejectVoiceReport(i), false],
  ];
  for (const [name, description, inputSchema, readOnlyHint, idempotentHint, handler, destructiveHint] of definitions) {
    registry.registerTool({ name, description, inputSchema, annotations: { readOnlyHint, idempotentHint, ...(destructiveHint === undefined ? {} : { destructiveHint }) },
      async invoke(input) {
        try {
          const parsed = inputSchema.parse(input) as Input;
          return { content: [{ type: 'text', text: JSON.stringify(await handler(parsed)) }] };
        } catch (error) {
          const message = error instanceof CalliopeClientError ? error.message : error instanceof z.ZodError ? 'CALLIOPE tool input did not match the required schema.' : 'CALLIOPE tool request failed. Check the local API and retry only read operations.';
          return { content: [{ type: 'text', text: message }], isError: true };
        }
      },
    });
  }
}
