// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/live-training.ts; adapted: local imports and framework-free execution.
import { z } from "zod";

export const LiveCoachPersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  relationship: z.enum([
    "coach",
    "examiner",
    "peer",
    "stakeholder",
    "opponent",
  ]),
  temperament: z.enum([
    "supportive",
    "socratic",
    "demanding",
    "skeptical",
    "playful",
  ]),
  correctionTiming: z.enum([
    "immediate-critical-only",
    "after-turn",
    "checkpoint",
  ]),
  challengeLevel: z.number().int().min(1).max(5),
  speakingPace: z.enum(["slow", "natural", "fast"]),
  learnerTalkRatioTarget: z.number().min(0).max(1),
  interruptionPolicy: z.string(),
  forbiddenBehaviors: z.array(z.string()),
});

export type LiveCoachPersona = z.infer<typeof LiveCoachPersonaSchema>;

export const SessionPhaseSchema = z.object({
  kind: z.enum([
    "status_scan",
    "voice_activation",
    "main_dungeon",
    "pressure_encounter",
    "debrief",
  ]),
  minutes: z.number().nonnegative(),
  instructions: z.array(z.string()),
  learnerOutput: z.string(),
});

export type SessionPhase = z.infer<typeof SessionPhaseSchema>;

export const SuccessCriterionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  mandatory: z.boolean(),
});

export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;

import { createHash } from "crypto";

export function canonicalizeCriterionText(text: string): string {
  const norm = text.normalize("NFKC").toLowerCase();
  const slug = norm
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 40);
  return slug || "criterion";
}

/**
 * Canonical SHA-256 digest for a criterion's normalized text.
 * Returns 64-char hex string — never truncated.
 * This is the ONLY identity algorithm for generated IDs.
 */
