// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/mcp-bridge.controller.ts; adapted: NestJS endpoints and private projections replaced by injected service ports and zod validation.
import { z } from 'zod';
const learnerInput = z.object({ learnerId: z.string().min(1).optional() }).passthrough();
const dateInput = learnerInput.extend({ localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const packInput = learnerInput.extend({ questInstanceId: z.string().min(1), curriculumPlanId: z.string().optional() });
const reportInput = learnerInput.extend({ rawText: z.string().min(1), sessionPackId: z.string().optional() });
const confirmInput = z.object({ reportId: z.string().min(1), confirmationToken: z.string().min(1), confirmedSpeakingMinutes: z.number().nonnegative().optional(), confirmedDurationMinutes: z.number().nonnegative().optional(), confirmedSelfReflection: z.unknown().optional(), acceptMissingTiming: z.boolean().optional() });
export interface BridgePorts {
  resolveLearner(id?: string): Promise<string>;
  getOrCreateMission(learnerId: string, localDate: string): Promise<unknown>;
  createSessionPack(learnerId: string, input: z.infer<typeof packInput>): Promise<unknown>;
  getProgress(learnerId: string): Promise<unknown>;
  validateReport(rawText: string, sessionPackId?: string): Promise<unknown>;
  importReport(learnerId: string, rawText: string, sessionPackId?: string): Promise<unknown>;
  confirmReport(id: string, learnerId: string, details: z.infer<typeof confirmInput>): Promise<unknown>;
  rejectReport(id: string, learnerId: string): Promise<unknown>;
  project(operation: string, value: unknown): unknown;
}
export class BridgeInputError extends Error { readonly status = 400 }
export class BridgeProjectionError extends Error { readonly status = 500 }
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BridgeInputError(parsed.error.issues.map(i => i.message).join('; '));
  return parsed.data;
}
export class McpBridge {
  constructor(private readonly ports: BridgePorts) {}
  private project(operation: string, value: unknown): unknown {
    try { return this.ports.project(operation, value); }
    catch { throw new BridgeProjectionError('MCP output did not match the required projection'); }
  }
  async todayMission(query: unknown) {
    const input = parse(dateInput, query);
    const learner = await this.ports.resolveLearner(input.learnerId);
    return this.project('todayMission', await this.ports.getOrCreateMission(learner, input.localDate));
  }
  async prepareSession(body: unknown) {
    const input = parse(packInput, body);
    const learner = await this.ports.resolveLearner(input.learnerId);
    return this.project('prepareSession', await this.ports.createSessionPack(learner, input));
  }
  async progress(query: unknown) {
    const input = parse(learnerInput, query);
    return this.project('progress', await this.ports.getProgress(await this.ports.resolveLearner(input.learnerId)));
  }
  async validateReport(body: unknown) {
    const input = parse(reportInput, body);
    return this.project('validateReport', await this.ports.validateReport(input.rawText, input.sessionPackId));
  }
  async importReport(body: unknown) {
    const input = parse(reportInput, body);
    const learner = await this.ports.resolveLearner(input.learnerId);
    // Import persists pending evidence; it does not apply progression.
    return this.project('importReport', await this.ports.importReport(learner, input.rawText, input.sessionPackId));
  }
  async confirmReport(id: string, body: unknown) {
    const input = parse(confirmInput, body);
    if (input.reportId !== id) throw new BridgeInputError('reportId must match the request path');
    const learner = await this.ports.resolveLearner();
    return this.project('confirmReport', await this.ports.confirmReport(id, learner, input));
  }
  async rejectReport(id: string) {
    const learner = await this.ports.resolveLearner();
    return this.project('rejectReport', await this.ports.rejectReport(id, learner));
  }
}
