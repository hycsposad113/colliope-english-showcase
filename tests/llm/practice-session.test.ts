// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/practice/practice.service.ts; adapted: in-memory evidence and synthetic input tests.
import { describe, it, expect } from 'vitest';
import { PracticeSessions, InMemoryEvidenceStore } from '../../src/llm/practice-session.js';
describe('practice sessions', () => {
  it('stores fallback listening evidence after model failure', async () => {
    const store = new InMemoryEvidenceStore();
    const service = new PracticeSessions(store, {runStructured: async () => {throw new Error('offline');}});
    const session = await service.createSession('learner');
    const evidence = await service.evaluateListening(session.id, 'hello world', 'hello');
    expect(evidence.score).toBe(50); expect(evidence.source).toBe('rules'); expect((await service.getSession(session.id)).evidence).toHaveLength(1);
  });
  it('rejects evidence after completion', async () => {
    const service = new PracticeSessions(new InMemoryEvidenceStore(), {runStructured: async () => {throw new Error('offline');}});
    const session = await service.createSession('learner'); await service.completeSession(session.id);
    await expect(service.evaluateListening(session.id,'hello','hello')).rejects.toThrow(/completed/i);
  });
  it('persists a rule-based review when the model is unavailable', async () => {
    const service = new PracticeSessions(new InMemoryEvidenceStore(), { runStructured: async () => { throw new Error('offline'); } });
    const session = await service.createSession('learner');
    const review = await service.generateReview(session.id, {
      transcript: 'A synthetic sentence', exerciseTitle: 'Interview', turnCount: 1,
      metrics: { fluency: 0.8, pronunciation: 0.7, grammar: 0.6 },
    });
    expect(review.summaryText).toContain('1 spoken turn');
    expect(review.grammarFeedback).toContain('60%');
    expect((await service.getSession(session.id)).review).toEqual(review);
  });
  it('retains utterances in a portable session summary', async () => {
    const { summarizeSession } = await import('../../src/llm/practice-session.js');
    const service = new PracticeSessions(new InMemoryEvidenceStore(), { runStructured: async () => { throw new Error('offline'); } });
    const session = await service.createSession('learner');
    const attempt = await service.createAttempt(session.id, { exerciseId: 'exercise', exerciseType: 'speaking', prompt: 'Introduce yourself' });
    await service.addUtterance(session.id, attempt.id, 'learner', 'Hello there');
    expect(summarizeSession(await service.getSession(session.id))).toContain('**LEARNER**: Hello there');
  });
});