export function hashCriterionText(str: string): string {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

/** @deprecated use normalizeSuccessCriteriaInput for ID assignment */
export function slugCriterionId(text: string, used: Set<string>): string {
  const canonical = canonicalizeCriterionText(text);
  const normText = text.normalize("NFKC").toLowerCase();
  const digest = hashCriterionText(normText);
  const root = "sc_" + canonical;
  const candidate = `${root}_${digest}`;
  if (used.has(candidate)) {
    throw new Error(
      `Full SHA-256 digest collision for criterion text: "${text}" — fail closed`,
    );
  }
  used.add(candidate);
  return candidate;
}

/** Accept legacy plain-string criteria and normalize to { id, text, mandatory }. */
export function normalizeSuccessCriteriaInput(
  items: Array<SuccessCriterion | string | unknown>,
): SuccessCriterion[] {
  if (!Array.isArray(items)) return [];

  type ParsedEntry = {
    explicitId?: string;
    text: string;
    mandatory: boolean;
    normText: string;
  };

  const parsedEntries: ParsedEntry[] = [];

  for (const item of items) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed) as {
            id?: unknown;
            text?: unknown;
            mandatory?: unknown;
          };
          if (typeof parsed === "object" && parsed !== null) {
            const expId =
              typeof parsed.id === "string" && parsed.id.trim().length > 0
                ? parsed.id.trim()
                : undefined;
            const textVal =
              typeof parsed.text === "string" && parsed.text.trim().length > 0
                ? parsed.text.trim()
                : expId;
            if (textVal) {
              parsedEntries.push({
                explicitId: expId,
                text: textVal,
                mandatory: parsed.mandatory !== false,
                normText: textVal.normalize("NFKC").toLowerCase(),
              });
              continue;
            }
          }
        } catch {
          // Fall back to treating as plain string
        }
      }
      parsedEntries.push({
        text: trimmed,
        mandatory: true,
        normText: trimmed.normalize("NFKC").toLowerCase(),
      });
      continue;
    }

    if (item && typeof item === "object") {
      const obj = item as {
        id?: unknown;
        text?: unknown;
        mandatory?: unknown;
      };
      const expId =
        typeof obj.id === "string" && obj.id.trim().length > 0
          ? obj.id.trim()
          : undefined;
      const textVal =
        typeof obj.text === "string" && obj.text.trim().length > 0
          ? obj.text.trim()
          : expId;

      if (!textVal) {
        throw new Error(
          "Invalid success criterion object: missing required id or text",
        );
      }

      parsedEntries.push({
        explicitId: expId,
        text: textVal,
        mandatory: obj.mandatory !== false,
        normText: textVal.normalize("NFKC").toLowerCase(),
      });
      continue;
    }
  }

  const seenExplicitIds = new Set<string>();
  const seenNormTexts = new Set<string>();

  for (const entry of parsedEntries) {
    if (seenNormTexts.has(entry.normText)) {
      throw new Error(
        `Duplicate success criterion text rejected: "${entry.text}"`,
      );
    }
    seenNormTexts.add(entry.normText);

    if (entry.explicitId) {
      if (seenExplicitIds.has(entry.explicitId)) {
        throw new Error(
          `Duplicate explicit success criterion ID rejected: "${entry.explicitId}"`,
        );
      }
      seenExplicitIds.add(entry.explicitId);
    }
  }

  // Identify slug collision groups: non-explicit entries that share a canonical slug.
  // A group of size > 1 means no member gets the bare root ID.
  const slugGroupSizes = new Map<string, number>();
  for (const entry of parsedEntries) {
    if (!entry.explicitId) {
      const slug = canonicalizeCriterionText(entry.text);
      const baseSlugKey = `sc_${slug}`;
      slugGroupSizes.set(
        baseSlugKey,
        (slugGroupSizes.get(baseSlugKey) || 0) + 1,
      );
    }
  }

  const out: SuccessCriterion[] = [];
  for (const entry of parsedEntries) {
    if (entry.explicitId) {
      out.push({
        id: entry.explicitId,
        text: entry.text,
        mandatory: entry.mandatory,
      });
    } else {
      const slug = canonicalizeCriterionText(entry.text);
      const baseSlugKey = `sc_${slug}`;
      const groupSize = slugGroupSizes.get(baseSlugKey) || 1;
      const hasExplicitCollision = Array.from(seenExplicitIds).some(
        (id) => id === baseSlugKey || id.startsWith(`${baseSlugKey}_`),
      );
      const inCollisionGroup = groupSize > 1 || hasExplicitCollision;

      let candidate: string;
      if (inCollisionGroup) {
        // Use full SHA-256 of normalized text — order-invariant and content-addressed
        const digest = hashCriterionText(entry.normText);
        candidate = `${baseSlugKey}_${digest}`;
        // Full SHA-256 collision would mean two distinct normTexts produce the same digest.
        // This is astronomically unlikely; fail closed rather than use input order.
        const collision = out.find((c) => c.id === candidate);
        if (collision) {
          throw new Error(
            `Full SHA-256 digest collision for criterion: "${entry.text}" vs "${collision.text}" — fail closed`,
          );
        }
      } else {
        candidate = baseSlugKey;
      }

      out.push({
        id: candidate,
        text: entry.text,
        mandatory: entry.mandatory,
      });
    }
  }

  // Final invariant: all IDs unique
  const finalIdCheck = new Set<string>();
  for (const item of out) {
    if (finalIdCheck.has(item.id)) {
      throw new Error(`Duplicate success criterion ID generated: "${item.id}"`);
    }
    finalIdCheck.add(item.id);
  }

  return out;
}

export const SuccessCriterionInputSchema = z.union([
  SuccessCriterionSchema,
  z.string(),
]);

