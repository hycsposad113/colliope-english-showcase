// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/agent-jobs/agent-jobs.gateway.ts, apps/api/src/practice/practice.gateway.ts; adapted: socket gateways replaced with an injected EventSink and explicit in-memory room membership.
import type { JobEvent as PipelineEvent, JobStatus } from './job-pipeline.js';

export type JobEvent = { jobId: string; state: 'started' | 'completed' | 'failed' };
export type RealtimePayload = Record<string, unknown>;
export interface EventSink { send(clientId: string, event: string, payload: RealtimePayload): void }
export interface SidecarConnection { close(): void; send?(message: string): void; isOpen?(): boolean }
export interface PracticeMetadata { sessionId: string; attemptId: string; prompt: string }
export interface SidecarPayload {
  event: string;
  sessionId: string;
  text?: string;
  isFinal?: boolean;
  inputMode?: 'audio' | 'typed';
  fluency?: number;
  pronunciation?: number;
  grammar?: number;
  rubricScores?: Record<string, number>;
  message?: string;
  code?: string;
}
export interface SentMessage { clientId: string; event: string; payload: RealtimePayload }

export class MemoryEventSink implements EventSink {
  readonly messages: SentMessage[] = [];
  send(clientId: string, event: string, payload: RealtimePayload): void {
    this.messages.push({ clientId, event, payload });
  }
}

export class RealtimeEvents {
  private readonly rooms = new Map<string, Set<string>>();
  private readonly sidecars = new Map<string, SidecarConnection>();
  private readonly attempts = new Map<string, PracticeMetadata>();
  private readonly connected = new Set<string>();
  constructor(private readonly sink: EventSink) {}

  connect(clientId: string): void { this.connected.add(clientId); }
  join(clientId: string, room: string): void {
    if (!clientId || !room) throw new Error('Client and room are required');
    this.connected.add(clientId);
    const clients = this.rooms.get(room) ?? new Set<string>();
    clients.add(clientId);
    this.rooms.set(room, clients);
  }
  leave(clientId: string, room: string): void {
    const clients = this.rooms.get(room);
    clients?.delete(clientId);
    if (clients?.size === 0) this.rooms.delete(room);
  }
  disconnect(clientId: string): void {
    this.closeSidecar(clientId);
    this.connected.delete(clientId);
    for (const room of [...this.rooms.keys()]) this.leave(clientId, room);
  }
  private broadcast(room: string, event: string, payload: RealtimePayload): void {
    for (const client of this.rooms.get(room) ?? []) this.sink.send(client, event, payload);
  }
  private broadcastAll(event: string, payload: RealtimePayload): void {
    for (const client of this.connected) this.sink.send(client, event, payload);
  }
  jobEvent(jobId: string, type: string, message: string): void {
    const payload = { jobId, type, message, createdAt: new Date() };
    this.broadcastAll('agent-event', payload);
    this.broadcast(`job:${jobId}`, `jobs:${jobId}:events`, payload);
  }
  jobStatus(jobId: string, status: JobStatus): void {
    const payload = { jobId, status, updatedAt: new Date() };
    this.broadcastAll('agent-status', payload);
    this.broadcast(`job:${jobId}`, `jobs:${jobId}:status`, payload);
  }
  // Adapter matches the pipeline's event port.
  status(jobId: string, status: JobStatus): void { this.jobStatus(jobId, status); }
  event(jobId: string, event: PipelineEvent): void { this.jobEvent(jobId, event.type, event.message); }

  attachSidecar(clientId: string, connection: SidecarConnection, metadata?: PracticeMetadata): void {
    this.closeSidecar(clientId);
    this.connected.add(clientId);
    this.sidecars.set(clientId, connection);
    if (metadata) this.attempts.set(clientId, metadata);
  }
  private closeSidecar(clientId: string): void {
    const sidecar = this.sidecars.get(clientId);
    try { sidecar?.close(); }
    catch { /* Disconnect still clears local state if the transport is already broken. */ }
    finally {
      this.sidecars.delete(clientId);
      this.attempts.delete(clientId);
    }
  }
  stopPractice(clientId: string, sessionId: string): void {
    const sidecar = this.sidecars.get(clientId);
    if (sidecar?.isOpen?.()) sidecar.send?.(JSON.stringify({ event: 'stop', sessionId }));
    this.closeSidecar(clientId);
    this.sink.send(clientId, 'practice:ended', { sessionId });
  }
  forwardAudio(clientId: string, sessionId: string, audio: string): boolean {
    const sidecar = this.sidecars.get(clientId);
    if (!sidecar?.isOpen?.()) {
      this.sink.send(clientId, 'practice:error', { message: 'Voice sidecar WS is not connected.' });
      return false;
    }
    sidecar.send?.(JSON.stringify({ event: 'audio', sessionId, audio }));
    return true;
  }
  forwardTyped(clientId: string, sessionId: string, text: string): boolean {
    const sidecar = this.sidecars.get(clientId);
    if (!sidecar?.isOpen?.()) return false;
    sidecar.send?.(JSON.stringify({ event: 'typed', sessionId, text }));
    return true;
  }
  sidecarError(clientId: string): void {
    this.sink.send(clientId, 'practice:error', { message: 'Voice sidecar unavailable, fallback typing mode activated.' });
  }
  handleSidecarMessage(clientId: string, raw: string): boolean {
    let payload: SidecarPayload;
    try { payload = JSON.parse(raw) as SidecarPayload; }
    catch { return false; }
    const metadata = this.attempts.get(clientId);
    if (!payload || typeof payload.event !== 'string' || !metadata || payload.sessionId !== metadata.sessionId) return false;
    this.sink.send(clientId, `practice:${payload.event}`, { ...payload, attemptId: metadata.attemptId });
    return true;
  }
}

// Compatibility with the original string-event example.
export class EventBus {
  private readonly listeners = new Set<(event: JobEvent) => void>();
  subscribe(listener: (event: JobEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: JobEvent): void { for (const listener of this.listeners) listener(event); }
}
