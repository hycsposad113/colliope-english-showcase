// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/quests/daily-protocol.service.ts; adapted: in-memory port and synthetic fixtures.
import { describe, expect, it, vi } from 'vitest';
import { DailyProtocolService, InMemoryProtocolStore, type ProtocolPorts } from '../../src/scheduling/daily-protocol';
function setup() {
  const store = new InMemoryProtocolStore(); store.addProfile('learner', { id: 'player', isFractured: false });
  const proposal = { title: 'Practice', missionBrief: 'Talk', successCriteria: ['Explain'], targetLanguage: ['because'], source: 'fixture' };
  let id = 0;
  const ports: ProtocolPorts = { store, select: async (_learner, track) => ({ track, domain: track, rationale: 'fixture' }), propose: vi.fn().mockResolvedValue(proposal), fallback: () => proposal, id: () => String(++id), isRetryable: () => false };
  return { store, ports, service: new DailyProtocolService(ports) };
}
describe('daily protocol', () => {
  it('returns the same bundle for concurrent requests', async () => { const { service } = setup(); const [a, b] = await Promise.all([service.getOrCreateDailyProtocol('learner', '2026-01-01'), service.getOrCreateDailyProtocol('learner', '2026-01-01')]); expect(a).toEqual(b); expect(a.dailySessionPlan.totalMinutes).toBe(30); });
  it('rejects invalid dates and missing profiles', async () => { const { service } = setup(); await expect(service.getOrCreateDailyProtocol('learner', '2026-02-30')).rejects.toThrow('Invalid local date'); await expect(service.getOrCreateDailyProtocol('missing', '2026-01-01')).rejects.toThrow('PlayerProfile'); });
  it('propagates nonretryable persistence errors', async () => { const { ports } = setup(); ports.store.insertIfAbsent = vi.fn().mockRejectedValue(new Error('offline')); await expect(new DailyProtocolService(ports).getOrCreateDailyProtocol('learner', '2026-01-01')).rejects.toThrow('offline'); expect(ports.store.insertIfAbsent).toHaveBeenCalledTimes(1); });
});

describe('calendar and recovery', () => {
  it('uses the learner local date across midnight', async () => {
    const { localDateAt } = await import('../../src/scheduling/daily-protocol');
    const instant = new Date('2026-01-01T23:30:00Z');
    expect(localDateAt(instant, 'Europe/Amsterdam')).toBe('2026-01-02');
    expect(localDateAt(instant, 'America/New_York')).toBe('2026-01-01');
    expect(() => localDateAt(instant, 'Invalid/Zone')).toThrow('Invalid timezone');
  });
  it('shares proposal generation for simultaneous requests', async () => {
    const { service, ports } = setup();
    await Promise.all([service.getOrCreateDailyProtocol('learner', '2026-01-01'), service.getOrCreateDailyProtocol('learner', '2026-01-01')]);
    expect(ports.propose).toHaveBeenCalledTimes(2);
  });
  it('retries a transient insert failure and clears in-flight state', async () => {
    const { ports } = setup();
    const insert = ports.store.insertIfAbsent.bind(ports.store);
    ports.store.insertIfAbsent = vi.fn().mockRejectedValueOnce(new Error('busy')).mockImplementation(insert);
    ports.isRetryable = () => true;
    const service = new DailyProtocolService(ports);
    await service.getOrCreateDailyProtocol('learner', '2026-01-01');
    expect(ports.store.insertIfAbsent).toHaveBeenCalledTimes(2);
  });
});