const LiveSessionPackV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string(),
  learnerId: z.string(),
  questId: z.string(),
  curriculumPlanId: z.string(),
  generatedAt: z.string(),
  expiresAt: z.string(),
  provider: z.enum(["chatgpt-live-bridge", "openai-realtime", "local"]),
  targetMinutes: z.literal(30),
  targetSpeakingMinutes: z.number().min(1).max(30),
  level: z.string(),
  missionTitle: z.string(),
  missionBrief: z.string(),
  successCriteria: z
    .array(SuccessCriterionInputSchema)
    .superRefine((items, ctx) => {
      try {
        normalizeSuccessCriteriaInput(items);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })
    .transform(normalizeSuccessCriteriaInput),
  targetLanguage: z.array(z.string()),
  knownWeaknesses: z.array(z.string()),
  persona: LiveCoachPersonaSchema,
  phases: z.array(SessionPhaseSchema).refine(
    (phases) => {
      const total = phases.reduce((acc, p) => acc + p.minutes, 0);
      return total === 30;
    },
    { message: "Total planned phase duration must equal exactly 30 minutes" },
  ),
  adaptationBounds: z.object({
    min: z.string(),
    max: z.string(),
  }),
  endCommand: z.literal("END CALLIOPE SESSION"),
  reportSchemaVersion: z.literal("1.0"),
  renderedPrompt: z.string(),
});

const LiveLearningTrackSchema = z.enum([
  "academic_communication",
  "life_abroad",
]);

export const ScenarioCardSchema = z.object({
  id: z.string().min(1),
  learnerRole: z.string().min(1),
  counterpartRole: z.string().min(1),
  setting: z.string().min(1),
  time: z.string().min(1),
  relationship: z.string().min(1),
  sharedFacts: z.array(z.string().min(1)).min(3).max(5),
  learnerObjective: z.string().min(1),
  tension: z.string().min(1),
  counterpartOpening: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  toolkitItemIds: z.array(z.string().min(1)).min(1),
  learnerSituation: z.string().max(1000).optional(),
});
export type ScenarioCard = z.infer<typeof ScenarioCardSchema>;

export const LanguageToolkitItemSchema = z.object({
  id: z.string().min(1),
  track: LiveLearningTrackSchema,
  kind: z.enum(["word", "collocation", "functional_phrase", "phrasal_verb"]),
  expression: z.string().min(1),
  meaningZhTw: z.string().min(1),
  explanation: z.string().min(1),
  collocations: z.array(z.string().min(1)).min(1),
  example: z.string().min(1),
  register: z.enum(["academic-formal", "neutral-spoken", "informal-spoken"]),
  avoidWhen: z.string().min(1),
  ordinaryExpression: z.string().min(1),
  naturalExpression: z.string().min(1),
  status: z.enum(["new", "review"]),
  sourceTargetId: z.string().min(1).optional(),
});
export type LanguageToolkitItem = z.infer<typeof LanguageToolkitItemSchema>;

export const GrammarRegisterFocusSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  form: z.string().min(1),
  explanationZhTw: z.string().min(1),
  academicExample: z.string().min(1),
  spokenExample: z.string().min(1),
  registerContrast: z.string().min(1),
  commonPitfall: z.string().min(1),
  requiredUse: z.string().min(1),
});
export type GrammarRegisterFocus = z.infer<typeof GrammarRegisterFocusSchema>;

export const CoachBehaviorSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  relationship: z.string().min(1),
  temperament: z.string().min(1),
  correctionStyle: z.string().min(1),
  maxUpgradeNudgesPerSegment: z.literal(2),
  learnerTalkTarget: z.number().min(0.7).max(1),
  allowedInterruptionReasons: z.array(z.string().min(1)).min(1),
  forbiddenPhrases: z.array(z.string().min(1)).min(1),
});
export type CoachBehavior = z.infer<typeof CoachBehaviorSchema>;

export const DailySessionPlanSchema = z
  .object({
    toolkitMinutes: z.literal(3),
    academicMinutes: z.literal(16),
    lifeMinutes: z.literal(9),
    debriefMinutes: z.literal(2),
    totalMinutes: z.literal(30),
  })
  .superRefine((plan, ctx) => {
    if (
      plan.toolkitMinutes +
        plan.academicMinutes +
        plan.lifeMinutes +
        plan.debriefMinutes !==
      plan.totalMinutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalMinutes"],
        message: "Daily session plan must total exactly 30 minutes",
      });
    }
  });
export type DailySessionPlan = z.infer<typeof DailySessionPlanSchema>;

export const SessionSegmentSchema = z.object({
  track: LiveLearningTrackSchema,
  minutes: z.union([z.literal(16), z.literal(9)]),
  scenario: ScenarioCardSchema,
  toolkitItemIds: z.array(z.string().min(1)).min(1),
});
export type SessionSegment = z.infer<typeof SessionSegmentSchema>;

