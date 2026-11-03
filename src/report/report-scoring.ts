// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/live-training/report-scoring.service.ts; adapted: local imports and framework-free execution.
import {
  EvidenceScore,
  V2EvidenceScore,
  VoiceSessionReport,
} from '../contracts/live-training.js';
import { V1_SKILL_DIMENSIONS, V2_SKILL_DIMENSIONS } from '../contracts/game.js';

export interface SkillUpdatePlan {
  dimension: string;
  track: string;
  generation: 'v1' | 'v2';
  oldRating: number;
  newRating: number;
  newConfidence: number;
  newEvidenceCount: number;
  trend: 'rising' | 'stable' | 'declining' | 'insufficient';
  persist: boolean;
  observationStatus:
    | 'observed'
    | 'partially_observed'
    | 'not_observed'
    | 'rejected_uncertain';
}

export interface EvidenceContext {
  /** A normal single report is descriptive evidence, not a mastery decision. */
  isAnchor?: boolean;
  isTransfer?: boolean;
  track?: string;
  asrUncertain?: boolean;
}

export interface CurrentSkillRow {
  dimension: string;
  rating: number;
  confidence: number;
  evidenceCount: number;
  track?: string;
}

const V2_CONFIDENCE_FLOOR = 0.6;

export function persistableSkillUpdates(
  updates: SkillUpdatePlan[],
): SkillUpdatePlan[] {
  return updates.filter((update) => update.persist);
}

export function normalizeSkillTrack(track?: string | null): string {
  if (typeof track === 'string' && track.trim().length > 0) {
    return track.trim();
  }
  return 'global';
}

function findExisting(
  currentSkills: CurrentSkillRow[],
  dimension: string,
  track: string,
): CurrentSkillRow {
  return (
    currentSkills.find(
      (skill) =>
        skill.dimension === dimension &&
        normalizeSkillTrack(skill.track) === track,
    ) || {
      dimension,
      track,
      rating: 0,
      confidence: 0,
      evidenceCount: 0,
    }
  );
}

function unchangedPlan(
  dimension: string,
  track: string,
  generation: 'v1' | 'v2',
  existing: CurrentSkillRow,
  observationStatus: SkillUpdatePlan['observationStatus'],
): SkillUpdatePlan {
  return {
    dimension,
    track,
    generation,
    oldRating: existing.rating,
    newRating: existing.rating,
    newConfidence: existing.confidence,
    newEvidenceCount: existing.evidenceCount,
    trend: existing.evidenceCount < 3 ? 'insufficient' : 'stable',
    persist: false,
    observationStatus,
  };
}

function scoredPlan(
  dimension: string,
  track: string,
  generation: 'v1' | 'v2',
  existing: CurrentSkillRow,
  obs: EvidenceScore,
  maxDelta: number,
  evidenceContext: EvidenceContext,
): SkillUpdatePlan {
  const targetScore = obs.score as number;
  const obsConfidence =
    obs.confidence !== null && obs.confidence !== undefined
      ? obs.confidence
      : 0.5;
  const aggregateEligible =
    existing.evidenceCount + 1 >= 3 &&
    (evidenceContext.isAnchor === true || evidenceContext.isTransfer === true);
  const diff = targetScore - existing.rating;
  const clampedDelta = aggregateEligible
    ? Math.min(maxDelta, Math.max(-maxDelta, diff * 0.1))
    : 0;
  const newRating =
    Math.round(
      Math.min(100, Math.max(0, existing.rating + clampedDelta)) * 10,
    ) / 10;
  const newEvidenceCount = existing.evidenceCount + 1;
  const newConfidence = Math.min(
    1.0,
    existing.confidence + 0.05 * obsConfidence,
  );
  let trend: SkillUpdatePlan['trend'] = 'stable';
  if (newEvidenceCount < 3) {
    trend = 'insufficient';
  } else if (clampedDelta > 0.5) {
    trend = 'rising';
  } else if (clampedDelta < -0.5) {
    trend = 'declining';
  }
  return {
    dimension,
    track,
    generation,
    oldRating: existing.rating,
    newRating,
    newConfidence: Math.round(newConfidence * 100) / 100,
    newEvidenceCount,
    trend,
    persist: true,
    observationStatus: obs.status,
  };
}

function hasDirectV2Evidence(
  obs: V2EvidenceScore | undefined,
  reportAsrUncertain?: boolean,
): obs is V2EvidenceScore {
  if (!obs) return false;
  if (reportAsrUncertain === true || obs.asrUncertain === true) return false;
  if (obs.status === 'not_observed' || obs.score === null) return false;
  if (
    typeof obs.confidence !== 'number' ||
    obs.confidence < V2_CONFIDENCE_FLOOR
  ) {
    return false;
  }
  const evidence = (obs.evidence ?? []).filter(
    (item) => item.trim().length > 0,
  );
  if (evidence.length === 0) return false;
  return obs.status === 'observed' || obs.status === 'partially_observed';
}

function v2RejectionStatus(
  obs: V2EvidenceScore | undefined,
  reportAsrUncertain?: boolean,
): SkillUpdatePlan['observationStatus'] {
  if (!obs) return 'not_observed';
  if (
    reportAsrUncertain === true ||
    obs.asrUncertain === true ||
    obs.confidence < V2_CONFIDENCE_FLOOR
  ) {
    return 'rejected_uncertain';
  }
  return obs.status;
}

export class ReportScoringService {
  calculateSkillUpdates(
    report: VoiceSessionReport,
    currentSkills: CurrentSkillRow[],
    isBossReport: boolean = false,
    evidenceContext: EvidenceContext = {},
  ): SkillUpdatePlan[] {
    const maxDelta = isBossReport ? 3.0 : 2.0;
    const track = normalizeSkillTrack(evidenceContext.track);
    const assessment = report.assessment as Record<
      string,
      EvidenceScore | undefined
    >;

    const v1Updates = V1_SKILL_DIMENSIONS.map((dim) => {
      const existing = findExisting(currentSkills, dim, track);
      const obs: EvidenceScore | undefined = assessment[dim];
      if (!obs || obs.status === 'not_observed' || obs.score === null) {
        return unchangedPlan(
          dim,
          track,
          'v1',
          existing,
          obs?.status ?? 'not_observed',
        );
      }
      return scoredPlan(
        dim,
        track,
        'v1',
        existing,
        obs,
        maxDelta,
        evidenceContext,
      );
    });

    if (!report.assessmentV2) {
      return v1Updates;
    }

    const v2Updates = V2_SKILL_DIMENSIONS.map((dim) => {
      const existing = findExisting(currentSkills, dim, track);
      const obs = report.assessmentV2?.[dim];
      if (!hasDirectV2Evidence(obs, evidenceContext.asrUncertain)) {
        return unchangedPlan(
          dim,
          track,
          'v2',
          existing,
          v2RejectionStatus(obs, evidenceContext.asrUncertain),
        );
      }
      return scoredPlan(
        dim,
        track,
        'v2',
        existing,
        obs,
        maxDelta,
        evidenceContext,
      );
    });

    return [...v1Updates, ...v2Updates];
  }
}
