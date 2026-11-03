// Extracted from a larger private codebase (CALLIOPE). Source: packages/course-schema/src/index.ts; adapted: local imports and framework-free execution.
import { z } from "zod";

export const DifficultySchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

const CEFR_LEVELS = DifficultySchema.options;
const ModalityWeightSchema = z.number().min(0).max(1);

const validateModalityWeights = (
  data: Record<string, number>,
  ctx: z.RefinementCtx,
): void => {
  const sum = Object.values(data).reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) >= 0.001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Modality percentages must sum up to exactly 1.0",
      path: ["modalities"],
    });
  }
};

const requireSpeakingLargest = (
  data: { speaking: number } & Record<string, number>,
  ctx: z.RefinementCtx,
): void => {
  const otherValues = Object.entries(data)
    .filter(([key]) => key !== "speaking")
    .map(([, value]) => value);
  if (otherValues.some((value) => data.speaking <= value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Speaking must be the largest modality allocation",
      path: ["speaking"],
    });
  }
};

/** The original three-modality schema. Keep this stable for persisted v1 plans. */
export const ModalitiesSchema = z
  .object({
    speaking: ModalityWeightSchema,
    listening: ModalityWeightSchema,
    writing: ModalityWeightSchema,
  })
  .superRefine((data, ctx) => {
    validateModalityWeights(data, ctx);
    requireSpeakingLargest(data, ctx);
  });
export type Modalities = z.infer<typeof ModalitiesSchema>;

export const ModalitiesV2Schema = z
  .object({
    speaking: ModalityWeightSchema,
    listening: ModalityWeightSchema,
    reading: ModalityWeightSchema,
    writing: ModalityWeightSchema,
  })
  .superRefine((data, ctx) => {
    validateModalityWeights(data, ctx);
    requireSpeakingLargest(data, ctx);
  });
export type ModalitiesV2 = z.infer<typeof ModalitiesV2Schema>;

export const ExerciseTypeSchema = z.enum([
  "speaking.roleplay",
  "speaking.monologue",
  "speaking.repair",
  "speaking.shadowing",
  "listening.comprehension",
  "listening.discrimination",
  "listening.shadowing",
  "reading.comprehension",
  "reading.summary",
  "writing.short-response",
  "writing.rewrite-for-speech",
]);

const FallbackSchema = z.object({
  type: z.enum(["typed.roleplay", "self-recorded", "offline.read-aloud"]),
  instructions: z.string().min(1),
});

const AdaptationBoundsSchema = z
  .object({
    min: DifficultySchema,
    max: DifficultySchema,
  })
  .superRefine((bounds, ctx) => {
    if (CEFR_LEVELS.indexOf(bounds.min) > CEFR_LEVELS.indexOf(bounds.max)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Adaptation minimum cannot be higher than maximum",
      });
    }
  });

const ExerciseV1BaseSchema = z.object({
  type: ExerciseTypeSchema.exclude([
    "reading.comprehension",
    "reading.summary",
  ]),
  prompt: z.string().min(1),
  rubric: z.array(z.string().min(1)).min(1),
  difficulty: DifficultySchema,
  fallback: FallbackSchema,
  adaptationBounds: AdaptationBoundsSchema.optional(),
});

/** Exact v1 exercise shape, retained for legacy plans. */
export const ExerciseSchema = ExerciseV1BaseSchema;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseV1 = Exercise;

export const SessionSchema = z.object({
  id: z.string(),
  estimatedMinutes: z.number().positive(),
  exercises: z.array(ExerciseSchema),
});
export type Session = z.infer<typeof SessionSchema>;
export type SessionV1 = Session;

export const ModuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  outcomes: z.array(z.string()),
  sessions: z.array(SessionSchema),
});
export type Module = z.infer<typeof ModuleSchema>;
export type ModuleV1 = Module;

/** Exact v1 course shape, retained instead of mutating old JSON in place. */
export const CourseDSLV1Schema = z.object({
  schemaVersion: z.literal(1),
  title: z.string(),
  goalIds: z.array(z.string()),
  durationWeeks: z.number().int().positive(),
  weeklyMinutes: z.number().int().positive(),
  modalities: ModalitiesSchema,
  modules: z.array(ModuleSchema),
});
export type CourseDSLV1 = z.infer<typeof CourseDSLV1Schema>;

export const LearningTrackSchema = z.enum([
  "academic_communication",
  "life_abroad",
]);
export type LearningTrack = z.infer<typeof LearningTrackSchema>;

export const SupportLevelSchema = z.enum([
  "none",
  "light",
  "moderate",
  "heavy",
]);
export type SupportLevel = z.infer<typeof SupportLevelSchema>;

export const TargetStateSchema = z.enum([
  "new",
  "recognized",
  "prompted_production",
  "independent_production",
  "transferred",
  "maintained",
]);
export type TargetState = z.infer<typeof TargetStateSchema>;

export const LearningTargetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["chunk", "vocabulary", "grammar", "pronunciation"]),
  value: z.string().min(1),
  communicativeFunction: z.string().min(1),
  register: z.enum(["casual", "neutral", "formal", "academic"]),
  contexts: z.array(z.string().min(1)).min(2),
  retrievalOffsetsDays: z.array(z.number().int().nonnegative()).min(3),
});
export type LearningTarget = z.infer<typeof LearningTargetSchema>;