const SupportLevelSchema = z.enum([
  "none",
  "semantic_cue",
  "first_word_cue",
  "model",
]);
export const RETRIEVAL_PROMPT_LEVELS = [
  "none",
  "semantic cue",
  "first-word cue",
  "model",
] as const;

export type RetrievalPromptLevel = (typeof RETRIEVAL_PROMPT_LEVELS)[number];

export const TRANSFER_CHANGE_DIMENSIONS = [
  "role",
  "goal",
  "information",
  "time pressure",
  "register",
] as const;

export type TransferChangeDimension =
  (typeof TRANSFER_CHANGE_DIMENSIONS)[number];

const RetrievalItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  promptLevel: z.enum(RETRIEVAL_PROMPT_LEVELS).default("none"),
});
const TransferScenarioSchema = z.object({
  title: z.string().min(1),
  context: z.string().min(1),
  changes: z.array(z.enum(TRANSFER_CHANGE_DIMENSIONS)).min(2),
});

/**
 * Bounded, learner-provided context for making each voice session personally
 * relevant without sending the learner's full Vault or raw transcripts.
 */
export const LiveLearnerContextSchema = z.object({
  preferredTopics: z.array(z.string().min(1)).max(30),
  avoidedTopics: z.array(z.string().min(1)).max(30),
  academicContext: z.string().max(1000),
  lifeAbroadContext: z.string().max(1000),
  speakingFocus: z.array(z.string().min(1)).max(15),
  listeningFocus: z.array(z.string().min(1)).max(15),
  writingFocus: z.array(z.string().min(1)).max(15),
});

export type LiveLearnerContext = z.infer<typeof LiveLearnerContextSchema>;

const LiveSessionPackV2Schema = z
  .object({
    schemaVersion: z.literal("2.0"),
    id: z.string(),
    learnerId: z.string(),
    questId: z.string(),
    curriculumPlanId: z.string(),
    generatedAt: z.string(),
    expiresAt: z.string(),
    provider: z.enum(["chatgpt-live-bridge", "openai-realtime", "local"]),
    targetMinutes: z.union([z.literal(10), z.literal(20), z.literal(30)]),
    targetSpeakingMinutes: z.number().int().min(1).max(30),
    level: z.string(),
    missionTitle: z.string(),
    missionBrief: z.string(),
    successCriteria: z
      .array(SuccessCriterionInputSchema)
      .superRefine((items, ctx) => {
        try {
          normalizeSuccessCriteriaInput(items);
        } catch (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .transform(normalizeSuccessCriteriaInput),
    targetLanguage: z.array(z.string()),
    knownWeaknesses: z.array(z.string()),
    persona: LiveCoachPersonaSchema,
    phases: z.array(SessionPhaseSchema),
    adaptationBounds: z.object({ min: z.string(), max: z.string() }),
    endCommand: z.literal("END CALLIOPE SESSION"),
    reportSchemaVersion: z.literal("1.0"),
    renderedPrompt: z.string(),
    track: LiveLearningTrackSchema,
    scenarioId: z.string().min(1),
    communicativeFunction: z.string().min(1),
    targetIds: z.array(z.string().min(1)),
    supportLevel: SupportLevelSchema,
    retrievalItems: z.array(RetrievalItemSchema),
    transferScenario: TransferScenarioSchema,
    isAnchor: z.boolean(),
    anchorKey: z.string().min(1).nullable(),
    promptVersion: z.string().min(1),
    learnerContext: LiveLearnerContextSchema.optional(),
  })
  .superRefine((pack, ctx) => {
    if (pack.targetSpeakingMinutes > pack.targetMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetSpeakingMinutes"],
        message: "targetSpeakingMinutes must not exceed targetMinutes",
      });
    }
    const total = pack.phases.reduce((sum, phase) => sum + phase.minutes, 0);
    if (total !== pack.targetMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phases"],
        message: "Total planned phase duration must equal targetMinutes",
      });
    }
    for (const id of pack.targetIds) {
      if (!pack.retrievalItems.some((item) => item.id === id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetIds"],
          message: `targetId ${id} must have a retrieval item`,
        });
      }
    }
  });

