// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/practice/practice.service.ts, apps/api/src/knowledge/knowledge.service.ts; adapted: Prisma and NestJS replaced by an evidence port and an in-memory implementation.
import { z } from 'zod';

export const ListeningEvaluationSchema = z.object({
  score: z.number().min(0).max(100), feedback: z.string(), missedKeyWords: z.array(z.string()).optional(),
});
export const WritingEvaluationSchema = z.object({
  feedback: z.string(), grammarScore: z.number().min(0).max(100), vocabularySuggestions: z.array(z.string()),
  correctedText: z.string(), spokenTransferPrompt: z.string(),
});
export const SessionReviewSchema = z.object({
  summaryText: z.string(), levelEstimate: z.string().optional(), grammarFeedback: z.string().optional(), vocabularyFeedback: z.string().optional(),
});
export interface StructuredModel { runStructured<T>(prompt: string, schema: z.ZodType<T>): Promise<T> }
export interface ListeningEvidence {
  kind: 'listening'; expectedText: string; learnerText: string; score: number; feedback: string; source: 'model' | 'rules';
}
export interface WritingEvidence {
  kind: 'writing'; prompt: string; text: string; feedback: string; grammarScore: number;
  vocabularySuggestions: string[]; correctedText: string; spokenTransferPrompt: string; source: 'model' | 'rules';
}
export type PracticeEvidence = ListeningEvidence | WritingEvidence;
export interface Attempt { id: string; exerciseId: string; exerciseType: string; prompt: string; transcript?: string; feedback?: string; utterances: Array<{speaker: string; text: string}> }
export interface PracticeSession {
  id: string; learnerId: string; curriculumPlanId?: string; status: 'in_progress' | 'completed';
  attempts: Attempt[]; evidence: PracticeEvidence[]; review?: z.infer<typeof SessionReviewSchema>;
}
export interface EvidencePort {
  create(learnerId: string, curriculumPlanId?: string): Promise<PracticeSession>;
  get(id: string): Promise<PracticeSession | undefined>;
  save(session: PracticeSession): Promise<void>;
}
export class InMemoryEvidenceStore implements EvidencePort {
  private readonly sessions = new Map<string, PracticeSession>();
  private nextId = 1;
  async create(learnerId: string, curriculumPlanId?: string): Promise<PracticeSession> {
    const session: PracticeSession = { id: String(this.nextId++), learnerId, curriculumPlanId, status: 'in_progress', attempts: [], evidence: [] };
    this.sessions.set(session.id, session);
    return session;
  }
  async get(id: string): Promise<PracticeSession | undefined> { return this.sessions.get(id); }
  async save(session: PracticeSession): Promise<void> {
    if (!this.sessions.has(session.id)) throw new Error(`Practice session ${session.id} not found`);
    this.sessions.set(session.id, session);
  }
}

