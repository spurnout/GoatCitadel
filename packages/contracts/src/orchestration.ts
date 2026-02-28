export type LoopMode = "fresh-context" | "compaction";
export type RunMode = "auto" | "hitl";

export interface OrchestrationPhase {
  phaseId: string;
  ownerAgentId: string;
  specPath: string;
  loopMode: LoopMode;
  requiresApproval: boolean;
}

export interface OrchestrationWave {
  waveId: string;
  verify: string[];
  budgetUsd: number;
  ownership: { agentId: string; paths: string[] }[];
  phases: OrchestrationPhase[];
}

export interface OrchestrationPlan {
  planId: string;
  goal: string;
  mode: RunMode;
  maxIterations: number;
  maxRuntimeMinutes: number;
  maxCostUsd: number;
  waves: OrchestrationWave[];
}

export interface OrchestrationRun {
  runId: string;
  planId: string;
  status: "queued" | "running" | "paused" | "failed" | "completed" | "stopped_by_limit";
  startedAt: string;
  endedAt?: string;
  currentWaveId?: string;
  currentPhaseId?: string;
  totalCostUsd: number;
  totalIterations: number;
}