const LiveSessionPackV3Schema = LiveSessionPackV1Schema.extend({
  schemaVersion: z.literal("3.0"),
  targetMinutes: z.literal(30),
  targetSpeakingMinutes: z.literal(25),
  reportSchemaVersion: z.literal("2.0"),
  dailyProtocolId: z.string().min(1),
  dailySessionPlan: DailySessionPlanSchema,
  academicSegment: SessionSegmentSchema.extend({
    track: z.literal("academic_communication"),
    minutes: z.literal(16),
  }),
  lifeSegment: SessionSegmentSchema.extend({
    track: z.literal("life_abroad"),
    minutes: z.literal(9),
  }),
  languageToolkit: z.array(LanguageToolkitItemSchema).length(6),
  grammarRegisterFocus: GrammarRegisterFocusSchema,
  coachBehavior: CoachBehaviorSchema,
  scenarioSource: z.enum(["catalog", "hermes", "user"]),
  learnerContext: LiveLearnerContextSchema.optional(),
}).superRefine((pack, ctx) => {
  const academicIds = new Set(pack.academicSegment.toolkitItemIds);
  const lifeIds = new Set(pack.lifeSegment.toolkitItemIds);
  const toolkitIds = new Set(pack.languageToolkit.map((item) => item.id));

  for (const id of [...academicIds, ...lifeIds]) {
    if (!toolkitIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["languageToolkit"],
        message: `Scenario toolkit item ${id} is missing from languageToolkit`,
      });
    }
  }

  if (
    pack.languageToolkit.filter(
      (item) => item.track === "academic_communication",
    ).length !== 3
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["languageToolkit"],
      message: "Academic languageToolkit must contain exactly 3 items",
    });
  }
  if (
    pack.languageToolkit.filter((item) => item.track === "life_abroad")
      .length !== 3
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["languageToolkit"],
      message: "Life languageToolkit must contain exactly 3 items",
    });
  }
});

export type LiveSessionPackV3 = z.infer<typeof LiveSessionPackV3Schema>;

export const LiveSessionPackSchema = z.union([
  LiveSessionPackV3Schema,
  LiveSessionPackV1Schema,
  LiveSessionPackV2Schema,
]);

export type LiveSessionPack = z.infer<typeof LiveSessionPackSchema>;

export const EvidenceScoreSchema = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  status: z.enum(["observed", "partially_observed", "not_observed"]),
});

export type EvidenceScore = z.infer<typeof EvidenceScoreSchema>;

export const V2EvidenceScoreSchema = EvidenceScoreSchema.extend({
  asrUncertain: z.boolean().optional(),
});

export type V2EvidenceScore = z.infer<typeof V2EvidenceScoreSchema>;

export const VoiceSessionAssessmentV2Schema = z
  .object({
    range: V2EvidenceScoreSchema.optional(),
    accuracy: V2EvidenceScoreSchema.optional(),
    fluency: V2EvidenceScoreSchema.optional(),
    interaction: V2EvidenceScoreSchema.optional(),
    coherence: V2EvidenceScoreSchema.optional(),
    intelligibility: V2EvidenceScoreSchema.optional(),
  })
  .strict();

export type VoiceSessionAssessmentV2 = z.infer<
  typeof VoiceSessionAssessmentV2Schema
>;

/** Optional structured measures used for the personal N-of-1 trial. */
export const SessionMetricsSchema = z
  .object({
    responseStartLatencySeconds: z.number().finite().min(0).max(600).nullable(),
    breakdownCount: z.number().int().min(0).max(100).nullable(),
    repairSuccessCount: z.number().int().min(0).max(100).nullable(),
    learnerTalkRatio: z.number().finite().min(0).max(1).nullable(),
    comprehensibility: z.number().finite().min(1).max(5).nullable(),
    anxiety: z.number().finite().min(1).max(5).nullable(),
    unsupportedFeedbackCount: z.number().int().min(0).max(100).nullable(),
  })
  .strict();

