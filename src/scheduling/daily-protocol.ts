// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/quests/daily-protocol.service.ts; adapted: injected transactional store and proposal ports replace Prisma and NestJS.
export interface Proposal { title: string; missionBrief: string; successCriteria: string[]; targetLanguage: string[]; source: string }
export interface Selection { domain: string; track: 'academic_communication' | 'life_abroad'; scenarioId?: string; rationale: string }
export interface Quest { id: string; title: string; description: string; type: string; domain: string; targetMinutes: number; targetSpeakingMinutes: number; baseXp: number; successCriteria: string[]; targetLanguage: string[] }
export interface DailyBundle { learnerId: string; playerId: string; localDate: string; timezone: string; status: 'pending'; mainQuest: Quest; sideQuest: Quest; snapshot: { academicSelection: Selection; lifeSelection: Selection; academicSource: string; lifeSource: string }; dailySessionPlan: { toolkitMinutes: number; academicMinutes: number; lifeMinutes: number; debriefMinutes: number; totalMinutes: number } }
export interface Profile { id: string; isFractured: boolean }
export interface ProtocolStore {
  profile(learnerId: string): Promise<Profile | null>;
  find(playerId: string, date: string): Promise<DailyBundle | undefined>;
  /** Must atomically insert or return the existing player/date bundle. */
  insertIfAbsent(bundle: DailyBundle): Promise<DailyBundle>;
}
export interface ProtocolPorts {
  store: ProtocolStore;
  select(learnerId: string, track: Selection['track'], recovery: boolean): Promise<Selection>;
  propose(learnerId: string, date: string, selection: Selection): Promise<Proposal>;
  fallback(selection: Selection, recovery: boolean): Proposal;
  id(): string;
  isRetryable(error: unknown): boolean;
}
/** Calendar date at the learner's location, including DST transitions. */
export function localDateAt(instant: Date, timezone: string): string {
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid instant');
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  } catch {
    throw new Error('Invalid timezone');
  }
  const value = (name: string) => parts.find(part => part.type === name)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export class DailyProtocolService {
  private readonly pending = new Map<string, Promise<DailyBundle>>();
  constructor(private readonly ports: ProtocolPorts) {}
  async getOrCreateDailyProtocol(learnerId: string, localDate: string, timezone = 'UTC'): Promise<DailyBundle> {
    localDateAt(new Date(), timezone);
    const key = JSON.stringify([learnerId, localDate]);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.create(learnerId, localDate, timezone);
    this.pending.set(key, operation);
    try { return await operation; } finally { this.pending.delete(key); }
  }
  async getOrCreateForInstant(learnerId: string, instant: Date, timezone: string): Promise<DailyBundle> {
    return this.getOrCreateDailyProtocol(learnerId, localDateAt(instant, timezone), timezone);
  }
  private async create(learnerId: string, localDate: string, timezone: string): Promise<DailyBundle> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || Number.isNaN(Date.parse(`${localDate}T00:00:00Z`)) || new Date(`${localDate}T00:00:00Z`).toISOString().slice(0, 10) !== localDate) throw new Error('Invalid local date');
    const profile = await this.ports.store.profile(learnerId);
    if (!profile) throw new Error(`PlayerProfile not found for learner ${learnerId}`);
    const existing = await this.ports.store.find(profile.id, localDate);
    if (existing) return existing;
    // Selection is deterministic; generated proposals do not choose the track.
    const academic = await this.ports.select(learnerId, 'academic_communication', profile.isFractured);
    const life = await this.ports.select(learnerId, 'life_abroad', false);
    const academicProposal = await this.ports.propose(learnerId, localDate, academic);
    const lifeProposal = await this.ports.propose(learnerId, localDate, life);
    const academicFallback = this.ports.fallback(academic, profile.isFractured);
    const lifeFallback = this.ports.fallback(life, false);
    const chosen = profile.isFractured ? academicFallback : academicProposal;
    const bundle: DailyBundle = {
      learnerId, playerId: profile.id, localDate, timezone, status: 'pending',
      mainQuest: { id: this.ports.id(), title: chosen.title, description: chosen.missionBrief, type: profile.isFractured ? 'recovery_dungeon' : 'daily_protocol', domain: 'academic_expression', targetMinutes: 16, targetSpeakingMinutes: 13, baseXp: 100, successCriteria: chosen.successCriteria, targetLanguage: chosen.targetLanguage },
      sideQuest: { id: this.ports.id(), title: lifeProposal.title || lifeFallback.title, description: lifeProposal.missionBrief || lifeFallback.missionBrief, type: 'side_quest', domain: 'everyday_conversation', targetMinutes: 9, targetSpeakingMinutes: 7, baseXp: 25, successCriteria: lifeProposal.successCriteria?.length ? lifeProposal.successCriteria : lifeFallback.successCriteria, targetLanguage: lifeProposal.targetLanguage?.length ? lifeProposal.targetLanguage : lifeFallback.targetLanguage },
      snapshot: { academicSelection: academic, lifeSelection: life, academicSource: academicProposal.source, lifeSource: lifeProposal.source },
      dailySessionPlan: { toolkitMinutes: 3, academicMinutes: 16, lifeMinutes: 9, debriefMinutes: 2, totalMinutes: 30 },
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await this.ports.store.insertIfAbsent(bundle); }
      catch (error) {
        lastError = error;
        const raced = await this.ports.store.find(profile.id, localDate);
        if (raced) return raced;
        if (!this.ports.isRetryable(error)) throw error;
      }
    }
    throw lastError;
  }
}
/** Single-process demonstration only; a persistent adapter needs a unique key and transaction. */
export class InMemoryProtocolStore implements ProtocolStore {
  private readonly profiles = new Map<string, Profile>();
  private readonly bundles = new Map<string, DailyBundle>();
  addProfile(learnerId: string, profile: Profile) { this.profiles.set(learnerId, profile); }
  async profile(learnerId: string) { return this.profiles.get(learnerId) ?? null; }
  private key(playerId: string, date: string) { return JSON.stringify([playerId, date]); }
  async find(playerId: string, date: string) { return this.bundles.get(this.key(playerId, date)); }
  async insertIfAbsent(bundle: DailyBundle) {
    const key = this.key(bundle.playerId, bundle.localDate);
    const existing = this.bundles.get(key);
    if (existing) return existing;
    this.bundles.set(key, bundle);
    return bundle;
  }
}
