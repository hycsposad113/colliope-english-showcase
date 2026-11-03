// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/live-training.ts; adapted: compatibility schemas for the showcase demo.
import { z } from 'zod';
export const Proposal = z.object({ topic: z.string().min(1), question: z.string().min(1) }).strict();
export const Report = z.object({ learnerId: z.string().min(1), evidence: z.string().min(1), score: z.number().int().min(0).max(5) }).strict();
export type Report = z.infer<typeof Report>;
