// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/game/xp-policy.ts; adapted: local imports and framework-free execution.
export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * Math.pow(level - 1, 1.55));
}

export function levelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= totalXp) {
    level++;
  }
  return level;
}

export type CompletionStatus =
  | 'full_clear'
  | 'partial_clear'
  | 'recovery_clear'
  | 'aborted'
  | 'skipped'
  | 'excused';

export interface SuccessCriterionRef {
  id: string;
  text: string;
  mandatory: boolean;
}

export interface CriteriaReconciliation {
  ok: boolean;
  mandatorySatisfied: boolean;
  issues: string[];
}

/**
 * Reconcile report criterion IDs against the immutable Session Pack snapshot.
 * Full Clear requires every mandatory ID explicitly in met, none in missed,
 * and no unknowns / duplicates / contradictions.
 */
export function reconcileSuccessCriteria(
  packCriteria: SuccessCriterionRef[],
  met: string[] = [],
  missed: string[] = [],
): CriteriaReconciliation {
  const issues: string[] = [];
  const packIds = new Set(packCriteria.map((c) => c.id));
  const mandatoryIds = packCriteria.filter((c) => c.mandatory).map((c) => c.id);

  const seenMet = new Set<string>();
  for (const id of met) {
    if (seenMet.has(id)) {
      issues.push(`duplicate criterion id in successCriteriaMet: ${id}`);
    }
    seenMet.add(id);
    if (!packIds.has(id)) {
      issues.push(`unknown/invented criterion id in successCriteriaMet: ${id}`);
    }
  }

  const seenMissed = new Set<string>();
  for (const id of missed) {
    if (seenMissed.has(id)) {
      issues.push(`duplicate criterion id in successCriteriaMissed: ${id}`);
    }
    seenMissed.add(id);
    if (!packIds.has(id)) {
      issues.push(
        `unknown/invented criterion id in successCriteriaMissed: ${id}`,
      );
    }
  }

  for (const id of seenMet) {
    if (seenMissed.has(id)) {
      issues.push(
        `contradiction: criterion ${id} listed in both met and missed`,
      );
    }
  }

  for (const id of mandatoryIds) {
    if (!seenMet.has(id)) {
      issues.push(`mandatory criterion not explicitly met: ${id}`);
    }
    if (seenMissed.has(id)) {
      issues.push(`mandatory criterion explicitly missed: ${id}`);
    }
  }

  const mandatorySatisfied =
    mandatoryIds.every((id) => seenMet.has(id) && !seenMissed.has(id)) &&
    issues.length === 0;

  return {
    ok: issues.length === 0 && mandatorySatisfied,
    mandatorySatisfied,
    issues,
  };
}

/**
 * Normalize pack DB String[] values that may be plain text or JSON objects.
 * Plain strings mint stable `sc_<slug>` IDs (never use full prose as id).
 */
import { normalizeSuccessCriteriaInput } from '../contracts/live-training.js';

export function normalizePackSuccessCriteria(
  raw: unknown,
): SuccessCriterionRef[] {
  if (!Array.isArray(raw)) return [];
  return normalizeSuccessCriteriaInput(raw);
}

export function serializePackSuccessCriteria(
  criteria: SuccessCriterionRef[],
): string[] {
  return criteria.map((c) => JSON.stringify(c));
}

export interface DailyXpInputs {
  completionStatus: CompletionStatus;
  speakingMinutes?: number | null;
  durationMinutes?: number | null;
  challengeLevel?: number | null; // 1 to 5
  reportConfidence?: number | null; // 0 to 1 — preserve 0 (nullish, not truthy fallback)
  isSideQuest?: boolean;
  isBoss?: boolean;
  isAscension?: boolean;
  mainDungeonCompleted?: boolean | null;
  pressureEncounterCompleted?: boolean | null;
  /** User explicitly confirmed missing timing values. */
  timingUserConfirmed?: boolean;
  /** Immutable Session Pack success criteria (id/text/mandatory). */
  packSuccessCriteria?: SuccessCriterionRef[];
  /** Report criterion IDs claimed met. */
  successCriteriaMet?: string[];
  /** Report criterion IDs claimed missed. */
  successCriteriaMissed?: string[];
}

export interface CalculatedXpBreakdown {
  baseXp: number;
  speakingBonus: number;
  difficultyBonus: number;
  evidenceQualityBonus: number;
  totalAwarded: number;
  effectiveStatus: CompletionStatus;
  source: string;
  timingEvidenceMissing: boolean;
  criteriaIssues: string[];
}

/**
 * Classify completion conservatively. Never invent 30/20 when timing is null.
 * full_clear base XP requires proven (or user-confirmed) 30 min, 20 speaking,
 * main dungeon, pressure encounter, and mandatory success criteria.
 */
