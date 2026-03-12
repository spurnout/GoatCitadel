import type {
  ChatCitationRecord,
  ChatCodeAutoApplyPosture,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessageRecord,
  ChatMode,
  ChatOrchestrationSpecialistSelection,
  ChatOrchestrationIntensity,
  ChatOrchestrationParallelism,
  ChatOrchestrationProviderPreference,
  ChatOrchestrationReviewDepth,
  ChatOrchestrationRouteDecision,
  ChatOrchestrationVisibility,
  ChatSessionPrefsRecord,
  ChatTurnTraceRecord,
  LlmRuntimeConfig,
} from "@goatcitadel/contracts";

export type OrchestrationRole =
  | "answerer"
  | "researcher"
  | "planner"
  | "worker"
  | "synthesizer"
  | "critic"
  | "coder"
  | "reviewer"
  | "qa-validator";

export interface OrchestrationTaskInput {
  sessionId: string;
  workspaceId: string;
  mode: ChatMode;
  objective: string;
  prefs: ChatSessionPrefsRecord;
  conversation: ChatMessageRecord[];
  historyMessages: ChatCompletionRequest["messages"];
}

export interface ProviderCapabilityRecord {
  providerId: string;
  model: string;
  qualityScore: number;
  speedScore: number;
  costScore: number;
  reliabilityScore: number;
  reasoningScore: number;
  codingScore: number;
  reviewScore: number;
  synthesisScore: number;
  researchScore: number;
  jsonScore: number;
  toolScore: number;
  longContextScore: number;
}

export interface OrchestrationStepPlan {
  stepId: string;
  role: OrchestrationRole;
  stage: number;
  providerId?: string;
  model?: string;
  specialistCandidate?: ChatOrchestrationSpecialistSelection;
}

export interface ModeOrchestrationPolicy {
  mode: ChatMode;
  maxVisibleVisibility: ChatOrchestrationVisibility;
  defaultVisibility: ChatOrchestrationVisibility;
  defaultIntensity: ChatOrchestrationIntensity;
  maxSteps: number;
  maxParallelAgents: number;
  allowHiddenOrchestration: boolean;
  allowParallelWorkers: boolean;
  defaultCodeAutoApply: ChatCodeAutoApplyPosture;
}

export interface OrchestrationPlan {
  workflowTemplate: string;
  routeDecision: ChatOrchestrationRouteDecision;
  steps: OrchestrationStepPlan[];
}

export interface OrchestrationStepExecutionResult {
  stepId: string;
  role: OrchestrationRole;
  index: number;
  specialistCandidateId?: string;
  specialistTitle?: string;
  specialistRole?: string;
  providerId?: string;
  model?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: "completed" | "failed" | "skipped";
  output?: string;
  summary?: string;
  error?: string;
  citations: ChatCitationRecord[];
  routing?: ChatTurnTraceRecord["routing"];
}

export interface OrchestrationExecutionResult {
  finalOutput: string;
  finalSummary: string;
  citations: ChatCitationRecord[];
  routeDecision: ChatOrchestrationRouteDecision;
  stepResults: OrchestrationStepExecutionResult[];
}

export interface OrchestrationExecutionCallbacks {
  createChatCompletion: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
  onStepResult?: (step: OrchestrationStepExecutionResult, currentSteps: OrchestrationStepExecutionResult[]) => Promise<void> | void;
}

export interface OrchestrationRouterInput {
  task: OrchestrationTaskInput;
  runtime: LlmRuntimeConfig;
  capabilities: ProviderCapabilityRecord[];
  policy: ModeOrchestrationPolicy;
}
