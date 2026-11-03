// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/mcp.ts; adapted: local imports and framework-free execution.
import { z } from "zod";

const MAX_REPORT_CHARS = 1_000_000;

export const McpLocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Expected a real calendar date");

const OptionalLearnerSchema = z.object({
  learnerId: z.string().min(1).max(200).optional(),
});

export const McpGetTodayMissionInputSchema = OptionalLearnerSchema.extend({
  localDate: McpLocalDateSchema,
});

export const McpPrepareVoiceSessionInputSchema = OptionalLearnerSchema.extend({
  questInstanceId: z.string().min(1).max(200),
  curriculumPlanId: z.string().min(1).max(200).optional(),
  academicScenarioId: z.string().min(1).max(200).optional(),
  lifeScenarioId: z.string().min(1).max(200).optional(),
  learnerSituation: z.string().min(1).max(1000).optional(),
  mode: z.enum(["current", "alternate", "user"]).optional(),
});

export const McpGetProgressInputSchema = OptionalLearnerSchema;

export const McpValidateVoiceReportInputSchema = z.object({
  sessionPackId: z.string().min(1).max(200),
  rawText: z.string().min(1).max(MAX_REPORT_CHARS),
});

export const McpImportVoiceReportInputSchema =
  McpValidateVoiceReportInputSchema.extend(OptionalLearnerSchema.shape);

export const McpConfirmVoiceReportInputSchema = z
  .object({
    reportId: z.string().min(1).max(200),
    confirmationToken: z.string().min(16).max(512),
    confirmedSpeakingMinutes: z.number().finite().min(0).max(240).optional(),
    confirmedDurationMinutes: z.number().finite().min(0).max(360).optional(),
    confirmedSelfReflection: z.string().min(1).max(10_000).optional(),
    acceptMissingTiming: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.confirmedSpeakingMinutes !== undefined &&
      value.confirmedDurationMinutes !== undefined &&
      value.confirmedSpeakingMinutes > value.confirmedDurationMinutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmedSpeakingMinutes"],
        message: "Speaking minutes must not exceed duration minutes",
      });
    }
  });

export const McpRejectVoiceReportInputSchema = z.object({
  reportId: z.string().min(1).max(200),
});

const McpDailyProtocolStatusSchema = z.enum([
  "pending",
  "in_progress",
  "full_clear",
  "partial_clear",
  "recovery_clear",
  "skipped",
  "excused",
  "aborted",
]);

export const MCP_FORBIDDEN_OUTPUT_KEYS = [
  "confirmationToken",
  "confirmationTokenExpiresAt",
  "confirmationTokenHash",
  "confirmationTokenConsumedAt",
  "rawExtractedJson",
  "rawText",
  "rawJson",
  "extractedReport",
  "extractedJson",
  "filePath",
  "notePath",
  "last_wav_path",
  "wav_path",
  "preview",
] as const;

const MCP_PATH_LEAK =
  /(\/Users\/|\/tmp\/|\/private\/|\/var\/folders\/|[A-Za-z]:\\)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findForbiddenMcpOutputField(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findForbiddenMcpOutputField(item);
      if (nested) return nested;
    }
    return null;
  }
  if (!isRecord(value)) {
    if (typeof value === "string" && MCP_PATH_LEAK.test(value)) {
      return "filesystem path";
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      (MCP_FORBIDDEN_OUTPUT_KEYS as readonly string[]).includes(key) ||
      /token/i.test(key)
    ) {
      return key;
    }
    const nested = findForbiddenMcpOutputField(child);
    if (nested) return nested;
  }
  return null;
}

function withMcpOutputGuard<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    const leak = findForbiddenMcpOutputField(value);
    if (leak) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `MCP output must not expose ${leak}`,
      });
    }
  }) as unknown as T;
}

const McpQuestSummarySchema = z
  .object({
    id: z.string().min(1).max(200),
    status: z.string().min(1).max(80),
    title: z.string().min(1).max(300).optional(),
    targetMinutes: z.number().int().min(1).max(360).optional(),
    targetSpeakingMinutes: z.number().int().min(0).max(360).optional(),
  })
  .strict();

const McpDailySessionPlanSchema = z
  .object({
    toolkitMinutes: z.literal(3),
    academicMinutes: z.literal(16),
    lifeMinutes: z.literal(9),
    debriefMinutes: z.literal(2),
    totalMinutes: z.literal(30),
  })
  .strict();