export const EvidencePolicySchema = z.object({
  requiresUnpromptedProduction: z.boolean(),
  requiresTransferContext: z.boolean(),
  delayedSuccessesRequired: z.number().int().min(1).max(3),
});
export type EvidencePolicy = z.infer<typeof EvidencePolicySchema>;

export const LanguageResourcesSchema = z.object({
  vocabulary: z.array(z.string().min(1)).default([]),
  chunks: z.array(z.string().min(1)).default([]),
  grammar: z.array(z.string().min(1)).default([]),
  pronunciation: z.array(z.string().min(1)).default([]),
});
export type LanguageResources = z.infer<typeof LanguageResourcesSchema>;

const ExerciseV2BaseSchema = z.object({
  type: ExerciseTypeSchema,
  prompt: z.string().min(1),
  rubric: z.array(z.string().min(1)).min(1),
  difficulty: DifficultySchema,
  fallback: FallbackSchema,
  adaptationBounds: AdaptationBoundsSchema.optional(),
  track: LearningTrackSchema,
  scenarioId: z.string().min(1),
  communicativeFunction: z.string().min(1),
  targetIds: z.array(z.string().min(1)),
  supportLevel: SupportLevelSchema,
  formFocus: z.array(z.string().min(1)).default([]),
  transferScenarioId: z.string().min(1),
  evidencePolicy: EvidencePolicySchema,
  languageResources: LanguageResourcesSchema.default({}),
});

export const ExerciseV2Schema = ExerciseV2BaseSchema;
export type ExerciseV2 = z.infer<typeof ExerciseV2Schema>;

const SessionV2Schema = z.object({
  id: z.string().min(1),
  estimatedMinutes: z.number().positive(),
  focusTrack: LearningTrackSchema,
  exercises: z.array(ExerciseV2Schema),
});
export type SessionV2 = z.infer<typeof SessionV2Schema>;

const ModuleV2Schema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  outcomes: z.array(z.string().min(1)),
  tracks: z.array(LearningTrackSchema).length(2),
  sessions: z.array(SessionV2Schema),
});
export type ModuleV2 = z.infer<typeof ModuleV2Schema>;

const DEFAULT_LANGUAGE_RESOURCES = {
  vocabulary: [],
  chunks: [],
  grammar: [],
  pronunciation: [],
};

const CourseDSLV2BaseSchema = z.object({
  schemaVersion: z.literal(2),
  title: z.string().min(1),
  goalIds: z.array(z.string()),
  durationWeeks: z.number().int().positive(),
  weeklyMinutes: z.number().int().positive(),
  modalities: ModalitiesV2Schema,
  languageResources: LanguageResourcesSchema.default(
    DEFAULT_LANGUAGE_RESOURCES,
  ),
  targets: z.array(LearningTargetSchema),
  retrieval: z.array(
    z.object({
      targetId: z.string().min(1),
      offsetsDays: z.array(z.number().int().nonnegative()).min(3),
      state: TargetStateSchema,
    }),
  ),
  transferProbes: z
    .array(
      z.object({
        scenarioId: z.string().min(1),
        successCriteria: z.array(z.string().min(1)).min(1),
        requiresUnpromptedProduction: z.boolean(),
      }),
    )
    .min(1),
  modules: z.array(ModuleV2Schema),
});

/** v2 extends the course model with explicit targets, retrieval and transfer. */
export const CourseDSLV2Schema = CourseDSLV2BaseSchema.superRefine(
  (course, ctx) => {
    const targetIds = new Set<string>();
    course.targets.forEach((target, index) => {
      if (targetIds.has(target.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targets", index, "id"],
          message: `Duplicate learning target id: ${target.id}`,
        });
      }
      targetIds.add(target.id);
    });

    course.modules.forEach((module, moduleIndex) => {
      const exercises = module.sessions.flatMap((session) => session.exercises);
      if (
        !module.tracks.includes("academic_communication") ||
        !module.tracks.includes("life_abroad")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["modules", moduleIndex, "sessions"],
          message:
            "Every module must contain both academic and life-abroad tracks",
        });
      }

      exercises.forEach((exercise, exerciseIndex) => {
        exercise.targetIds.forEach((targetId) => {
          if (!targetIds.has(targetId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                "modules",
                moduleIndex,
                "sessions",
                exerciseIndex,
                "targetIds",
              ],
              message: `Unknown learning target reference: ${targetId}`,
            });
          }
        });
        if (
          exercise.evidencePolicy.requiresTransferContext &&
          !exercise.transferScenarioId
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              "modules",
              moduleIndex,
              "sessions",
              exerciseIndex,
              "transferScenarioId",
            ],
            message:
              "Transfer context is required when evidence policy enables it",
          });
        }
      });
    });
  },
);
export type CourseDSLV2 = z.infer<typeof CourseDSLV2Schema>;

/**
 * Compatibility parser. New generated plans should emit schemaVersion 2;
 * existing v1 plans remain readable until an explicit migration is requested.
 */
export const CourseDSLSchema = z.union([CourseDSLV2Schema, CourseDSLV1Schema]);
export type CourseDSL = z.infer<typeof CourseDSLSchema>;

export function parseCourseDsl(input: unknown): CourseDSL {
  return CourseDSLSchema.parse(input);
}
