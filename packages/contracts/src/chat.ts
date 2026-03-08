export type ChatProjectLifecycleStatus = "active" | "archived";
export type ChatSessionScope = "mission" | "external";
export type ChatSessionLifecycleStatus = "active" | "archived";
export type ChatBindingTransport = "llm" | "integration";
export type ChatMessageRole = "user" | "assistant" | "system";
export type ChatAttachmentMediaType = "text" | "image" | "audio" | "video" | "binary";
export type ChatMode = "chat" | "cowork" | "code";
export type ChatWebMode = "auto" | "off" | "quick" | "deep";
export type ChatMemoryMode = "auto" | "on" | "off";
export type ChatThinkingLevel = "minimal" | "standard" | "extended";
export type ChatProactiveMode = "off" | "suggest" | "auto_safe";
export type ChatRetrievalMode = "standard" | "layered";
export type ChatReflectionMode = "off" | "on";
export type ChatPlanningMode = "off" | "advisory";
export type ChatTurnBranchKind = "append" | "retry" | "edit";
export type ChatDelegationMode = "sequential" | "parallel";
export type ChatDelegationStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type ChatDelegationRunStatus = "running" | "completed" | "failed" | "partial";

export type ChatInputPart =
  | {
    type: "text";
    text: string;
  }
  | {
    type: "image_ref";
    attachmentId: string;
    mimeType?: string;
    detail?: "low" | "high" | "auto";
  }
  | {
    type: "audio_ref";
    attachmentId: string;
    mimeType?: string;
  }
  | {
    type: "video_ref";
    attachmentId: string;
    mimeType?: string;
  }
  | {
    type: "file_ref";
    attachmentId: string;
    mimeType?: string;
  };

