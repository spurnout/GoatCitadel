export type MemoryContextScope = "chat" | "orchestration";
export type MemoryQmdStatus = "generated" | "cache_hit" | "fallback" | "failed";

export interface MemoryContextComposeRequest {
  scope: MemoryContextScope;
  prompt: string;
  sessionId?: string;
  taskId?: string;
  runId?: string;
  phaseId?: string;
  workspace?: string;
  maxContextTokens?: number;
  forceRefresh?: boolean;
}

export interface MemoryCitation {
  candidateId: string;
  sourceType: "transcript" | "file";
  sourceRef: string;
  snippet?: string;
  score: number;
}

export interface MemoryContextPack {
  contextId: string;
  scope: MemoryContextScope;
  sessionId?: string;
  taskId?: string;
  runId?: string;
  phaseId?: string;
  queryHash: string;
  sourcesHash: string;
  contextText: string;
  citations: MemoryCitation[];
  quality: {
    status: MemoryQmdStatus;
    reason?: string;
  };
  originalTokenEstimate: number;
  distilledTokenEstimate: number;
  createdAt: string;
  expiresAt: string;
}

export interface MemoryQmdRunRecord {
  runEventId: string;
  scope: MemoryContextScope;
  sessionId?: string;
  taskId?: string;
  runId?: string;
  phaseId?: string;
  status: MemoryQmdStatus;
  providerId?: string;
  model?: string;
  durationMs: number;
  candidateCount: number;
  citationsCount: number;
  originalTokenEstimate: number;
  distilledTokenEstimate: number;
  savingsPercent: number;
  errorText?: string;
  createdAt: string;
}

export interface MemoryQmdStatsResponse {
  from: string;
  to: string;
  totalRuns: number;
  generatedRuns: number;
  cacheHitRuns: number;
  fallbackRuns: number;
  failedRuns: number;
  originalTokenEstimate: number;
  distilledTokenEstimate: number;
  savingsPercent: number;
}
