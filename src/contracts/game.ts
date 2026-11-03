// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/game.ts; adapted: local imports and framework-free execution.
import { z } from "zod";

export const V1_SKILL_DIMENSIONS = [
  "voice",
  "flow",
  "structure",
  "lexicon",
  "presence",
  "perception",
] as const;

export const V2_SKILL_DIMENSIONS = [
  "range",
  "accuracy",
  "fluency",
  "interaction",
  "coherence",
  "intelligibility",
] as const;

export const SkillDimensionV1Schema = z.enum(V1_SKILL_DIMENSIONS);
export const SkillDimensionV2Schema = z.enum(V2_SKILL_DIMENSIONS);
export const SkillDimensionSchema = z.enum([
  ...V1_SKILL_DIMENSIONS,
  ...V2_SKILL_DIMENSIONS,
]);

export type SkillDimensionV1 = z.infer<typeof SkillDimensionV1Schema>;
export type SkillDimensionV2 = z.infer<typeof SkillDimensionV2Schema>;
export type SkillDimension = z.infer<typeof SkillDimensionSchema>;

export const SkillStateSchema = z.object({
  dimension: SkillDimensionSchema,
  rating: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(),
  trend: z.enum(["rising", "stable", "declining", "insufficient"]),
  lastEvaluatedAt: z.string().nullable(),
  track: z.string().min(1).default("global"),
});

export type SkillState = z.infer<typeof SkillStateSchema>;

export const AwakeningTierSchema = z.enum([
  "Latent",
  "Initiate",
  "Adept",
  "Vanguard",
  "Ascendant",
  "Apex",
]);

export type AwakeningTier = z.infer<typeof AwakeningTierSchema>;

export const PlayerProfileSchema = z.object({
  id: z.string(),
  learnerId: z.string(),
  currentLevel: z.number().int().positive(),
  totalXp: z.number().int().nonnegative(),
  awakeningTier: AwakeningTierSchema,
  title: z.string(),
  primarySpecialization: z.string().nullable(),
  secondarySpecialization: z.string().nullable(),
  skills: z.array(SkillStateSchema),
  recoverySeals: z.number().int().min(0).max(2),
  timezone: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;

export const ProgressionEventSchema = z.object({
  id: z.string(),
  learnerId: z.string(),
  eventType: z.enum([
    "level_up",
    "tier_up",
    "specialization_unlocked",
    "reward_earned",
    "boss_defeated",
    "streak_repaired",
    "recovery_seal_earned",
    "ascension_trial_passed",
    "daily_protocol_proposed",
  ]),
  payload: z.record(z.unknown()),
  createdAt: z.string(),
});

export type ProgressionEvent = z.infer<typeof ProgressionEventSchema>;

export const RewardDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    "title",
    "avatar_layer",
    "aura_pattern",
    "chamber_object",
    "badge",
    "session_key",
    "vocabulary_artifact",
  ]),
  assetId: z.string(),
  unlockCondition: z.string(),
});

export type RewardDefinition = z.infer<typeof RewardDefinitionSchema>;

export const PlayerRewardSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  rewardId: z.string(),
  unlockedAt: z.string(),
  isEquipped: z.boolean(),
  reward: RewardDefinitionSchema.optional(),
});

export type PlayerReward = z.infer<typeof PlayerRewardSchema>;

export const SpecializationSchema = z.object({
  id: z.enum(["Scholar", "Orator", "Diplomat", "Strategist", "Explorer"]),
  name: z.string(),
  description: z.string(),
  unlockLevel: z.number().int().positive(),
  primaryFocus: z.string(),
  icon: z.string(),
});

export type Specialization = z.infer<typeof SpecializationSchema>;
