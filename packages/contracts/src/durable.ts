export type DurableRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "dead_lettered";

export interface DurableRunRecord {
  runId: string;
  workflowKey: string;
  status: DurableRunStatus;
  attemptCount: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DurableCheckpointRecord {
  checkpointId: string;
  runId: string;
  checkpointKind:
    | "run_created"
    | "run_started"
    | "run_waiting"
    | "run_resumed"
    | "run_completed"
    | "run_failed"
    | "manual_replay_requested";
  state: Record<string, unknown>;
  createdAt: string;
}

export interface DurableRetryRecord {
  retryId: string;
  runId: string;
  attemptNo: number;
  reason: string;
  nextRetryAt?: string;
  createdAt: string;
}

export interface DurableDeadLetterRecord {
  deadLetterId: string;
  runId: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface DurableDiagnosticsResponse {
  enabled: boolean;
  replayFoundationReady: boolean;
  runCount: number;
  queuedCount: number;
  runningCount: number;
  waitingCount: number;
  failedCount: number;
  deadLetterCount: number;
  recentRuns: DurableRunRecord[];
  recentDeadLetters: DurableDeadLetterRecord[];
  generatedAt: string;
}

