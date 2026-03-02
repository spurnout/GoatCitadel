export type ProactiveMode = "off" | "suggest" | "auto_safe";

export interface ProactivePolicy {
  sessionId: string;
  mode: ProactiveMode;
  autonomyBudget: {
    maxActionsPerHour: number;
    maxActionsPerTurn: number;
    cooldownSeconds: number;
  };
  retrievalMode: "standard" | "layered";
  reflectionMode: "off" | "on";
  updatedAt: string;
}

export type ProactiveRunStatus =
  | "running"
  | "no_action"
  | "suggested"
  | "executed"
  | "blocked"
  | "failed";

export type ProactiveActionKind = "tool" | "delegate" | "note";

export interface ProactiveActionRecord {
  actionId: string;
  runId: string;
  sessionId: string;
  kind: ProactiveActionKind;
  status: "suggested" | "executed" | "blocked" | "failed";
  toolName?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProactiveRunRecord {
  runId: string;
  sessionId: string;
  status: ProactiveRunStatus;
  mode: ProactiveMode;
  confidence: number;
  reasoningSummary: string;
  suggestedActions: ProactiveActionRecord[];
  executedActions: ProactiveActionRecord[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}
