// Extracted from a larger private codebase (CALLIOPE). Source: packages/contracts/src/voice.ts; adapted: local imports and framework-free execution.
export interface VoiceStartEvent {
  sessionId: string;
  exerciseId: string;
  prompt: string;
  difficulty: string;
}

export interface VoiceAudioChunkEvent {
  audio: string; // Base64 PCM audio data
}

export interface VoiceTypedInputEvent {
  text: string;
}

export interface VoiceTranscriptEvent {
  text: string;
  isFinal: boolean;
}

export interface VoiceCoachResponseEvent {
  text: string;
}

export interface VoiceMetricsEvent {
  fluency: number;
  grammar: number;
  pronunciation: number;
  rubricScores: Record<string, number>;
}

export interface VoiceEndEvent {
  sessionId: string;
}

export interface VoiceErrorEvent {
  message: string;
}
