// Extracted from a larger private codebase (CALLIOPE). Source: apps/web/src/contexts/SocketContext.tsx; adapted: injectable socket and API ports replace application-specific query, toast and type dependencies.
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

export type SpeakingState = 'idle' | 'starting' | 'active' | 'review';
export interface Turn { speaker: 'learner' | 'coach'; text: string }
export interface SocketState {
  connected: boolean;
  speakingState: SpeakingState;
  history: Turn[];
  transcript: string;
  metrics: Record<string, unknown> | null;
  notice: string | null;
  review: unknown;
  sessionId: string | null;
  attemptId: string | null;
}
export const initialSocketState: SocketState = { connected: false, speakingState: 'idle', history: [], transcript: '', metrics: null, notice: null, review: null, sessionId: null, attemptId: null };
export type Action =
  | { type: 'connection'; connected: boolean }
  | { type: 'start' }
  | { type: 'session'; sessionId: string; attemptId: string }
  | { type: 'active' }
  | { type: 'transcript'; text: string; isFinal: boolean }
  | { type: 'turn'; turn: Turn }
  | { type: 'metrics'; metrics: Record<string, unknown> }
  | { type: 'notice'; message: string }
  | { type: 'review'; review: unknown }
  | { type: 'reset' };
export function socketReducer(state: SocketState, action: Action): SocketState {
  switch (action.type) {
    case 'connection': return { ...state, connected: action.connected };
    case 'start': return { ...initialSocketState, connected: state.connected, speakingState: 'starting' };
    case 'session': return { ...state, sessionId: action.sessionId, attemptId: action.attemptId };
    case 'active': return { ...state, speakingState: 'active' };
    case 'transcript': {
      if (!action.isFinal) return { ...state, transcript: action.text };
      const last = state.history[state.history.length - 1];
      const history = last?.speaker === 'learner' && last.text === action.text ? state.history : [...state.history, { speaker: 'learner' as const, text: action.text }];
      return { ...state, history, transcript: '' };
    }
    case 'turn': return { ...state, history: [...state.history, action.turn] };
    case 'metrics': return { ...state, metrics: action.metrics, notice: null };
    case 'notice': return { ...state, notice: action.message, metrics: null, speakingState: state.speakingState === 'starting' ? 'active' : state.speakingState };
    case 'review': return { ...state, speakingState: 'review', review: action.review };
    case 'reset': return { ...initialSocketState, connected: state.connected };
  }
}
export interface SessionOptions { exerciseId: string; exerciseType: string; prompt: string; difficulty: string; title: string; curriculumPlanId?: string | null }
export interface SocketPorts {
  createSocket(): Socket;
  post<T>(path: string, body?: unknown): Promise<T>;
  onAgentStatus?(data: unknown): void;
  onAgentEvent?(data: unknown): void;
  onError?(message: string): void;
}
export function defaultSocket(url: string, path: string): Socket { return io(url, { path, transports: ['websocket'] }); }
interface ContextValue { state: SocketState; start(options: SessionOptions): Promise<void>; stop(): Promise<void>; send(text: string): void; reset(): void }
const Context = createContext<ContextValue | null>(null);
export function SocketProvider({ children, ports }: { children: ReactNode; ports: SocketPorts }) {
  const [state, dispatch] = useReducer(socketReducer, initialSocketState);
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef(state);
  const exerciseRef = useRef<SessionOptions | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    const socket = ports.createSocket();
    socketRef.current = socket;
    const hide = () => { try { socket.disconnect(); } catch { /* ignore */ } };
    window.addEventListener('pagehide', hide);
    window.addEventListener('beforeunload', hide);
    socket.on('connect', () => dispatch({ type: 'connection', connected: true }));
    socket.on('disconnect', () => dispatch({ type: 'connection', connected: false }));
    socket.on('connect_error', () => dispatch({ type: 'connection', connected: false }));
    socket.on('agent-status', (data: unknown) => ports.onAgentStatus?.(data));
    socket.on('agent-event', (data: unknown) => ports.onAgentEvent?.(data));
    socket.on('practice:session-started', () => dispatch({ type: 'active' }));
    socket.on('practice:transcript', (data: { text: string; isFinal: boolean }) => dispatch({ type: 'transcript', ...data }));
    socket.on('practice:coach-response', (data: { text: string }) => {
      dispatch({ type: 'turn', turn: { speaker: 'coach', text: data.text } });
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    });
    socket.on('practice:metrics', (metrics: Record<string, unknown>) => dispatch({ type: 'metrics', metrics }));
    socket.on('practice:analysis-unavailable', (data: { message: string }) => dispatch({ type: 'notice', message: data.message }));
    socket.on('practice:ended', () => dispatch({ type: 'review', review: null }));
    socket.on('practice:error', (data: { message: string }) => {
      const message = typeof data.message === 'string' && data.message.trim() ? data.message : 'Voice sidecar error. Use typed fallback.';
      dispatch({ type: 'notice', message }); ports.onError?.(message);
    });
    return () => {
      window.removeEventListener('pagehide', hide); window.removeEventListener('beforeunload', hide);
      hide(); socket.removeAllListeners(); socketRef.current = null; window.speechSynthesis.cancel();
    };
  }, [ports]);
  const value = useMemo<ContextValue>(() => ({
    state,
    async start(options) {
      dispatch({ type: 'start' }); exerciseRef.current = options;
      try {
        const session = await ports.post<{ id: string }>('/practice-sessions', { curriculumPlanId: options.curriculumPlanId ?? null });
        const attempt = await ports.post<{ id: string }>(`/practice-sessions/${session.id}/attempts`, { exerciseId: options.exerciseId, exerciseType: options.exerciseType, prompt: options.prompt });
        dispatch({ type: 'session', sessionId: session.id, attemptId: attempt.id });
        socketRef.current?.emit('practice:start', { sessionId: session.id, attemptId: attempt.id, exerciseId: options.exerciseId, prompt: options.prompt, difficulty: options.difficulty });
      } catch (error) { dispatch({ type: 'reset' }); ports.onError?.(error instanceof Error ? error.message : 'Failed to start session'); }
    },
    async stop() {
      const current = stateRef.current; const exercise = exerciseRef.current;
      if (!current.sessionId || !current.attemptId || !exercise) return;
      const turns = current.history.filter(turn => turn.speaker === 'learner');
      const transcript = turns.map(turn => turn.text).join(' ') || 'No utterances recorded.';
      try {
        socketRef.current?.emit('practice:stop', { sessionId: current.sessionId });
        await ports.post(`/practice-sessions/${current.sessionId}/attempts/${current.attemptId}/feedback`, { transcript, feedback: `You completed "${exercise.title}" with ${turns.length} spoken ${turns.length === 1 ? 'turn' : 'turns'}.` });
        await ports.post(`/practice-sessions/${current.sessionId}/complete`);
        const review = await ports.post(`/practice-sessions/${current.sessionId}/reviews`, { transcript, exerciseTitle: exercise.title, exerciseDifficulty: exercise.difficulty, turnCount: turns.length, metrics: current.metrics ?? undefined });
        dispatch({ type: 'review', review });
      } catch (error) { ports.onError?.(`Failed to finish session: ${error instanceof Error ? error.message : String(error)}`); }
    },
    send(text) {
      const trimmed = text.trim(); const sessionId = stateRef.current.sessionId;
      if (!trimmed || !sessionId) return;
      dispatch({ type: 'turn', turn: { speaker: 'learner', text: trimmed } });
      socketRef.current?.emit('practice:typed', { sessionId, text: trimmed });
    },
    reset() { dispatch({ type: 'reset' }); },
  }), [state, ports]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSocket(): ContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('useSocket must be used within a SocketProvider');
  return value;
}
