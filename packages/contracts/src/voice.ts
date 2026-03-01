export type VoiceRuntimeState = "stopped" | "running" | "error";
export type VoiceTalkMode = "push_to_talk" | "wake";

export interface VoiceTranscribeRequest {
  fileName?: string;
  mimeType?: string;
  bytesBase64: string;
  language?: string;
}

export interface VoiceTranscribeResponse {
  text: string;
  language?: string;
  durationMs?: number;
  provider: "whisper.cpp" | "faster-whisper" | "cloud-fallback" | "none";
}

export interface VoiceTalkSessionRecord {
  talkSessionId: string;
  mode: VoiceTalkMode;
  state: VoiceRuntimeState;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastTranscriptAt?: string;
  sessionId?: string;
}

export interface VoiceWakeStatus {
  enabled: boolean;
  state: VoiceRuntimeState;
  model: "openwakeword" | "none";
  updatedAt: string;
}

export interface VoiceStatus {
  stt: {
    state: VoiceRuntimeState;
    provider: "whisper.cpp" | "faster-whisper" | "cloud-fallback" | "none";
    lastError?: string;
    updatedAt: string;
  };
  talk: {
    activeSessionId?: string;
    state: VoiceRuntimeState;
    mode?: VoiceTalkMode;
    updatedAt: string;
  };
  wake: VoiceWakeStatus;
}