export type SessionMetrics = z.infer<typeof SessionMetricsSchema>;

export const EvidenceItemSchema = z.object({
  observation: z.string(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const CorrectionItemSchema = z.object({
  category: z.enum([
    "pronunciation",
    "fluency",
    "grammar",
    "vocabulary",
    "structure",
    "interaction",
  ]),
  observed: z.string(),
  correction: z.string(),
  practicePrompt: z.string(),
  confidence: z.number().min(0).max(1),
});

export type CorrectionItem = z.infer<typeof CorrectionItemSchema>;

export const VoiceSessionReportV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  sessionPackId: z.string(),
  completion: z.object({
    status: z.enum(["full_clear", "partial_clear", "aborted"]),
    durationMinutes: z.number().nullable(),
    speakingMinutes: z.number().nullable(),
    phasesCompleted: z.array(z.string()),
    pressureEncounterCompleted: z.boolean(),
  }),
  mission: z.object({
    title: z.string(),
    successCriteriaMet: z.array(z.string()),
    successCriteriaMissed: z.array(z.string()),
  }),
  assessment: z.object({
    voice: EvidenceScoreSchema,
    flow: EvidenceScoreSchema,
    structure: EvidenceScoreSchema,
    lexicon: EvidenceScoreSchema,
    presence: EvidenceScoreSchema,
    perception: EvidenceScoreSchema,
  }),
  assessmentV2: VoiceSessionAssessmentV2Schema.optional(),
  strengths: z.array(EvidenceItemSchema),
  corrections: z.array(CorrectionItemSchema),
  targetLanguageUsed: z.array(z.string()),
  targetLanguageMissed: z.array(z.string()),
  notableMoments: z.array(EvidenceItemSchema),
  learnerSelfReflection: z.object({
    confidence: z.number().nullable(),
    difficulty: z.number().nullable(),
    notes: z.string().nullable(),
  }),
  sessionMetrics: SessionMetricsSchema.optional(),
  nextSessionRecommendation: z.object({
    focus: z.string(),
    difficultyDelta: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    reason: z.string(),
  }),
  reportConfidence: z.number().min(0).max(1),
  unobservedFields: z.array(z.string()),
});

export const ToolkitUsageSchema = z.object({
  itemId: z.string().min(1),
  outcome: z.enum([
    "independent",
    "used_after_nudge",
    "used_after_model",
    "not_used",
  ]),
  evidence: z.string().trim().min(1),
});
export type ToolkitUsage = z.infer<typeof ToolkitUsageSchema>;

const SegmentReportBaseSchema = z.object({
  status: z.enum(["full_clear", "partial_clear", "aborted"]),
  speakingMinutes: z.number().finite().min(0).max(240).nullable(),
  successCriteriaMet: z.array(z.string()),
  successCriteriaMissed: z.array(z.string()),
  toolkitUsage: z.array(ToolkitUsageSchema),
  grammarUsed: z.boolean(),
  grammarEvidence: z.array(z.string()),
  registerChoices: z.array(
    z.enum(["academic-formal", "neutral-spoken", "informal-spoken"]),
  ),
  corrections: z.array(CorrectionItemSchema),
  upgradeNudges: z.array(
    z.object({
      original: z.string(),
      suggestion: z.string(),
      reason: z.enum(["naturalness", "precision", "register"]),
      accepted: z.boolean(),
    }),
  ),
});

export const SegmentReportSchema = z.discriminatedUnion("track", [
  SegmentReportBaseSchema.extend({
    track: z.literal("academic_communication"),
    minutes: z.literal(16),
  }),
  SegmentReportBaseSchema.extend({
    track: z.literal("life_abroad"),
    minutes: z.literal(9),
  }),
]);
export type SegmentReport = z.infer<typeof SegmentReportSchema>;

export const VoiceSessionReportV2Schema = VoiceSessionReportV1Schema.extend({
  schemaVersion: z.literal("2.0"),
  segmentResults: z.array(SegmentReportSchema).length(2),
  grammarUsage: z.object({
    focusId: z.string().min(1),
    usedInAcademic: z.boolean(),
    usedInLife: z.boolean(),
    evidence: z.array(z.string()),
  }),
  languageGrowth: z.object({
    independent: z.array(z.string()),
    usedAfterNudge: z.array(z.string()),
    usedAfterModel: z.array(z.string()),
    notUsed: z.array(z.string()),
  }),
  upgradeNudges: z.array(
    z.object({
      track: LiveLearningTrackSchema,
      original: z.string(),
      suggestion: z.string(),
      reason: z.enum(["naturalness", "precision", "register"]),
      accepted: z.boolean(),
    }),
  ),
}).superRefine((report, ctx) => {
  const academicCount = report.segmentResults.filter(
    (segment) => segment.track === "academic_communication",
  ).length;
  const lifeCount = report.segmentResults.filter(
    (segment) => segment.track === "life_abroad",
  ).length;
  if (academicCount !== 1 || lifeCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["segmentResults"],
      message:
        "schema 2.0 reports must contain exactly one academic and one life segment",
    });
  }
});
export type VoiceSessionReportV2 = z.infer<typeof VoiceSessionReportV2Schema>;