export interface ChatProjectRecord {
  projectId: string;
  workspaceId?: string;
  name: string;
  description?: string;
  workspacePath: string;
  color?: string;
  lifecycleStatus: ChatProjectLifecycleStatus;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionRecord {
  sessionId: string;
  sessionKey: string;
  workspaceId?: string;
  scope: ChatSessionScope;
  title?: string;
  pinned: boolean;
  lifecycleStatus: ChatSessionLifecycleStatus;
  archivedAt?: string;
  projectId?: string;
  projectName?: string;
  channel: string;
  account: string;
  updatedAt: string;
  lastActivityAt: string;
  tokenTotal: number;
  costUsdTotal: number;
}

export interface ChatSessionBindingRecord {
  sessionId: string;
  transport: ChatBindingTransport;
  connectionId?: string;
  target?: string;
  writable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachmentRecord {
  attachmentId: string;
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  fileName: string;
  mimeType: string;
  mediaType?: ChatAttachmentMediaType;
  sizeBytes: number;
  sha256: string;
  storageRelPath: string;
  extractStatus: "ready" | "unsupported" | "failed";
  extractPreview?: string;
  thumbnailRelPath?: string;
  ocrText?: string;
  transcriptText?: string;
  analysisStatus?: "queued" | "running" | "pending" | "ready" | "failed" | "unsupported";
  createdAt: string;
}

export interface ChatMessageRecord {
  messageId: string;
  sessionId: string;
  role: ChatMessageRole;
  actorType: "user" | "agent" | "system";
  actorId: string;
  content: string;
  parts?: ChatInputPart[];
  timestamp: string;
  tokenInput?: number;
  tokenOutput?: number;
  costUsd?: number;
  attachments?: Array<{
    attachmentId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

export interface ChatSessionPrefsRecord {
  sessionId: string;
  mode: ChatMode;
  planningMode: ChatPlanningMode;
  providerId?: string;
  model?: string;
  webMode: ChatWebMode;
  memoryMode: ChatMemoryMode;
  thinkingLevel: ChatThinkingLevel;
  toolAutonomy: "safe_auto" | "manual";
  visionFallbackModel?: string;
  proactiveMode?: ChatProactiveMode;
  autonomyBudget?: ChatAutonomyBudget;
  retrievalMode?: ChatRetrievalMode;
  reflectionMode?: ChatReflectionMode;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAutonomyBudget {
  maxActionsPerHour: number;
  maxActionsPerTurn: number;
  cooldownSeconds: number;
}

export interface ChatSessionPrefsPatch {
  mode?: ChatMode;
  planningMode?: ChatPlanningMode;
  providerId?: string;
  model?: string;
  webMode?: ChatWebMode;
  memoryMode?: ChatMemoryMode;
  thinkingLevel?: ChatThinkingLevel;
  toolAutonomy?: "safe_auto" | "manual";
  visionFallbackModel?: string;
  proactiveMode?: ChatProactiveMode;
  autonomyBudget?: Partial<ChatAutonomyBudget>;
  retrievalMode?: ChatRetrievalMode;
  reflectionMode?: ChatReflectionMode;
}

export interface ChatCitationRecord {
  citationId: string;
  title?: string;
  url: string;
  snippet?: string;
  sourceType?: "web" | "file" | "tool";
}

export interface ChatToolRunRecord {
  toolRunId: string;
  turnId: string;
  sessionId: string;
  toolName: string;
  status: "started" | "executed" | "blocked" | "approval_required" | "failed";
  approvalId?: string;
  startedAt: string;
  finishedAt?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}

export interface ChatCapabilityUpgradeSuggestion {
  kind: "existing_but_disabled" | "skill_import" | "mcp_template";
  title: string;
  summary: string;
  reason: string;
  sourceProvider?: "agentskill" | "skillsmp" | "github" | "mcp_template";
  sourceRef?: string;
  riskLevel?: "low" | "medium" | "high";
  recommendedAction: "enable_skill" | "install_skill_disabled" | "add_mcp_template" | "switch_tool_profile";
  candidateId?: string;
  requiresUserApproval: true;
}

export interface ChatTurnTraceRecord {
  turnId: string;
  sessionId: string;
  userMessageId: string;
  parentTurnId?: string;
  branchKind: ChatTurnBranchKind;
  sourceTurnId?: string;
  assistantMessageId?: string;
  status: "running" | "completed" | "failed" | "approval_required";
  mode: ChatMode;
  model?: string;
  webMode: ChatWebMode;
  memoryMode: ChatMemoryMode;
  thinkingLevel: ChatThinkingLevel;
  effectiveToolAutonomy?: "safe_auto" | "manual";
  startedAt: string;
  finishedAt?: string;
  toolRuns: ChatToolRunRecord[];
  citations: ChatCitationRecord[];
  routing: {
    usedVisionFallback?: boolean;
    effectiveProviderId?: string;
    effectiveModel?: string;
    liveDataIntent?: boolean;
    primaryProviderId?: string;
    primaryModel?: string;
    fallbackProviderId?: string;
    fallbackModel?: string;
    fallbackReason?: string;
    fallbackUsed?: boolean;
  };
  retrieval?: {
    l0Used: boolean;
    l1Used: boolean;
    l2Used: boolean;
    confidenceL0?: number;
    confidenceL1?: number;
    confidenceL2?: number;
    escalationReason?: string;
  };
  reflection?: {
    attempted: boolean;
    attemptCount: number;
    reason?: string;
    outcome?: "recovered" | "still_failed" | "not_needed";
  };
  proactive?: {
    runId?: string;
    actionCount?: number;
    mode?: ChatProactiveMode;
  };
  guidance?: {
    workspaceId: string;
    globalFilesUsed: string[];
    workspaceFilesUsed: string[];
    truncated: boolean;
  };
  capabilityUpgradeSuggestions?: ChatCapabilityUpgradeSuggestion[];
}

export interface ChatDelegationStepRecord {
  stepId: string;
  runId: string;
  role: string;
  status: ChatDelegationStepStatus;
  index: number;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  output?: string;
  error?: string;
}

export interface ChatDelegationRunRecord {
  runId: string;
  sessionId: string;
  taskId: string;
  objective: string;
  roles: string[];
  mode: ChatDelegationMode;
  providerId?: string;
  model?: string;
  status: ChatDelegationRunStatus;
  startedAt: string;
  finishedAt?: string;
  stitchedOutput?: string;
  citations: ChatCitationRecord[];
  trace?: ChatTurnTraceRecord["routing"];
}

export interface ChatDelegateRequest {
  objective: string;
  roles: string[];
  mode?: ChatDelegationMode;
  providerId?: string;
  model?: string;
}

export interface ChatDelegateResponse {
  runId: string;
  taskId: string;
  steps: ChatDelegationStepRecord[];
  stitchedOutput: string;
  citations: ChatCitationRecord[];
  trace?: ChatTurnTraceRecord["routing"];
}

export interface ChatDelegationSuggestionRecord {
  suggestionId: string;
  sessionId: string;
  objective: string;
  roles: string[];
  mode: ChatDelegationMode;
  confidence: number;
  reason: string;
  source: "manual" | "heuristic" | "proactive";
  createdAt: string;
}

export interface ChatDelegateSuggestRequest {
  objective?: string;
  roles?: string[];
  mode?: ChatDelegationMode;
}

export interface ChatDelegateSuggestResponse {
  suggestion: ChatDelegationSuggestionRecord;
}

export interface ChatDelegateAcceptRequest {
  suggestionId?: string;
  objective: string;
  roles: string[];
  mode?: ChatDelegationMode;
  providerId?: string;
  model?: string;
}

export interface ChatSendMessageRequest {
  content: string;
  parts?: ChatInputPart[];
  providerId?: string;
  model?: string;
  useMemory?: boolean;
  attachments?: string[];
  mode?: ChatMode;
  webMode?: ChatWebMode;
  memoryMode?: ChatMemoryMode;
  thinkingLevel?: ChatThinkingLevel;
  commandText?: string;
  prefsOverride?: ChatSessionPrefsPatch;
}

export interface ChatSendMessageResponse {
  sessionId: string;
  userMessage: ChatMessageRecord;
  assistantMessage?: ChatMessageRecord;
  transport: ChatBindingTransport;
  model?: string;
  turnId?: string;
  trace?: ChatTurnTraceRecord;
  citations?: ChatCitationRecord[];
  routing?: ChatTurnTraceRecord["routing"];
}

export interface ChatThreadTurnBranchRecord {
  siblingTurnIds: string[];
  activeSiblingIndex: number;
  siblingCount: number;
  isSelectedPath: boolean;
  newestLeafTurnId: string;
}

export interface ChatThreadTurnRecord {
  turnId: string;
  parentTurnId?: string;
  branchKind: ChatTurnBranchKind;
  sourceTurnId?: string;
  userMessage: ChatMessageRecord;
  assistantMessage?: ChatMessageRecord;
  trace: ChatTurnTraceRecord;
  toolRuns: ChatToolRunRecord[];
  citations: ChatCitationRecord[];
  branch: ChatThreadTurnBranchRecord;
}

export interface ChatThreadResponse {
  sessionId: string;
  activeLeafTurnId?: string;
  selectedTurnId?: string;
  turns: ChatThreadTurnRecord[];
}

export interface ChatStreamUsageRecord {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
}

export interface ChatStreamApprovalRecord {
  approvalId: string;
  toolName?: string;
  reason?: string;
}

interface ChatStreamChunkBase {
  sessionId: string;
}

export interface ChatStreamMessageStartChunk extends ChatStreamChunkBase {
  type: "message_start";
  turnId: string;
  messageId: string;
  parentTurnId?: string;
  branchKind: ChatTurnBranchKind;
  sourceTurnId?: string;
}

export interface ChatStreamDeltaChunk extends ChatStreamChunkBase {
  type: "delta";
  turnId: string;
  messageId?: string;
  delta: string;
}

export interface ChatStreamUsageChunk extends ChatStreamChunkBase {
  type: "usage";
  turnId: string;
  messageId?: string;
  usage: ChatStreamUsageRecord;
}

export interface ChatStreamMessageDoneChunk extends ChatStreamChunkBase {
  type: "message_done";
  turnId: string;
  messageId: string;
  content: string;
}

export interface ChatStreamToolStartChunk extends ChatStreamChunkBase {
  type: "tool_start";
  turnId: string;
  toolRun: ChatToolRunRecord;
}

export interface ChatStreamToolResultChunk extends ChatStreamChunkBase {
  type: "tool_result";
  turnId: string;
  toolRun: ChatToolRunRecord;
}

export interface ChatStreamApprovalRequiredChunk extends ChatStreamChunkBase {
  type: "approval_required";
  turnId: string;
  approval: ChatStreamApprovalRecord;
}

export interface ChatStreamTraceUpdateChunk extends ChatStreamChunkBase {
  type: "trace_update";
  turnId: string;
  trace: ChatTurnTraceRecord;
}

export interface ChatStreamCitationChunk extends ChatStreamChunkBase {
  type: "citation";
  turnId: string;
  citation: ChatCitationRecord;
}

export interface ChatStreamCapabilitySuggestionChunk extends ChatStreamChunkBase {
  type: "capability_upgrade_suggestion";
  turnId: string;
  capabilityUpgradeSuggestions: ChatCapabilityUpgradeSuggestion[];
}

export interface ChatStreamErrorChunk extends ChatStreamChunkBase {
  type: "error";
  // Route-level stream failures can end after an error chunk without a matching done chunk.
  turnId?: string;
  error: string;
}

export interface ChatStreamDoneChunk extends ChatStreamChunkBase {
  type: "done";
  turnId: string;
  messageId: string;
}

export type ChatStreamChunk =
  | ChatStreamMessageStartChunk
  | ChatStreamDeltaChunk
  | ChatStreamUsageChunk
  | ChatStreamMessageDoneChunk
  | ChatStreamToolStartChunk
  | ChatStreamToolResultChunk
  | ChatStreamApprovalRequiredChunk
  | ChatStreamTraceUpdateChunk
  | ChatStreamCitationChunk
  | ChatStreamCapabilitySuggestionChunk
  | ChatStreamErrorChunk
  | ChatStreamDoneChunk;
