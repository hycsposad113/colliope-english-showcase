// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/session-pack.service.ts; adapted: pure pack assembly with injected input and bounded context.
import { createHash } from 'node:crypto';
import { normalizeSuccessCriteriaInput } from '../contracts/live-training.js';
import type { SuccessCriterionRef } from '../game/xp-policy.js';

export interface SessionPackInput {
  id: string;
  missionTitle: string;
  targetLanguage: string[];
  successCriteria: unknown[];
  learnerSituation?: string;
  preferredSessionMinutes?: string;
  promptVersion?: string;
  maxContextItems?: number;
}
export interface SessionPhase {
  kind: 'status_scan' | 'voice_activation' | 'main_dungeon' | 'pressure_encounter' | 'debrief';
  minutes: number;
  instructions: string[];
  learnerOutput: string;
}
export interface AssembledSessionPack {
  id: string;
  missionTitle: string;
  targetMinutes: 10 | 20 | 30;
  phases: SessionPhase[];
  retrievalItems: { id: string; prompt: string; promptLevel: string }[];
  successCriteria: SuccessCriterionRef[];
  learnerSituation?: string;
  promptVersion: string;
  promptHash: string;
}
export function resolveSessionMinutes(value?: string): 10 | 20 | 30 {
  if (value === undefined) return 30;
  return value === '10' ? 10 : value === '30' ? 30 : 20;
}
export function cleanLearnerSituation(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').replaceAll('{{', '{ {').trim().slice(0, 1000);
  return cleaned || undefined;
}
export function buildRetrievalItems(targetLanguage: string[]) {
  return targetLanguage.map((text, index) => ({ id: `language_${index + 1}`, prompt: `Use this target naturally: ${text}`, promptLevel: 'independent' }));
}
/** All five learning functions remain present in short and standard sessions. */
export function buildPhaseSchedule(minutes: 10 | 20 | 30): SessionPhase[] {
  if (minutes === 10) return [
    { kind: 'voice_activation', minutes: 2, instructions: ['Retrieve target language.', 'Continue the conversation.'], learnerOutput: 'Spoken retrieval and conversation' },
    { kind: 'main_dungeon', minutes: 5, instructions: ['Repair the response.', 'Repeat the improved response.'], learnerOutput: 'Spoken repair and repetition' },
    { kind: 'pressure_encounter', minutes: 3, instructions: ['Transfer to a changed context.', 'Self-reflect and say END CALLIOPE SESSION.'], learnerOutput: 'Spoken transfer and end command' },
  ];
  const ratios = minutes === 20 ? [2, 3, 9, 4, 2] : [2, 5, 15, 5, 3];
  return [
    { kind: 'status_scan', minutes: ratios[0], instructions: [`Confirm mission title and ${minutes}-minute target.`], learnerOutput: 'Spoken intent' },
    { kind: 'voice_activation', minutes: ratios[1], instructions: ['Retrieve target language.'], learnerOutput: 'Spoken retrieval' },
    { kind: 'main_dungeon', minutes: ratios[2], instructions: ['Continue the conversation.'], learnerOutput: 'Spoken response' },
    { kind: 'pressure_encounter', minutes: ratios[3], instructions: ['Repair the response.', 'Repeat the improved response.', 'Transfer to a changed context.'], learnerOutput: 'Spoken repair, repetition, and transfer' },
    { kind: 'debrief', minutes: ratios[4], instructions: ['Self-reflect and say END CALLIOPE SESSION.'], learnerOutput: 'Self rating and end command' },
  ];
}
export function assembleSessionPack(input: SessionPackInput): AssembledSessionPack {
  if (!input.id.trim() || !input.missionTitle.trim()) throw new Error('Pack ID and mission title are required');
  const limit = input.maxContextItems ?? 8;
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('Invalid context item limit');
  const targetMinutes = resolveSessionMinutes(input.preferredSessionMinutes);
  const payload = {
    id: input.id,
    missionTitle: input.missionTitle.trim().slice(0, 200),
    targetMinutes,
    phases: buildPhaseSchedule(targetMinutes),
    retrievalItems: buildRetrievalItems(input.targetLanguage.slice(0, limit).map(item => item.slice(0, 200))),
    successCriteria: normalizeSuccessCriteriaInput(input.successCriteria),
    learnerSituation: cleanLearnerSituation(input.learnerSituation),
    promptVersion: input.promptVersion ?? 'live-coach-v2',
  };
  return { ...payload, promptHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16) };
}

/** Normalize bounded context using the same whitespace and template-delimiter rules
 * as the source learner-context builder. First occurrence wins, case-insensitively. */
export function normalizeContextList(values: unknown, limit: number, itemLimit = 120): string[] {
  if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(itemLimit) || itemLimit < 0) {
    throw new Error('Invalid context budget');
  }
  if (!Array.isArray(values) || limit === 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.replace(/\s+/g, ' ').replaceAll('{{', '{ {').trim().slice(0, itemLimit);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length === limit) break;
  }
  return result;
}