export class PracticeSessions {
  private nextAttempt = 1;
  constructor(private readonly store: EvidencePort, private readonly model: StructuredModel) {}
  async createSession(learnerId: string, curriculumPlanId?: string): Promise<PracticeSession> {
    if (!learnerId.trim()) throw new Error('Learner is required');
    return this.store.create(learnerId, curriculumPlanId);
  }
  async getSession(id: string): Promise<PracticeSession> {
    const session = await this.store.get(id);
    if (!session) throw new Error(`Practice session ${id} not found`);
    return session;
  }
  private async active(id: string): Promise<PracticeSession> {
    const session = await this.getSession(id);
    if (session.status !== 'in_progress') throw new Error('Practice session is completed');
    return session;
  }
  async completeSession(id: string): Promise<PracticeSession> {
    const session = await this.getSession(id);
    session.status = 'completed';
    await this.store.save(session);
    return session;
  }
  async createAttempt(sessionId: string, data: { exerciseId: string; exerciseType: string; prompt: string }): Promise<Attempt> {
    const session = await this.active(sessionId);
    const attempt: Attempt = { id: String(this.nextAttempt++), ...data, utterances: [] };
    session.attempts.push(attempt);
    await this.store.save(session);
    return attempt;
  }
  async addUtterance(sessionId: string, attemptId: string, speaker: string, text: string): Promise<void> {
    const session = await this.active(sessionId);
    const attempt = session.attempts.find(item => item.id === attemptId);
    if (!attempt) throw new Error(`Attempt ${attemptId} not found`);
    attempt.utterances.push({ speaker, text });
    await this.store.save(session);
  }
  async saveAttemptTranscriptAndFeedback(sessionId: string, attemptId: string, transcript: string, feedback: string): Promise<void> {
    const session = await this.active(sessionId);
    const attempt = session.attempts.find(item => item.id === attemptId);
    if (!attempt) throw new Error(`Attempt ${attemptId} not found`);
    attempt.transcript = transcript;
    attempt.feedback = feedback;
    await this.store.save(session);
  }
  async generateReview(sessionId: string, data: ReviewInput): Promise<z.infer<typeof SessionReviewSchema>> {
    const session = await this.getSession(sessionId);
    let review: z.infer<typeof SessionReviewSchema> = {
      summaryText: data.summaryText || '',
      levelEstimate: data.levelEstimate,
      grammarFeedback: data.grammarFeedback,
      vocabularyFeedback: data.vocabularyFeedback,
    };
    if (data.transcript) {
      try {
        const metrics = data.metrics
          ? `fluency=${data.metrics.fluency}, pronunciation=${data.metrics.pronunciation}, grammar=${data.metrics.grammar}`
          : 'not available';
        const result = await this.model.runStructured(
          `You are an English speaking coach. Analyze this completed practice session and return coaching feedback.
Exercise title: "${data.exerciseTitle || 'Speaking practice'}"
Target difficulty: "${data.exerciseDifficulty || 'unknown'}"
Learner turns: ${data.turnCount ?? 0}
Learner transcript: "${data.transcript}"
Speech metrics (0-1 scale): ${metrics}
Return summaryText, levelEstimate, grammarFeedback, and vocabularyFeedback.`,
          SessionReviewSchema,
        );
        review = { ...result, levelEstimate: result.levelEstimate ?? data.exerciseDifficulty };
      } catch {
        review = buildFallbackSessionReview(data);
      }
    } else if (!review.summaryText) {
      review = buildFallbackSessionReview(data);
    }
    session.review = review;
    await this.store.save(session);
    return review;
  }
  async evaluateListening(sessionId: string, expectedText: string, learnerText: string): Promise<ListeningEvidence> {
    const session = await this.active(sessionId);
    let score: number;
    let feedback: string;
    let source: 'model' | 'rules' = 'model';
    try {
      const result = await this.model.runStructured(`You are an English listening coach. Compare the expected phrase with what the learner heard and typed.\nExpected phrase: "${expectedText}"\nLearner response: "${learnerText}"\nReturn score 0-100, concise feedback, and missedKeyWords.`, ListeningEvaluationSchema);
      score = Math.round(result.score);
      feedback = result.feedback;
    } catch {
      source = 'rules';
      ({ score, feedback } = evaluateListeningWithRules(expectedText, learnerText));
    }
    const evidence: ListeningEvidence = { kind: 'listening', expectedText, learnerText, score, feedback, source };
    // Persistence failures are not treated as model failures or silently swallowed.
    if (session.status !== 'in_progress') throw new Error('Practice session is completed');
    session.evidence.push(evidence);
    await this.store.save(session);
    return evidence;
  }
  async evaluateWriting(sessionId: string, prompt: string, text: string, feedbackDirectness = 'moderate'): Promise<WritingEvidence> {
    const session = await this.active(sessionId);
    let source: 'model' | 'rules' = 'model';
    let result: z.infer<typeof WritingEvaluationSchema>;
    try {
      result = await this.model.runStructured(`You are an English writing and grammar coach. Evaluate the response with a "${feedbackDirectness}" coaching style.\nPrompt: "${prompt}"\nLearner text: "${text}"\nReturn feedback, grammarScore 0-100, vocabularySuggestions, correctedText and spokenTransferPrompt.`, WritingEvaluationSchema);
      result.grammarScore = Math.round(result.grammarScore);
    } catch {
      source = 'rules';
      result = evaluateWritingWithRules(text);
    }
    const evidence: WritingEvidence = { kind: 'writing', prompt, text, ...result, source };
    if (session.status !== 'in_progress') throw new Error('Practice session is completed');
    session.evidence.push(evidence);
    await this.store.save(session);
    return evidence;
  }
}