export function classifyCompletion(inputs: DailyXpInputs): {
  status: CompletionStatus;
  timingEvidenceMissing: boolean;
  criteriaIssues: string[];
} {
  if (inputs.completionStatus === 'aborted') {
    return {
      status: 'aborted',
      timingEvidenceMissing: false,
      criteriaIssues: [],
    };
  }
  if (inputs.completionStatus === 'skipped') {
    return {
      status: 'skipped',
      timingEvidenceMissing: false,
      criteriaIssues: [],
    };
  }
  if (inputs.completionStatus === 'excused') {
    return {
      status: 'excused',
      timingEvidenceMissing: false,
      criteriaIssues: [],
    };
  }
  if (inputs.completionStatus === 'recovery_clear') {
    return {
      status: 'recovery_clear',
      timingEvidenceMissing: false,
      criteriaIssues: [],
    };
  }

  const duration = inputs.durationMinutes;
  const speaking = inputs.speakingMinutes;
  const timingMissing =
    duration === null ||
    duration === undefined ||
    speaking === null ||
    speaking === undefined;

  const durationOk =
    typeof duration === 'number' && duration >= 30
      ? true
      : inputs.timingUserConfirmed && typeof duration === 'number'
        ? duration >= 30
        : false;
  // When timing is missing entirely, even user confirmation must supply numbers.
  const speakingOk =
    typeof speaking === 'number' && speaking >= 20
      ? true
      : inputs.timingUserConfirmed && typeof speaking === 'number'
        ? speaking >= 20
        : false;

  const mainOk = inputs.mainDungeonCompleted === true;
  const pressureOk = inputs.pressureEncounterCompleted === true;

  let criteriaIssues: string[] = [];
  let criteriaOk = true;
  if (inputs.packSuccessCriteria !== undefined) {
    const reconciliation = reconcileSuccessCriteria(
      inputs.packSuccessCriteria,
      inputs.successCriteriaMet ?? [],
      inputs.successCriteriaMissed ?? [],
    );
    criteriaIssues = reconciliation.issues;
    criteriaOk = reconciliation.ok;
  }

  if (
    inputs.completionStatus === 'full_clear' &&
    !timingMissing &&
    durationOk &&
    speakingOk &&
    mainOk &&
    pressureOk &&
    criteriaOk
  ) {
    return {
      status: 'full_clear',
      timingEvidenceMissing: false,
      criteriaIssues,
    };
  }

  // Claimed full_clear without evidence → downgrade
  if (
    inputs.completionStatus === 'full_clear' &&
    (timingMissing ||
      !durationOk ||
      !speakingOk ||
      !mainOk ||
      !pressureOk ||
      !criteriaOk)
  ) {
    // User may confirm timing explicitly with numbers
    if (
      inputs.timingUserConfirmed &&
      typeof duration === 'number' &&
      typeof speaking === 'number' &&
      duration >= 30 &&
      speaking >= 20 &&
      mainOk &&
      pressureOk &&
      criteriaOk
    ) {
      return {
        status: 'full_clear',
        timingEvidenceMissing: false,
        criteriaIssues,
      };
    }
    return {
      status: 'partial_clear',
      timingEvidenceMissing: timingMissing,
      criteriaIssues,
    };
  }

  return {
    status: inputs.completionStatus,
    timingEvidenceMissing: timingMissing,
    criteriaIssues,
  };
}

export function xpSourceForStatus(
  status: CompletionStatus,
  opts?: { isSideQuest?: boolean; isBoss?: boolean; isAscension?: boolean },
): string {
  if (opts?.isAscension) return 'ascension_trial';
  if (opts?.isBoss) return 'boss_encounter';
  if (opts?.isSideQuest) {
    return status === 'full_clear' ? 'side_quest_full' : 'side_quest_partial';
  }
  switch (status) {
    case 'full_clear':
      return 'daily_protocol_full';
    case 'partial_clear':
      return 'daily_protocol_partial';
    case 'recovery_clear':
      return 'daily_protocol_recovery';
    default:
      return 'daily_protocol_none';
  }
}

export function calculateDailyXp(inputs: DailyXpInputs): CalculatedXpBreakdown {
  const classified = classifyCompletion(inputs);
  const status = classified.status;

  if (status === 'aborted' || status === 'skipped' || status === 'excused') {
    return {
      baseXp: 0,
      speakingBonus: 0,
      difficultyBonus: 0,
      evidenceQualityBonus: 0,
      totalAwarded: 0,
      effectiveStatus: status,
      source: xpSourceForStatus(status, inputs),
      timingEvidenceMissing: classified.timingEvidenceMissing,
      criteriaIssues: classified.criteriaIssues,
    };
  }

  let baseXp = 0;
  if (inputs.isSideQuest) {
    baseXp = status === 'full_clear' ? 25 : 10;
  } else if (status === 'full_clear') {
    baseXp = 100;
  } else if (status === 'recovery_clear') {
    baseXp = 60;
  } else {
    baseXp = 40; // partial_clear
  }

  // Never treat null speaking as 20 — only award when evidence is numeric >= 20
  let speakingBonus = 0;
  if (
    typeof inputs.speakingMinutes === 'number' &&
    inputs.speakingMinutes >= 20
  ) {
    speakingBonus = 20;
  }

  let difficultyBonus = 0;
  if (inputs.challengeLevel) {
    difficultyBonus = Math.min(
      25,
      Math.max(0, (inputs.challengeLevel - 1) * 6),
    );
  }

  // Preserve confidence 0: use nullish check, not truthy fallback
  let evidenceQualityBonus = 0;
  const confidence = inputs.reportConfidence;
  if (confidence !== null && confidence !== undefined) {
    if (confidence >= 0.8) {
      evidenceQualityBonus = 20;
    } else if (confidence >= 0.5) {
      evidenceQualityBonus = 10;
    }
    // confidence === 0 → 0 bonus (not replaced with 0.8)
  }

  let totalAwarded =
    baseXp + speakingBonus + difficultyBonus + evidenceQualityBonus;

  if (inputs.isSideQuest) {
    totalAwarded = Math.min(40, totalAwarded);
  }

  return {
    baseXp,
    speakingBonus,
    difficultyBonus,
    evidenceQualityBonus,
    totalAwarded,
    effectiveStatus: status,
    source: xpSourceForStatus(status, inputs),
    timingEvidenceMissing: classified.timingEvidenceMissing,
    criteriaIssues: classified.criteriaIssues,
  };
}

export function xpForScore(score: number): number { return Math.max(0, Math.min(100, Math.floor(score))); }
