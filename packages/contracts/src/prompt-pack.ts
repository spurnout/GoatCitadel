import type { ChatCitationRecord, ChatTurnTraceRecord } from "./chat.js";

export interface PromptPackRecord {
  packId: string;
  name: string;
  sourceLabel?: string;
  testCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptPackTestRecord {
  testId: string;
  packId: string;
  code: string;
  title: string;
  prompt: string;
  orderIndex: number;
  createdAt: string;
}

export interface PromptPackRunRecord {
  runId: string;
  packId: string;
  testId: string;
  sessionId?: string;
  status: "queued" | "running" | "completed" | "failed";
  providerId?: string;
  model?: string;
  responseText?: string;
  trace?: ChatTurnTraceRecord;
  citations?: ChatCitationRecord[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface PromptPackScoreRecord {
  scoreId: string;
  packId: string;
  testId: string;
  runId: string;
  routingScore: 0 | 1 | 2;
  honestyScore: 0 | 1 | 2;
  handoffScore: 0 | 1 | 2;
  robustnessScore: 0 | 1 | 2;
  usabilityScore: 0 | 1 | 2;
  totalScore: number;
  notes?: string;
  createdAt: string;
}

export interface PromptPackReportRecord {
  pack: PromptPackRecord;
  tests: PromptPackTestRecord[];
  runs: PromptPackRunRecord[];
  scores: PromptPackScoreRecord[];
  summary: {
    totalTests: number;
    completedRuns: number;
    failedRuns: number;
    averageTotalScore: number;
    passRate: number;
    failingCodes: string[];
  };
}