export const McpGetTodayMissionOutputSchema = withMcpOutputGuard(
  z
    .object({
      protocol: z
        .object({
          id: z.string().min(1).max(200),
          localDate: McpLocalDateSchema,
          status: McpDailyProtocolStatusSchema,
        })
        .strict(),
      mainQuest: McpQuestSummarySchema.nullable(),
      sideQuest: McpQuestSummarySchema.nullable(),
      academicQuest: McpQuestSummarySchema.nullable().optional(),
      lifeQuest: McpQuestSummarySchema.nullable().optional(),
      dailySessionPlan: McpDailySessionPlanSchema.optional(),
    })
    .strict(),
);

export const McpPrepareVoiceSessionOutputSchema = withMcpOutputGuard(
  z
    .object({
      sessionPackId: z.string().min(1).max(200),
      expiresAt: z.string().datetime({ offset: true }),
      targetMinutes: z.number().int().min(1).max(360),
      targetSpeakingMinutes: z.number().int().min(0).max(360),
      renderedCoachPrompt: z.string().min(1).max(50_000),
      idempotent: z.boolean(),
    })
    .strict()
    .refine(
      (value) => value.targetSpeakingMinutes <= value.targetMinutes,
      "targetSpeakingMinutes must not exceed targetMinutes",
    ),
);

export const McpGetProgressOutputSchema = withMcpOutputGuard(
  z
    .object({
      currentLevel: z.number().int().positive(),
      totalXp: z.number().finite().nonnegative(),
      currentStreak: z.number().int().nonnegative(),
      voiceProvider: z.literal("chatgpt-live-bridge"),
    })
    .strict(),
);

const McpInvalidReportOutputSchema = withMcpOutputGuard(
  z
    .object({
      valid: z.literal(false),
      error: z.string().min(1).max(500),
      recoveryHint: z.string().min(1).max(500).optional(),
      sessionPackId: z.string().min(1).max(200).optional(),
    })
    .strict(),
);

export const McpValidateVoiceReportOutputSchema = z.union([
  McpInvalidReportOutputSchema,
  withMcpOutputGuard(
    z
      .object({
        valid: z.literal(true),
        sessionPackId: z.string().min(1).max(200),
        reportConfidence: z.number().finite().min(0).max(1),
        timingEvidenceMissing: z.boolean(),
        requiresTimingConfirmation: z.boolean(),
        confirmationRequired: z.literal(true),
      })
      .strict(),
  ),
]);

export const McpImportVoiceReportOutputSchema = z.union([
  McpInvalidReportOutputSchema,
  withMcpOutputGuard(
    z
      .object({
        valid: z.literal(true),
        reportId: z.string().min(1).max(200),
        sessionPackId: z.string().min(1).max(200),
        status: z.enum(["pending_confirmation", "confirmed", "rejected"]),
        reportConfidence: z.number().finite().min(0).max(1),
        idempotent: z.boolean(),
        confirmationRequired: z.literal(true),
      })
      .strict(),
  ),
]);

export const McpConfirmVoiceReportOutputSchema = withMcpOutputGuard(
  z
    .object({
      success: z.literal(true),
      reportId: z.string().min(1).max(200),
      xpAwarded: z.number().finite().min(0),
      newTotalXp: z.number().finite().min(0),
      newLevel: z.number().int().positive(),
      currentStreak: z.number().int().nonnegative(),
    })
    .strict(),
);

export const McpRejectVoiceReportOutputSchema = withMcpOutputGuard(
  z
    .object({
      success: z.literal(true),
      reportId: z.string().min(1).max(200),
      status: z.literal("rejected"),
      awards: z.number().int().nonnegative(),
    })
    .strict(),
);

export function parseMcpToolOutput<T>(
  schema: { parse: (input: unknown) => T },
  value: unknown,
): T {
  const leak = findForbiddenMcpOutputField(value);
  if (leak) {
    throw new Error(`MCP output must not expose ${leak}`);
  }
  return schema.parse(value);
}

export type McpGetTodayMissionInput = z.infer<
  typeof McpGetTodayMissionInputSchema
>;
export type McpPrepareVoiceSessionInput = z.infer<
  typeof McpPrepareVoiceSessionInputSchema
>;
export type McpGetProgressInput = z.infer<typeof McpGetProgressInputSchema>;
export type McpValidateVoiceReportInput = z.infer<
  typeof McpValidateVoiceReportInputSchema
>;
export type McpImportVoiceReportInput = z.infer<
  typeof McpImportVoiceReportInputSchema
>;
export type McpConfirmVoiceReportInput = z.infer<
  typeof McpConfirmVoiceReportInputSchema
>;
export type McpRejectVoiceReportInput = z.infer<
  typeof McpRejectVoiceReportInputSchema
>;
