// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/progression.ts; adapted: local imports and framework-free execution.
import { z } from "zod";

export const StreakStateSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  lifetimeFullClears: z.number().int().nonnegative(),
  isFractured: z.boolean(),
  lastActiveLocalDate: z.string().nullable(),
  autoUseSeals: z.boolean(),
  recoverySealsAvailable: z.number().int().min(0).max(2),
  updatedAt: z.string(),
});

export type StreakState = z.infer<typeof StreakStateSchema>;

export const StreakTransitionReasonSchema = z.enum([
  "full_clear",
  "partial_clear",
  "recovery_clear",
  "seal_protected",
  "excused",
  "skipped_fractured",
  "skipped_reset",
  "recalibration_triggered",
]);

export type StreakTransitionReason = z.infer<
  typeof StreakTransitionReasonSchema
>;

export const RecoverySealLedgerEntrySchema = z.object({
  id: z.string(),
  playerId: z.string(),
  delta: z.number().int(), // +1 (earned) or -1 (used/reset)
  reason: z.enum([
    "earned_7_clears",
    "auto_used_missed_day",
    "manual_used",
    "reset",
  ]),
  balanceAfter: z.number().int().min(0).max(2),
  createdAt: z.string(),
});

export type RecoverySealLedgerEntry = z.infer<
  typeof RecoverySealLedgerEntrySchema
>;

export const XpLedgerEntrySchema = z.object({
  id: z.string(),
  playerId: z.string(),
  amount: z.number().int().nonnegative(),
  source: z.enum([
    "daily_protocol_full",
    "daily_protocol_partial",
    "difficulty_bonus",
    "speaking_bonus",
    "evidence_quality_bonus",
    "side_quest",
    "boss_clear",
    "ascension_trial",
    "recovery_repair",
  ]),
  idempotencyKey: z.string(),
  reportId: z.string().nullable(),
  questInstanceId: z.string().nullable(),
  createdAt: z.string(),
});

export type XpLedgerEntry = z.infer<typeof XpLedgerEntrySchema>;