/**
 * Return a schema-valid report skeleton for prompts and recovery flows.
 * Empty values deliberately represent unavailable evidence; they are not a
 * claim that a session was completed or that a learner received a score.
 */
export function createVoiceSessionReportV2Template(input: {
  sessionPackId: string;
  missionTitle: string;
  grammarFocusId: string;
}): VoiceSessionReportV2 {
  const notObserved = (): EvidenceScore => ({
    score: null,
    confidence: 0,
    evidence: [],
    status: "not_observed",
  });

  const segment = (track: "academic_communication" | "life_abroad") => ({
    track,
    status: "aborted" as const,
    minutes: track === "academic_communication" ? (16 as const) : (9 as const),
    speakingMinutes: null,
    successCriteriaMet: [],
    successCriteriaMissed: [],
    toolkitUsage: [],
    grammarUsed: false,
    grammarEvidence: [],
    registerChoices: [],
    corrections: [],
    upgradeNudges: [],
  });

  const template = {
    schemaVersion: "2.0" as const,
    sessionPackId: input.sessionPackId,
    completion: {
      status: "aborted" as const,
      durationMinutes: null,
      speakingMinutes: null,
      phasesCompleted: [],
      pressureEncounterCompleted: false,
    },
    mission: {
      title: input.missionTitle,
      successCriteriaMet: [],
      successCriteriaMissed: [],
    },
    assessment: {
      voice: notObserved(),
      flow: notObserved(),
      structure: notObserved(),
      lexicon: notObserved(),
      presence: notObserved(),
      perception: notObserved(),
    },
    strengths: [],
    corrections: [],
    targetLanguageUsed: [],
    targetLanguageMissed: [],
    notableMoments: [],
    learnerSelfReflection: {
      confidence: null,
      difficulty: null,
      notes: null,
    },
    nextSessionRecommendation: {
      focus: "",
      difficultyDelta: 0 as const,
      reason: "",
    },
    reportConfidence: 0,
    unobservedFields: [],
    segmentResults: [segment("academic_communication"), segment("life_abroad")] as VoiceSessionReportV2["segmentResults"],
    grammarUsage: {
      focusId: input.grammarFocusId,
      usedInAcademic: false,
      usedInLife: false,
      evidence: [],
    },
    languageGrowth: {
      independent: [],
      usedAfterNudge: [],
      usedAfterModel: [],
      notUsed: [],
    },
    upgradeNudges: [],
  } satisfies VoiceSessionReportV2;

  return VoiceSessionReportV2Schema.parse(template);
}

export const VoiceSessionReportSchema = z.union([
  VoiceSessionReportV2Schema,
  VoiceSessionReportV1Schema,
]);

export type VoiceSessionReport = z.infer<typeof VoiceSessionReportSchema>;

const MAX_REPORT_CHARS = 1_000_000;
const MAX_TARGET_PROPOSALS = 50;
const MAX_TARGET_CHARS = 200;

