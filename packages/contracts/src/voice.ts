export type VoiceRuntimeState = "stopped" | "running" | "error";
export type VoiceTalkMode = "push_to_talk" | "wake";
export type VoiceProvider = "whisper.cpp" | "faster-whisper" | "cloud-fallback" | "none";
export type VoiceModelLanguageScope = "english" | "multilingual";
export type VoiceRuntimeInstallSource = "managed" | "env_override" | "manual";
export type VoiceRuntimeReadiness = "ready" | "missing" | "broken";

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
  provider: VoiceProvider;
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
    provider: VoiceProvider;
    modelId?: string;
    runtimeReady?: boolean;
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

export interface VoiceModelCatalogEntry {
  id: string;
  label: string;
  languageScope: VoiceModelLanguageScope;
  approxSizeLabel: string;
  sizeBytes: number;
  recommended?: boolean;
  defaultInstall?: boolean;
}

export interface InstalledVoiceModelRecord {
  modelId: string;
  filePath: string;
  sizeBytes: number;
  installedAt?: string;
  active?: boolean;
}

export interface VoiceRuntimeStatus {
  provider: Extract<VoiceProvider, "whisper.cpp">;
  source: VoiceRuntimeInstallSource;
  readiness: VoiceRuntimeReadiness;
  binaryReady: boolean;
  binaryPath?: string;
  binaryVersion?: string;
  ffmpegReady: boolean;
  ffmpegPath?: string;
  manifestPath?: string;
  selectedModelId?: string;
  selectedModelPath?: string;
  installedModels: InstalledVoiceModelRecord[];
  catalog: VoiceModelCatalogEntry[];
  lastError?: string;
}

export interface VoiceRuntimeInstallRequest {
  modelId?: string;
  activate?: boolean;
  repair?: boolean;
}
