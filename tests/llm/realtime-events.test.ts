// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/agent-jobs/agent-jobs.gateway.ts; adapted: in-memory event sink tests.
import { describe, it, expect } from 'vitest';
import { RealtimeEvents, MemoryEventSink } from '../../src/llm/realtime-events.js';
describe('realtime events', () => {
  it('broadcasts status to subscribers of a job room', () => {
    const sink = new MemoryEventSink(); const events = new RealtimeEvents(sink);
    events.join('client','job:1'); events.jobStatus('1','active');
    expect(sink.messages.some(m => m.clientId === 'client' && m.event === 'jobs:1:status')).toBe(true);
  });
  it('removes subscriptions and closes sidecar on disconnect', () => {
    const sink = new MemoryEventSink(); const events = new RealtimeEvents(sink); let closed = false;
    events.join('client','job:1'); events.attachSidecar('client', {close: () => {closed = true;}}); events.disconnect('client'); events.jobStatus('1','active');
    expect(closed).toBe(true); expect(sink.messages).toHaveLength(0);
  });
  it('reports audio failure while typed mode can fall back', () => {
    const sink = new MemoryEventSink();
    const events = new RealtimeEvents(sink);
    expect(events.forwardAudio('client', 'session', 'synthetic')).toBe(false);
    expect(events.forwardTyped('client', 'session', 'hello')).toBe(false);
    expect(sink.messages[0].event).toBe('practice:error');
  });
  it('rejects malformed and unrelated sidecar messages', () => {
    const sink = new MemoryEventSink();
    const events = new RealtimeEvents(sink);
    events.attachSidecar('client', { close() {} }, {sessionId: 'one', attemptId: 'attempt', prompt: 'speak'});
    expect(events.handleSidecarMessage('client', '{')).toBe(false);
    expect(events.handleSidecarMessage('client', JSON.stringify({event:'transcript',sessionId:'two'}))).toBe(false);
    expect(sink.messages).toHaveLength(0);
  });
});