export const LiveSessionScenarioSelectionSchema = z
  .object({
    academicScenarioId: z.string().min(1).max(200).optional(),
    lifeScenarioId: z.string().min(1).max(200).optional(),
    learnerSituation: z.string().min(1).max(1000).optional(),
    mode: z.enum(["current", "alternate", "user"]).optional(),
  })
  .strict();

export type LiveSessionScenarioSelection = z.infer<
  typeof LiveSessionScenarioSelectionSchema
>;

export const LiveSessionPackMutationSchema = z
  .object({
    learnerId: z.string().min(1).max(200).optional(),
    questInstanceId: z.string().min(1).max(200),
    curriculumPlanId: z.string().min(1).max(200).optional(),
    academicScenarioId: z.string().min(1).max(200).optional(),
    lifeScenarioId: z.string().min(1).max(200).optional(),
    learnerSituation: z.string().min(1).max(1000).optional(),
    mode: z.enum(["current", "alternate", "user"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "user" && !value.learnerSituation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["learnerSituation"],
        message: "User scenario mode requires learnerSituation",
      });
    }
  });

export type LiveSessionPackMutation = z.infer<
  typeof LiveSessionPackMutationSchema
>;

export const ValidateReportRequestSchema = z
  .object({
    rawText: z.string().min(1).max(MAX_REPORT_CHARS),
    sessionPackId: z.string().min(1).max(200).optional(),
  })
  .strict();

export type ValidateReportRequest = z.infer<typeof ValidateReportRequestSchema>;

export const ValidateReportResponseSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  recoveryHint: z.string().optional(),
  recoveryPrompt: z.string().optional(),
  extractedReport: VoiceSessionReportSchema.optional(),
  sessionPackIdMatch: z.boolean().optional(),
  errors: z.array(z.string()).optional(),
  rawExtractedJson: z.string().optional(),
});

export type ValidateReportResponse = z.infer<
  typeof ValidateReportResponseSchema
>;

export const ImportReportMutationSchema = z
  .object({
    learnerId: z.string().min(1).max(200).optional(),
    rawText: z.string().min(1).max(MAX_REPORT_CHARS),
    sessionPackId: z.string().min(1).max(200).optional(),
  })
  .strict();

export type ImportReportMutation = z.infer<typeof ImportReportMutationSchema>;

export const RejectReportMutationSchema = z.object({}).strict();

export type RejectReportMutation = z.infer<typeof RejectReportMutationSchema>;

const ConfirmedSelfReflectionSchema = z
  .object({
    confidence: z.number().finite().min(1).max(5).optional(),
    difficulty: z.number().finite().min(1).max(5).optional(),
    notes: z.string().min(1).max(10_000).optional(),
  })
  .strict();

export const ConfirmReportMutationSchema = z
  .object({
    confirmedSelfReflection: ConfirmedSelfReflectionSchema.optional(),
    confirmedDurationMinutes: z.number().finite().min(0).max(360).optional(),
    confirmedSpeakingMinutes: z.number().finite().min(0).max(240).optional(),
    acceptMissingTiming: z.boolean().optional(),
    confirmedTargetLanguage: z
      .array(z.string().min(1).max(MAX_TARGET_CHARS))
      .max(MAX_TARGET_PROPOSALS)
      .optional(),
  })
  .strict()
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

export type ConfirmReportMutation = z.infer<typeof ConfirmReportMutationSchema>;

/** REST confirm body. reportId remains on the path. */
export const ConfirmReportRequestSchema = ConfirmReportMutationSchema;

export type ConfirmReportRequest = ConfirmReportMutation;

export const ConfirmReportResponseSchema = z.object({
  success: z.boolean(),
  reportId: z.string(),
  xpAwarded: z.number(),
  newTotalXp: z.number(),
  newLevel: z.number(),
  levelUp: z.boolean(),
  streakStatus: z.string(),
  currentStreak: z.number(),
  rewardsUnlocked: z.array(z.string()),
  questCompleted: z.boolean(),
  questId: z.string(),
});

export type ConfirmReportResponse = z.infer<typeof ConfirmReportResponseSchema>;