export function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean);
}
export function evaluateListeningWithRules(expectedText: string, learnerText: string): {score: number; feedback: string} {
  const expectedWords = normalizeWords(expectedText);
  const learnerWords = new Set(normalizeWords(learnerText));
  const matched = expectedWords.filter(word => learnerWords.has(word));
  const score = expectedWords.length === 0 ? 0 : Math.round((matched.length / expectedWords.length) * 100);
  const missing = expectedWords.filter(word => !learnerWords.has(word));
  const feedback = missing.length === 0 ? 'All key words were captured. Repeat once for rhythm and linking.' : `Listen again for these key words: ${[...new Set(missing)].join(', ')}.`;
  return { score, feedback };
}
export function evaluateWritingWithRules(text: string): z.infer<typeof WritingEvaluationSchema> {
  const corrections: Array<[RegExp, string, string]> = [
    [/\bwe has\b/gi, 'we have', "Replace 'we has' with 'we have'."],
    [/\bi is\b/gi, 'I am', "Replace 'I is' with 'I am'."],
    [/\bhe have\b/gi, 'he has', "Replace 'he have' with 'he has'."],
    [/\bshe have\b/gi, 'she has', "Replace 'she have' with 'she has'."],
  ];
  let correctedText = text.trim();
  const feedbackItems: string[] = [];
  for (const [pattern, replacement, message] of corrections) {
    if (pattern.test(correctedText)) {
      pattern.lastIndex = 0;
      correctedText = correctedText.replace(pattern, replacement);
      feedbackItems.push(message);
    }
  }
  if (correctedText.length < 30) feedbackItems.push('Add one concrete detail before speaking it aloud.');
  const vocabularySuggestions: string[] = [];
  if (/\bvery important\b/i.test(text)) vocabularySuggestions.push('essential');
  if (/\bbig problem\b/i.test(text)) vocabularySuggestions.push('major issue');
  if (/\bget better\b/i.test(text)) vocabularySuggestions.push('improve');
  return {
    feedback: feedbackItems.length ? feedbackItems.join(' ') : 'The response is structurally clear. Read it aloud and simplify any phrase that feels difficult to say.',
    grammarScore: Math.max(0, 100 - feedbackItems.length * 12), vocabularySuggestions, correctedText,
    spokenTransferPrompt: `Say this idea aloud in your own words without reading: "${correctedText}"`,
  };
}

export interface ReviewInput {
  summaryText?: string;
  levelEstimate?: string;
  grammarFeedback?: string;
  vocabularyFeedback?: string;
  transcript?: string;
  exerciseTitle?: string;
  exerciseDifficulty?: string;
  metrics?: { fluency: number; pronunciation: number; grammar: number };
  turnCount?: number;
}

export function buildFallbackSessionReview(data: ReviewInput): z.infer<typeof SessionReviewSchema> {
  const count = data.turnCount ?? 0;
  const summaryText = data.summaryText || `You completed "${data.exerciseTitle || 'Speaking practice'}" with ${count} spoken ${count === 1 ? 'turn' : 'turns'}.`;
  const grammarFeedback = data.grammarFeedback || (data.metrics
    ? `Grammar and lexical accuracy scored ${Math.round(data.metrics.grammar * 100)}% on your most recent analyzed turn.`
    : 'No automated grammar analysis was captured for this session.');
  const vocabularyFeedback = data.vocabularyFeedback || (data.metrics
    ? `Pronunciation ${Math.round(data.metrics.pronunciation * 100)}% and fluency ${Math.round(data.metrics.fluency * 100)}%. Keep reusing the target vocabulary from this scenario.`
    : 'Reuse the target vocabulary from this scenario in your next attempt.');
  return { summaryText, levelEstimate: data.levelEstimate || data.exerciseDifficulty, grammarFeedback, vocabularyFeedback };
}

/** Build a portable session record from stored evidence; no filesystem access. */
export function summarizeSession(session: PracticeSession): string {
  const lines = [
    '# Practice Session Summary',
    '',
    `- **ID**: ${session.id}`,
    `- **Status**: ${session.status}`,
    '',
  ];
  if (session.review) {
    lines.push('## Coach Reflection', session.review.summaryText, '');
    if (session.review.grammarFeedback) lines.push('### Grammar Observations', session.review.grammarFeedback, '');
    if (session.review.vocabularyFeedback) lines.push('### Vocabulary Feedback', session.review.vocabularyFeedback, '');
  }
  lines.push('## Completed Exercises', '');
  for (const attempt of session.attempts) {
    lines.push(`### Exercise: ${attempt.exerciseId} (${attempt.exerciseType})`, `*Prompt*: "${attempt.prompt}"`);
    if (attempt.transcript) lines.push(`*Transcript*: "${attempt.transcript}"`);
    if (attempt.feedback) lines.push(`*Correction/Feedback*: ${attempt.feedback}`);
    if (attempt.utterances.length) {
      lines.push('', '*Conversation log*:');
      for (const utterance of attempt.utterances) lines.push(`- **${utterance.speaker.toUpperCase()}**: ${utterance.text}`);
    }
    lines.push('', '---', '');
  }
  return lines.join('\n');
}
