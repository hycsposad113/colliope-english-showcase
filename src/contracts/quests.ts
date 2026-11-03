// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/quests.ts; adapted: local imports and framework-free execution.
import { z } from "zod";

export const QuestTypeSchema = z.enum([
  "daily_protocol",
  "main_quest",
  "side_quest",
  "emergency_quest",
  "boss_encounter",
  "ascension_trial",
  "recovery_dungeon",
]);

export type QuestType = z.infer<typeof QuestTypeSchema>;

export const QuestStatusSchema = z.enum([
  "available",
  "accepted",
  "in_progress",
  "completed",
  "failed",
  "abandoned",
  "expired",
]);

export type QuestStatus = z.infer<typeof QuestStatusSchema>;

export const QuestDomainSchema = z.enum([
  "academic_expression",
  "expressive_power",
  "communication",
  "everyday_conversation",
]);

export type QuestDomain = z.infer<typeof QuestDomainSchema>;

export const QuestDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: QuestTypeSchema,
  domain: QuestDomainSchema,
  targetMinutes: z.number().positive(),
  targetSpeakingMinutes: z.number().positive(),
  baseXp: z.number().int().nonnegative(),
  successCriteria: z.array(z.string()),
  targetLanguage: z.array(z.string()),
  minLevel: z.number().int().nonnegative().optional(),
  requiredPrerequisites: z.array(z.string()).optional(),
});

export type QuestDefinition = z.infer<typeof QuestDefinitionSchema>;

export const QuestInstanceSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  playerId: z.string(),
  localDate: z.string(), // YYYY-MM-DD
  status: QuestStatusSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  earnedXp: z.number().int().nonnegative().nullable(),
  sessionPackId: z.string().nullable(),
  reportId: z.string().nullable(),
  definition: QuestDefinitionSchema.optional(),
});

export type QuestInstance = z.infer<typeof QuestInstanceSchema>;

export const DailyProtocolSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  localDate: z.string(),
  timezone: z.string(),
  mainQuestInstanceId: z.string(),
  sideQuestInstanceId: z.string().nullable(),
  status: z.enum([
    "pending",
    "in_progress",
    "full_clear",
    "partial_clear",
    "recovery_clear",
    "skipped",
    "excused",
    "aborted",
  ]),
  totalMinutesSpent: z.number().nonnegative(),
  totalSpeakingMinutes: z.number().nonnegative(),
  completedAt: z.string().nullable(),
});

export type DailyProtocol = z.infer<typeof DailyProtocolSchema>;
