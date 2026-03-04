export type DecisionReplayRunStatus = "queued" | "running" | "completed" | "failed";
export type DecisionReplayTriggerMode = "scheduled" | "manual";
export type DecisionReplayDecisionType = "chat_turn" | "tool_run";
export type DecisionReplayLabel = "ok" | "uncertain" | "likely_wrong";
export type DecisionReplayCauseClass =
  | "false_refusal_tone"
  | "weak_blocker_explanation"
  | "tool_mismatch"
  | "retrieval_miss"
  | "incomplete_retry_repair"
  | "other";

export interface DecisionReplayRunRecord {
  runId: string;
  triggerMode: DecisionReplayTriggerMode;
  sampleSize: number;
  windowStart: string;
  windowEnd: string;
  status: DecisionReplayRunStatus;
  reportId?: string;
  totalCandidates: number;
  totalScored: number;
  likelyWrongCount: number;
  modelJudgedCount: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface DecisionReplayItemRuleScores {
  honesty: number;
  blockerQuality: number;
  retryQuality: number;
  toolEvidence: number;
  actionability: number;
}

export interface DecisionReplayItemModelScores {
  correctnessLikelihood: number;
  missedToolProbability: number;
  betterResponsePotential: number;
  rationale?: string;
}

export interface DecisionReplayItemRecord {
  itemId: string;
  runId: string;
  decisionType: DecisionReplayDecisionType;
  sessionId?: string;
  turnId?: string;
  toolRunId?: string;
  occurredAt: string;
  wrongnessProbability: number;
  label: DecisionReplayLabel;
  causeClass: DecisionReplayCauseClass;
  clusterKey: string;
  ruleScores: DecisionReplayItemRuleScores;
  modelScores?: DecisionReplayItemModelScores;
  evidence: string[];
  summary?: string;
  inputExcerpt?: string;
  outputExcerpt?: string;
  createdAt: string;
}

export interface DecisionReplayFindingRecord {
  findingId: string;
  runId: string;
  fingerprint: string;
  causeClass: DecisionReplayCauseClass;
  clusterKey: string;
  severity: "low" | "medium" | "high";
  recurrenceCount: number;
  impactedSessions: number;
  impactedTurns: number;
  avgWrongness: number;
  title: string;
  summary: string;
  recommendation?: string;
  isDuplicate: boolean;
  duplicateOfFingerprint?: string;
  createdAt: string;
}

export interface DecisionAutoTuneRecord {
  tuneId: string;
  runId: string;
  findingId?: string;
  tuneClass: "prompt_contract" | "threshold" | "ranking_weight" | "other";
  riskLevel: "low" | "medium" | "high";
  status: "queued" | "applied" | "reverted" | "rejected" | "blocked";
  description: string;
  patch: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAt: string;
  appliedAt?: string;
  revertedAt?: string;
}

export interface WeeklyImprovementReportRecord {
  reportId: string;
  runId: string;
  weekStart: string;
  weekEnd: string;
  summary: {
    sampledDecisions: number;
    likelyWrongCount: number;
    wrongnessRate: number;
    topCauseClasses: Array<{ causeClass: DecisionReplayCauseClass; count: number }>;
    duplicateSuppressedCount: number;
    improvedCount: number;
    regressedCount: number;
  };
  topFindings: DecisionReplayFindingRecord[];
  appliedAutoTunes: DecisionAutoTuneRecord[];
  queuedRecommendations: DecisionAutoTuneRecord[];
  weekOverWeek: {
    improved: string[];
    regressed: string[];
    unchanged: string[];
  };
  previousReportId?: string;
  createdAt: string;
}
