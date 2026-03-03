import type {
  AgentProfileArchiveInput,
  AgentProfileCreateInput,
  AgentProfileRecord,
  AgentProfileUpdateInput,
  AuthSettingsUpdateInput,
  ApprovalReplayEvent,
  ApprovalRequest,
  ChangeRiskEvaluationResponse,
  ChannelSendInput,
  ChatAttachmentRecord,
  ChatMode,
  ChatAttachmentPreviewResponse,
  ChatCitationRecord,
  ChatDelegateRequest,
  ChatDelegateAcceptRequest,
  ChatDelegateSuggestRequest,
  ChatDelegateSuggestResponse,
  ChatDelegateResponse,
  ChatDelegationSuggestionRecord,
  ChatDelegationRunRecord,
  ChatDelegationStepRecord,
  ChatMessageRecord,
  ChatProjectRecord,
  ChatSendMessageRequest,
  ChatSendMessageResponse,
  ChatSessionBindingRecord,
  ChatSessionPrefsRecord,
  ChatSessionPrefsPatch,
  ChatSessionRecord,
  ChatStreamChunk,
  ChatThinkingLevel,
  ChatTurnTraceRecord,
  ChatWebMode,
  DocsIngestInput,
  EmbeddingIndexInput,
  EmbeddingQueryInput,
  GmailReadQuery,
  GmailSendInput,
  CalendarCreateEventInput,
  CalendarListQuery,
  MemoryContextPack,
  MemorySearchQuery,
  MemoryWriteInput,
  MemoryQmdStatsResponse,
  NpuModelManifest,
  NpuRuntimeStatus,
  OnboardingBootstrapInput,
  OnboardingBootstrapResult,
  OnboardingState,
  PendingApprovalAction,
  IntegrationFormSchema,
  IntegrationPluginRecord,
  McpInvokeResponse,
  McpOAuthStartResponse,
  McpServerRecord,
  McpToolRecord,
  MediaCreateJobRequest,
  MediaJobRecord,
  SessionMeta,
  SessionSummary,
  SessionTimelineItem,
  SseTokenIssueResponse,
  ToolAccessEvaluateRequest,
  ToolAccessEvaluateResponse,
  ToolCatalogEntry,
  ToolGrantCreateInput,
  ToolGrantRecord,
  ToolInvokeResult,
  UiActionState,
  VoiceStatus,
  VoiceTalkSessionRecord,
  VoiceTranscribeResponse,
  BackupCreateResponse,
  BackupManifestRecord,
  RetentionPolicy,
  RetentionPruneResult,
  ResearchRunRecord,
  ResearchSourceRecord,
  ResearchSummaryRecord,
  PromptPackRecord,
  PromptPackTestRecord,
  PromptPackRunRecord,
  PromptPackScoreRecord,
  PromptPackAutoScoreResult,
  PromptPackAutoScoreBatchResult,
  PromptPackReportRecord,
  PromptPackExportRecord,
  ProactivePolicy,
  ProactiveRunRecord,
  LearnedMemoryConflictRecord,
  LearnedMemoryItemRecord,
  LearnedMemoryUpdateInput,
  BankrActionAuditRecord,
  BankrActionPreviewRequest,
  BankrActionPreviewResponse,
  BankrSafetyPolicy,
  DecisionAutoTuneRecord,
  DecisionReplayFindingRecord,
  DecisionReplayItemRecord,
  DecisionReplayRunRecord,
  SkillActivationPolicy,
  SkillListItem,
  SkillStateRecord,
  SkillRuntimeState,
  WeeklyImprovementReportRecord,
} from "@goatcitadel/contracts";

export type { SessionSummary, SessionTimelineItem };

const DEFAULT_GATEWAY_HOST = "127.0.0.1";
const DEFAULT_GATEWAY_PORT = 8787;
const DEFAULT_GATEWAY_HOST_ALLOWLIST = ["bld"];
const API_BASE = import.meta.env.VITE_GATEWAY_URL ?? inferDefaultGatewayBaseUrl();
const AUTH_STORAGE_KEY = "goatcitadel.gateway.auth";

interface GatewayAuthState {
  mode?: "none" | "token" | "basic";
  token?: string;
  username?: string;
  password?: string;
  tokenQueryParam?: string;
}

function inferDefaultGatewayBaseUrl(): string {
  if (typeof window === "undefined") {
    return `http://${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}`;
  }
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname || DEFAULT_GATEWAY_HOST;
  if (isTrustedGatewayHost(host, import.meta.env.VITE_GATEWAY_ALLOWED_HOSTS)) {
    return `${protocol}//${host}:${DEFAULT_GATEWAY_PORT}`;
  }
  console.warn(
    `[goatcitadel] refusing inferred gateway host "${host}" because it is not trusted; `
    + `falling back to ${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}. Set VITE_GATEWAY_ALLOWED_HOSTS to override.`,
  );
  return `${protocol}//${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}`;
}

export function isTrustedGatewayHost(hostname: string, rawAllowlist?: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) {
    return false;
  }
  if (
    host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
    || host === "[::1]"
    || host.endsWith(".ts.net")
  ) {
    return true;
  }
  if (isPrivateOrCarrierGradeIpv4(host)) {
    return true;
  }
  const allowlist = (rawAllowlist ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const mergedAllowlist = [...DEFAULT_GATEWAY_HOST_ALLOWLIST, ...allowlist];
  return mergedAllowlist.some((entry) => {
    if (entry.startsWith(".")) {
      return host.endsWith(entry);
    }
    return host === entry;
  });
}

function isPrivateOrCarrierGradeIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => !Number.isFinite(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  return a === 100 && b >= 64 && b <= 127;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = readGatewayAuthHeaders(path);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.method && init.method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export interface UiActionResult<T> {
  state: UiActionState;
  startedAt: string;
  finishedAt: string;
  data?: T;
  error?: string;
}

export async function runUiAction<T>(operation: () => Promise<T>): Promise<UiActionResult<T>> {
  const startedAt = new Date().toISOString();
  try {
    const data = await operation();
    return {
      state: "success",
      startedAt,
      finishedAt: new Date().toISOString(),
      data,
    };
  } catch (error) {
    return {
      state: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      error: (error as Error).message,
    };
  }
}

function readGatewayAuthHeaders(_path: string): Record<string, string> {
  const auth = readGatewayAuthState();
  if (!auth) {
    return {};
  }

  if (auth.mode === "token" && auth.token?.trim()) {
    return {
      Authorization: `Bearer ${auth.token.trim()}`,
    };
  }
  if (auth.mode === "basic" && auth.username && auth.password) {
    const encoded = btoa(`${auth.username}:${auth.password}`);
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  if (auth.token?.trim()) {
    return {
      Authorization: `Bearer ${auth.token.trim()}`,
    };
  }
  return {};
}

function readGatewayAuthState(): GatewayAuthState | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as GatewayAuthState;
  } catch {
    // ignore auth parse errors
  }
  return undefined;
}

export interface SessionsResponse {
  items: SessionMeta[];
  nextCursor?: string;
}

export interface ApprovalsResponse {
  items: ApprovalRequest[];
}

export interface ApprovalReplayResponse {
  approval: ApprovalRequest;
  events: ApprovalReplayEvent[];
  pendingAction?: PendingApprovalAction;
}

export interface CostSummaryResponse {
  scope: string;
  from: string;
  to: string;
  items: Array<{
    key: string;
    tokenInput: number;
    tokenOutput: number;
    tokenCachedInput: number;
    tokenTotal: number;
    costUsd: number;
  }>;
}

export interface TaskRecord {
  taskId: string;
  title: string;
  description?: string;
  status: "planning" | "inbox" | "assigned" | "in_progress" | "testing" | "review" | "done" | "blocked";
  priority: "low" | "normal" | "high" | "urgent";
  assignedAgentId?: string;
  createdBy?: string;
  dueAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskActivityRecord {
  activityId: string;
  taskId: string;
  agentId?: string;
  activityType: "spawned" | "updated" | "completed" | "file_created" | "status_changed" | "comment";
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TaskDeliverableRecord {
  deliverableId: string;
  taskId: string;
  deliverableType: "file" | "url" | "artifact";
  title: string;
  path?: string;
  description?: string;
  createdAt: string;
}

export interface TaskSubagentSession {
  subagentSessionId: string;
  taskId: string;
  agentSessionId: string;
  agentName?: string;
  status: "active" | "completed" | "failed" | "killed";
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
}

export interface RealtimeEvent {
  eventId: string;
  eventType: string;
  source: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface DashboardStateResponse {
  timestamp: string;
  sessions: SessionsResponse["items"];
  pendingApprovals: number;
  activeSubagents: number;
  taskStatusCounts: Array<{ status: string; count: number }>;
  recentEvents: RealtimeEvent[];
  dailyCostUsd: number;
}

export interface SystemVitalsResponse {
  hostname: string;
  platform: string;
  release: string;
  uptimeSeconds: number;
  loadAverage: number[];
  cpuCount: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  processRssBytes: number;
  processHeapUsedBytes: number;
}

export interface CronJobsResponse {
  items: Array<{
    jobId: string;
    name: string;
    schedule: string;
    enabled: boolean;
    lastRunAt?: string;
    nextRunAt?: string;
  }>;
}

export interface OperatorsResponse {
  items: Array<{
    operatorId: string;
    sessionCount: number;
    activeSessions: number;
    lastActivityAt?: string;
  }>;
}

export interface AgentsResponse {
  items: AgentProfileRecord[];
  view?: "active" | "archived" | "all";
}

export interface RuntimeSettingsResponse {
  environment: string;
  defaultToolProfile: string;
  budgetMode: "saver" | "balanced" | "power";
  workspaceDir: string;
  writeJailRoots: string[];
  readOnlyRoots: string[];
  networkAllowlist: string[];
  approvalExplainer: {
    enabled: boolean;
    mode: "async";
    minRiskLevel: "caution" | "danger" | "nuclear";
    providerId?: string;
    model?: string;
    timeoutMs: number;
    maxPayloadChars: number;
  };
  memory: {
    enabled: boolean;
    qmd: {
      enabled: boolean;
      applyToChat: boolean;
      applyToOrchestration: boolean;
      minPromptChars: number;
      maxContextTokens: number;
      cacheTtlSeconds: number;
      distillerProviderId?: string;
      distillerModel?: string;
    };
  };
  auth: {
    mode: "none" | "token" | "basic";
    allowLoopbackBypass: boolean;
    tokenConfigured: boolean;
    basicConfigured: boolean;
  };
  llm: {
    activeProviderId: string;
    activeModel: string;
    providers: Array<{
      providerId: string;
      label: string;
      baseUrl: string;
      apiStyle: "openai-chat-completions";
      defaultModel: string;
      hasApiKey: boolean;
      apiKeySource: "inline" | "env" | "keychain" | "none";
      hasKeychainSecret?: boolean;
      apiKeyRef?: string;
      capabilities?: {
        vision: boolean;
        audio: boolean;
        video: boolean;
        toolCalling: boolean;
        jsonMode: boolean;
      };
    }>;
  };
  mesh: {
    enabled: boolean;
    mode: "lan" | "wan" | "tailnet";
    nodeId: string;
    mdns: boolean;
    staticPeers: string[];
    requireMtls: boolean;
    tailnetEnabled: boolean;
  };
  npu: {
    enabled: boolean;
    autoStart: boolean;
    sidecarUrl: string;
    status: NpuRuntimeStatus;
  };
}

export interface OnboardingCompleteResponse {
  state: OnboardingState;
}

export interface IntegrationCatalogEntry {
  catalogId: string;
  kind: "channel" | "model_provider" | "productivity" | "automation" | "platform";
  key: string;
  label: string;
  description: string;
  maturity: "native" | "plugin" | "disabled" | "beta" | "planned";
  authMethods: string[];
  capabilities: string[];
  docsUrl?: string;
  formSchema?: IntegrationFormSchema;
  pluginId?: string;
}

export interface IntegrationConnection {
  connectionId: string;
  catalogId: string;
  kind: "channel" | "model_provider" | "productivity" | "automation" | "platform";
  key: string;
  label: string;
  enabled: boolean;
  status: "connected" | "disconnected" | "error" | "paused";
  config: Record<string, unknown>;
  pluginId?: string;
  pluginVersion?: string;
  pluginEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  lastError?: string;
}

export interface LlmChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index: number;
    finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      [key: string]: unknown;
    };
  }>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MeshStatusResponse {
  enabled: boolean;
  mode: "lan" | "wan" | "tailnet";
  localNodeId: string;
  tailnetEnabled: boolean;
  nodesOnline: number;
  activeLeases: number;
  ownedSessions: number;
}

export interface MeshNodeRecord {
  nodeId: string;
  label?: string;
  advertiseAddress?: string;
  transport: "lan" | "wan" | "tailnet";
  status: "online" | "suspect" | "offline";
  capabilities: string[];
  tlsFingerprint?: string;
  joinedAt: string;
  lastSeenAt: string;
}

export interface MeshLeaseRecord {
  leaseKey: string;
  holderNodeId: string;
  fencingToken: number;
  expiresAt: string;
  updatedAt: string;
}

export interface MeshSessionOwnerRecord {
  sessionId: string;
  ownerNodeId: string;
  epoch: number;
  claimedAt: string;
  updatedAt: string;
}

export interface MeshReplicationOffsetRecord {
  consumerNodeId: string;
  sourceNodeId: string;
  lastReplicationId?: string;
  updatedAt: string;
}

export async function fetchSessions(): Promise<SessionsResponse> {
  return request<SessionsResponse>("/api/v1/sessions?limit=50");
}

export async function fetchSessionSummary(sessionId: string): Promise<SessionSummary> {
  return request<SessionSummary>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/summary`);
}

export async function fetchSessionTimeline(sessionId: string, limit = 200): Promise<{ items: SessionTimelineItem[] }> {
  return request<{ items: SessionTimelineItem[] }>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/timeline?limit=${Math.max(1, Math.min(limit, 1000))}`,
  );
}

export interface ChatProjectsResponse {
  items: ChatProjectRecord[];
  view?: "active" | "archived" | "all";
}

export interface ChatSessionsResponse {
  items: ChatSessionRecord[];
  nextCursor?: string;
}

export interface ChatMessagesResponse {
  items: ChatMessageRecord[];
}

export async function fetchChatProjects(view: "active" | "archived" | "all" = "active", limit = 300): Promise<ChatProjectsResponse> {
  return request<ChatProjectsResponse>(`/api/v1/chat/projects?view=${encodeURIComponent(view)}&limit=${limit}`);
}

export async function createChatProject(input: {
  name: string;
  description?: string;
  workspacePath: string;
  color?: string;
}): Promise<ChatProjectRecord> {
  return request<ChatProjectRecord>("/api/v1/chat/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateChatProject(projectId: string, input: {
  name?: string;
  description?: string;
  workspacePath?: string;
  color?: string;
}): Promise<ChatProjectRecord> {
  return request<ChatProjectRecord>(`/api/v1/chat/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveChatProject(projectId: string): Promise<ChatProjectRecord> {
  return request<ChatProjectRecord>(`/api/v1/chat/projects/${encodeURIComponent(projectId)}/archive`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function restoreChatProject(projectId: string): Promise<ChatProjectRecord> {
  return request<ChatProjectRecord>(`/api/v1/chat/projects/${encodeURIComponent(projectId)}/restore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function hardDeleteChatProject(projectId: string): Promise<{ deleted: boolean; projectId: string; mode: "hard" }> {
  return request<{ deleted: boolean; projectId: string; mode: "hard" }>(
    `/api/v1/chat/projects/${encodeURIComponent(projectId)}?mode=hard`,
    {
      method: "DELETE",
      body: JSON.stringify({}),
    },
  );
}

export async function fetchChatSessions(input?: {
  scope?: "mission" | "external" | "all";
  projectId?: string;
  q?: string;
  view?: "active" | "archived" | "all";
  limit?: number;
  cursor?: string;
}): Promise<ChatSessionsResponse> {
  const query = new URLSearchParams();
  if (input?.scope) query.set("scope", input.scope);
  if (input?.projectId) query.set("projectId", input.projectId);
  if (input?.q) query.set("q", input.q);
  if (input?.view) query.set("view", input.view);
  query.set("limit", String(input?.limit ?? 200));
  if (input?.cursor) query.set("cursor", input.cursor);
  return request<ChatSessionsResponse>(`/api/v1/chat/sessions?${query.toString()}`);
}

export async function createChatSession(input?: { title?: string; projectId?: string }): Promise<ChatSessionRecord> {
  return request<ChatSessionRecord>("/api/v1/chat/sessions", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function updateChatSession(sessionId: string, input: { title?: string }): Promise<ChatSessionRecord> {
  return request<ChatSessionRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function pinChatSession(sessionId: string): Promise<ChatSessionRecord> {
  return request<ChatSessionRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/pin`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function unpinChatSession(sessionId: string): Promise<ChatSessionRecord> {
  return request<ChatSessionRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/unpin`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function archiveChatSession(sessionId: string): Promise<ChatSessionRecord> {
  return request<ChatSessionRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/archive`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function restoreChatSession(sessionId: string): Promise<ChatSessionRecord> {
  return request<ChatSessionRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/restore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function assignChatSessionProject(sessionId: string, projectId?: string): Promise<ChatSessionRecord> {
  return request<ChatSessionRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/project`, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function setChatSessionBinding(sessionId: string, input: {
  transport: "llm" | "integration";
  connectionId?: string;
  target?: string;
  writable?: boolean;
}): Promise<ChatSessionBindingRecord> {
  return request<ChatSessionBindingRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/binding`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchChatSessionBinding(sessionId: string): Promise<{ item: ChatSessionBindingRecord | null }> {
  return request<{ item: ChatSessionBindingRecord | null }>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/binding`);
}

export async function fetchChatMessages(sessionId: string, limit = 200, cursor?: string): Promise<ChatMessagesResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(Math.max(1, Math.min(limit, 1000))));
  if (cursor) {
    query.set("cursor", cursor);
  }
  return request<ChatMessagesResponse>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`,
  );
}

export async function sendChatMessage(sessionId: string, input: ChatSendMessageRequest): Promise<ChatSendMessageResponse> {
  return request<ChatSendMessageResponse>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function sendAgentChatMessage(sessionId: string, input: ChatSendMessageRequest): Promise<ChatSendMessageResponse> {
  return request<ChatSendMessageResponse>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/agent-send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function streamChatMessage(
  sessionId: string,
  input: ChatSendMessageRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
): Promise<void> {
  const authHeaders = readGatewayAuthHeaders(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages/stream`);
  const response = await fetch(`${API_BASE}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      ...authHeaders,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  await consumeSseResponse(response.body, onChunk);
}

export async function streamAgentChatMessage(
  sessionId: string,
  input: ChatSendMessageRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
): Promise<void> {
  const authHeaders = readGatewayAuthHeaders(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/agent-send/stream`);
  const response = await fetch(`${API_BASE}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/agent-send/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      ...authHeaders,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  await consumeSseResponse(response.body, onChunk);
}

export async function fetchChatSessionPrefs(sessionId: string): Promise<ChatSessionPrefsRecord> {
  return request<ChatSessionPrefsRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/prefs`);
}

export async function updateChatSessionPrefs(
  sessionId: string,
  input: ChatSessionPrefsPatch,
): Promise<ChatSessionPrefsRecord> {
  return request<ChatSessionPrefsRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/prefs`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export interface ChatProactiveStatusResponse {
  policy: ProactivePolicy;
  idleSeconds: number;
  hasRunningTurn: boolean;
  pendingSuggestions: number;
  actionsLastHour: number;
  lastRun?: ProactiveRunRecord;
}

export async function fetchChatProactiveStatus(sessionId: string): Promise<ChatProactiveStatusResponse> {
  return request<ChatProactiveStatusResponse>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/proactive/status`,
  );
}

export async function updateChatProactivePolicy(
  sessionId: string,
  input: Partial<{
    proactiveMode: ProactivePolicy["mode"];
    autonomyBudget: Partial<ProactivePolicy["autonomyBudget"]>;
    retrievalMode: ProactivePolicy["retrievalMode"];
    reflectionMode: ProactivePolicy["reflectionMode"];
  }>,
): Promise<ProactivePolicy> {
  return request<ProactivePolicy>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/proactive/policy`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function triggerChatProactive(
  sessionId: string,
  input?: {
    source?: "scheduler" | "manual" | "chat";
    reason?: string;
  },
): Promise<ProactiveRunRecord> {
  return request<ProactiveRunRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/proactive/trigger`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function fetchChatProactiveRuns(sessionId: string, limit = 50): Promise<{ items: ProactiveRunRecord[] }> {
  return request<{ items: ProactiveRunRecord[] }>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/proactive/runs?limit=${Math.max(1, Math.min(limit, 500))}`,
  );
}

export async function fetchChatLearnedMemory(
  sessionId: string,
  limit = 200,
): Promise<{
  items: LearnedMemoryItemRecord[];
  conflicts: LearnedMemoryConflictRecord[];
}> {
  return request<{
    items: LearnedMemoryItemRecord[];
    conflicts: LearnedMemoryConflictRecord[];
  }>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/learned-memory?limit=${Math.max(1, Math.min(limit, 1000))}`,
  );
}

export async function updateChatLearnedMemoryItem(
  sessionId: string,
  itemId: string,
  input: LearnedMemoryUpdateInput,
): Promise<LearnedMemoryItemRecord> {
  return request<LearnedMemoryItemRecord>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/learned-memory/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function rebuildChatLearnedMemory(
  sessionId: string,
): Promise<{
  rebuiltAt: string;
  items: LearnedMemoryItemRecord[];
  conflicts: LearnedMemoryConflictRecord[];
}> {
  return request<{
    rebuiltAt: string;
    items: LearnedMemoryItemRecord[];
    conflicts: LearnedMemoryConflictRecord[];
  }>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/learned-memory/rebuild`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function suggestChatDelegation(
  sessionId: string,
  input: ChatDelegateSuggestRequest = {},
): Promise<ChatDelegateSuggestResponse> {
  return request<ChatDelegateSuggestResponse>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/delegate/suggest`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function acceptChatDelegation(
  sessionId: string,
  input: ChatDelegateAcceptRequest,
): Promise<ChatDelegateResponse> {
  return request<ChatDelegateResponse>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/delegate/accept`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchChatCommandCatalog(): Promise<{
  items: Array<{ command: string; usage: string; description: string }>;
}> {
  return request<{ items: Array<{ command: string; usage: string; description: string }> }>("/api/v1/chat/catalog/commands");
}

export async function parseChatCommand(
  sessionId: string,
  commandText: string,
): Promise<{
  ok: boolean;
  command: string;
  args: string[];
  message: string;
  prefs?: ChatSessionPrefsRecord;
  research?: ResearchSummaryRecord;
}> {
  return request(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/commands/parse`, {
    method: "POST",
    body: JSON.stringify({ commandText }),
  });
}

export async function runChatResearch(
  sessionId: string,
  input: {
    query: string;
    mode?: "quick" | "deep";
    providerId?: string;
    model?: string;
  },
): Promise<ResearchSummaryRecord> {
  return request<ResearchSummaryRecord>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/research/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchChatResearchRun(
  sessionId: string,
  runId: string,
): Promise<{
  run: ResearchRunRecord;
  sources: ResearchSourceRecord[];
}> {
  return request<{ run: ResearchRunRecord; sources: ResearchSourceRecord[] }>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/research/${encodeURIComponent(runId)}`,
  );
}

export async function runChatDelegation(
  sessionId: string,
  input: ChatDelegateRequest,
): Promise<ChatDelegateResponse> {
  return request<ChatDelegateResponse>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/delegate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface ChatDelegationStreamChunk {
  type: "status" | "step" | "done" | "error";
  runId?: string;
  taskId?: string;
  message?: string;
  step?: {
    stepId: string;
    runId: string;
    role: string;
    status: string;
    index: number;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    output?: string;
    error?: string;
  };
  result?: ChatDelegateResponse;
  error?: string;
}

export async function streamChatDelegation(
  sessionId: string,
  input: ChatDelegateRequest,
  onChunk: (chunk: ChatDelegationStreamChunk) => void,
): Promise<void> {
  const authHeaders = readGatewayAuthHeaders(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/delegate/stream`);
  const response = await fetch(`${API_BASE}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/delegate/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      ...authHeaders,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex < 0) {
        break;
      }
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) {
        continue;
      }
      const dataText = dataLines.join("\n");
      try {
        onChunk(JSON.parse(dataText) as ChatDelegationStreamChunk);
      } catch {
        // ignore SSE parse noise
      }
    }
  }
}

export async function fetchChatDelegationRun(
  sessionId: string,
  runId: string,
): Promise<{
  run: ChatDelegationRunRecord;
  steps: ChatDelegationStepRecord[];
}> {
  return request(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/delegations/${encodeURIComponent(runId)}`);
}

export async function importPromptPack(input: {
  content: string;
  name?: string;
  sourceLabel?: string;
  packId?: string;
}): Promise<{
  pack: PromptPackRecord;
  tests: PromptPackTestRecord[];
}> {
  return request("/api/v1/prompt-packs/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchPromptPacks(limit = 200): Promise<{ items: PromptPackRecord[] }> {
  return request<{ items: PromptPackRecord[] }>(`/api/v1/prompt-packs?limit=${Math.max(1, Math.min(limit, 2000))}`);
}

export async function fetchPromptPackTests(packId: string, limit = 2000): Promise<{ items: PromptPackTestRecord[] }> {
  return request<{ items: PromptPackTestRecord[] }>(
    `/api/v1/prompt-packs/${encodeURIComponent(packId)}/tests?limit=${Math.max(1, Math.min(limit, 2000))}`,
  );
}

export async function runPromptPackTest(
  packId: string,
  testId: string,
  input?: {
    sessionId?: string;
    providerId?: string;
    model?: string;
    placeholderValues?: Record<string, string>;
  },
): Promise<PromptPackRunRecord> {
  return request<PromptPackRunRecord>(`/api/v1/prompt-packs/${encodeURIComponent(packId)}/tests/${encodeURIComponent(testId)}/run`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function scorePromptPackTest(
  packId: string,
  testId: string,
  input: {
    runId: string;
    routingScore: 0 | 1 | 2;
    honestyScore: 0 | 1 | 2;
    handoffScore: 0 | 1 | 2;
    robustnessScore: 0 | 1 | 2;
    usabilityScore: 0 | 1 | 2;
    notes?: string;
  },
): Promise<PromptPackScoreRecord> {
  return request<PromptPackScoreRecord>(`/api/v1/prompt-packs/${encodeURIComponent(packId)}/tests/${encodeURIComponent(testId)}/score`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function autoScorePromptPackTest(
  packId: string,
  testId: string,
  input?: {
    runId?: string;
    providerId?: string;
    model?: string;
    force?: boolean;
  },
): Promise<PromptPackAutoScoreResult> {
  return request<PromptPackAutoScoreResult>(
    `/api/v1/prompt-packs/${encodeURIComponent(packId)}/tests/${encodeURIComponent(testId)}/auto-score`,
    {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    },
  );
}

export async function autoScorePromptPackBatch(
  packId: string,
  input?: {
    onlyUnscored?: boolean;
    limit?: number;
    providerId?: string;
    model?: string;
    force?: boolean;
  },
): Promise<PromptPackAutoScoreBatchResult> {
  return request<PromptPackAutoScoreBatchResult>(
    `/api/v1/prompt-packs/${encodeURIComponent(packId)}/auto-score`,
    {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    },
  );
}

export async function fetchPromptPackReport(packId: string): Promise<PromptPackReportRecord> {
  return request<PromptPackReportRecord>(`/api/v1/prompt-packs/${encodeURIComponent(packId)}/report`);
}

export async function fetchPromptPackExport(packId: string): Promise<PromptPackExportRecord> {
  return request<PromptPackExportRecord>(`/api/v1/prompt-packs/${encodeURIComponent(packId)}/export`);
}

export async function exportPromptPackReport(
  packId: string,
  input?: { includeHistory?: boolean },
): Promise<PromptPackExportRecord> {
  return request<PromptPackExportRecord>(`/api/v1/prompt-packs/${encodeURIComponent(packId)}/export`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function resetPromptPack(
  packId: string,
  input?: {
    clearRuns?: boolean;
    clearScores?: boolean;
  },
): Promise<{
  packId: string;
  deletedRuns: number;
  deletedScores: number;
  export: PromptPackExportRecord;
}> {
  return request<{
    packId: string;
    deletedRuns: number;
    deletedScores: number;
    export: PromptPackExportRecord;
  }>(`/api/v1/prompt-packs/${encodeURIComponent(packId)}/reset`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function fetchImprovementReports(limit = 24): Promise<{ items: WeeklyImprovementReportRecord[] }> {
  return request<{ items: WeeklyImprovementReportRecord[] }>(
    `/api/v1/improvement/reports?limit=${Math.max(1, Math.min(limit, 260))}`,
  );
}

export async function fetchImprovementReport(reportId: string): Promise<WeeklyImprovementReportRecord> {
  return request<WeeklyImprovementReportRecord>(`/api/v1/improvement/reports/${encodeURIComponent(reportId)}`);
}

export async function runImprovementReplay(input?: {
  sampleSize?: number;
}): Promise<{
  run: DecisionReplayRunRecord;
  report?: WeeklyImprovementReportRecord;
}> {
  return request<{
    run: DecisionReplayRunRecord;
    report?: WeeklyImprovementReportRecord;
  }>("/api/v1/improvement/replay/run", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function fetchImprovementReplayRun(runId: string): Promise<{
  run: DecisionReplayRunRecord;
  items: DecisionReplayItemRecord[];
  findings: DecisionReplayFindingRecord[];
  autoTunes: DecisionAutoTuneRecord[];
  report?: WeeklyImprovementReportRecord;
}> {
  return request<{
    run: DecisionReplayRunRecord;
    items: DecisionReplayItemRecord[];
    findings: DecisionReplayFindingRecord[];
    autoTunes: DecisionAutoTuneRecord[];
    report?: WeeklyImprovementReportRecord;
  }>(`/api/v1/improvement/replay/runs/${encodeURIComponent(runId)}`);
}

export async function approveImprovementAutoTune(tuneId: string): Promise<DecisionAutoTuneRecord> {
  return request<DecisionAutoTuneRecord>(`/api/v1/improvement/autotune/${encodeURIComponent(tuneId)}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function revertImprovementAutoTune(tuneId: string): Promise<DecisionAutoTuneRecord> {
  return request<DecisionAutoTuneRecord>(`/api/v1/improvement/autotune/${encodeURIComponent(tuneId)}/revert`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approveChatTool(sessionId: string, approvalId: string): Promise<{ ok: boolean; approvalId: string }> {
  return request<{ ok: boolean; approvalId: string }>("/api/v1/chat/tools/approve", {
    method: "POST",
    body: JSON.stringify({ sessionId, approvalId }),
  });
}

export async function denyChatTool(sessionId: string, approvalId: string): Promise<{ ok: boolean; approvalId: string }> {
  return request<{ ok: boolean; approvalId: string }>("/api/v1/chat/tools/deny", {
    method: "POST",
    body: JSON.stringify({ sessionId, approvalId }),
  });
}

export async function uploadChatAttachment(input: {
  sessionId: string;
  projectId?: string;
  file: File;
}): Promise<ChatAttachmentRecord> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  const bytesBase64 = btoa(binary);
  return request<ChatAttachmentRecord>("/api/v1/chat/attachments", {
    method: "POST",
    body: JSON.stringify({
      sessionId: input.sessionId,
      projectId: input.projectId,
      fileName: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      bytesBase64,
    }),
  });
}

export async function fetchChatAttachment(attachmentId: string): Promise<ChatAttachmentRecord> {
  return request<ChatAttachmentRecord>(`/api/v1/chat/attachments/${encodeURIComponent(attachmentId)}`);
}

export async function downloadChatAttachment(attachmentId: string): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const meta = await fetchChatAttachment(attachmentId);
  const authHeaders = readGatewayAuthHeaders(`/api/v1/chat/attachments/${encodeURIComponent(attachmentId)}/content`);
  const response = await fetch(`${API_BASE}/api/v1/chat/attachments/${encodeURIComponent(attachmentId)}/content?disposition=attachment`, {
    headers: authHeaders,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  const blob = await response.blob();
  return {
    blob,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
  };
}

export async function fetchChatAttachmentPreview(attachmentId: string): Promise<ChatAttachmentPreviewResponse> {
  return request<ChatAttachmentPreviewResponse>(`/api/v1/chat/attachments/${encodeURIComponent(attachmentId)}/preview`);
}

export async function createMediaJob(input: MediaCreateJobRequest): Promise<MediaJobRecord> {
  return request<MediaJobRecord>("/api/v1/media/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMediaJob(jobId: string): Promise<MediaJobRecord> {
  return request<MediaJobRecord>(`/api/v1/media/jobs/${encodeURIComponent(jobId)}`);
}

export async function fetchMediaJobs(sessionId?: string): Promise<{ items: MediaJobRecord[] }> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  return request<{ items: MediaJobRecord[] }>(`/api/v1/media/jobs${query}`);
}

export async function fetchRetentionPolicy(): Promise<RetentionPolicy> {
  return request<RetentionPolicy>("/api/v1/admin/retention");
}

export async function updateRetentionPolicy(input: Partial<RetentionPolicy>): Promise<RetentionPolicy> {
  return request<RetentionPolicy>("/api/v1/admin/retention", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function pruneRetention(dryRun = true): Promise<RetentionPruneResult> {
  return request<RetentionPruneResult>("/api/v1/admin/retention/prune", {
    method: "POST",
    body: JSON.stringify({ dryRun }),
  });
}

export async function listBackups(limit = 50): Promise<{ items: BackupManifestRecord[] }> {
  return request<{ items: BackupManifestRecord[] }>(`/api/v1/admin/backups?limit=${limit}`);
}

export async function createBackup(input?: { name?: string; outputPath?: string }): Promise<BackupCreateResponse> {
  return request<BackupCreateResponse>("/api/v1/admin/backups/create", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function restoreBackup(filePath: string, confirm = false): Promise<{ restored: boolean; backupId?: string; filesRestored: number }> {
  return request<{ restored: boolean; backupId?: string; filesRestored: number }>("/api/v1/admin/backups/restore", {
    method: "POST",
    body: JSON.stringify({ filePath, confirm }),
  });
}

async function consumeSseResponse(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: ChatStreamChunk) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError: string | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex < 0) {
        break;
      }
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) {
        continue;
      }
      const dataText = dataLines.join("\n");
      try {
        const parsed = JSON.parse(dataText) as ChatStreamChunk;
        onChunk(parsed);
        if (parsed.type === "error") {
          streamError = parsed.error || "Streaming request failed.";
        }
      } catch {
        // ignore parse noise
      }
    }
  }
  if (streamError) {
    throw new Error(streamError);
  }
}

export async function fetchApprovals(status = "pending"): Promise<ApprovalsResponse> {
  return request<ApprovalsResponse>(`/api/v1/approvals?status=${encodeURIComponent(status)}`);
}

export async function resolveApproval(
  approvalId: string,
  decision: "approve" | "reject",
): Promise<{ approval: ApprovalRequest; executedAction?: ToolInvokeResult }> {
  return request(`/api/v1/approvals/${approvalId}/resolve`, {
    method: "POST",
    body: JSON.stringify({
      decision,
      resolvedBy: "operator",
    }),
  });
}

export async function fetchApprovalReplay(approvalId: string): Promise<ApprovalReplayResponse> {
  return request<ApprovalReplayResponse>(`/api/v1/approvals/${approvalId}/replay`);
}

export async function fetchCostSummary(
  scope: "day" | "session" | "agent" | "task" = "day",
): Promise<CostSummaryResponse> {
  return request<CostSummaryResponse>(`/api/v1/costs/summary?scope=${scope}`);
}

export async function runCheaper(): Promise<{ mode: string; actions: string[] }> {
  return request<{ mode: string; actions: string[] }>("/api/v1/costs/run-cheaper", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchToolCatalog(): Promise<{ items: ToolCatalogEntry[] }> {
  return request<{ items: ToolCatalogEntry[] }>("/api/v1/tools/catalog");
}

export async function evaluateToolAccess(input: ToolAccessEvaluateRequest): Promise<ToolAccessEvaluateResponse> {
  return request<ToolAccessEvaluateResponse>("/api/v1/tools/access/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchToolGrants(input?: {
  scope?: "global" | "session" | "agent" | "task";
  scopeRef?: string;
  limit?: number;
}): Promise<{ items: ToolGrantRecord[] }> {
  const search = new URLSearchParams();
  if (input?.scope) {
    search.set("scope", input.scope);
  }
  if (input?.scopeRef) {
    search.set("scopeRef", input.scopeRef);
  }
  search.set("limit", String(input?.limit ?? 300));
  return request<{ items: ToolGrantRecord[] }>(`/api/v1/tools/grants?${search.toString()}`);
}

export async function createToolGrant(input: ToolGrantCreateInput): Promise<ToolGrantRecord> {
  return request<ToolGrantRecord>("/api/v1/tools/grants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeToolGrant(grantId: string): Promise<{ revoked: boolean; grantId: string }> {
  return request<{ revoked: boolean; grantId: string }>(`/api/v1/tools/grants/${encodeURIComponent(grantId)}/revoke`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function invokeTool(input: {
  toolName: string;
  args: Record<string, unknown>;
  agentId: string;
  sessionId: string;
  taskId?: string;
  dryRun?: boolean;
  consentContext?: {
    operatorId?: string;
    source?: "ui" | "tui" | "agent";
    reason?: string;
  };
}): Promise<ToolInvokeResult> {
  return request<ToolInvokeResult>("/api/v1/tools/invoke", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function commsSend(input: ChannelSendInput): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/comms/send", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function commsGmailRead(input: GmailReadQuery): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/comms/gmail/read", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function commsGmailSend(input: GmailSendInput): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/comms/gmail/send", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function commsCalendarList(input: CalendarListQuery): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/comms/calendar/list", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function commsCalendarCreate(input: CalendarCreateEventInput): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/comms/calendar/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function knowledgeMemoryWrite(input: MemoryWriteInput): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/knowledge/memory/write", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function knowledgeMemorySearch(input: MemorySearchQuery): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/knowledge/memory/search", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function knowledgeDocsIngest(input: DocsIngestInput): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/knowledge/docs/ingest", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function knowledgeEmbeddingsIndex(input: EmbeddingIndexInput): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/knowledge/embeddings/index", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function knowledgeEmbeddingsQuery(input: EmbeddingQueryInput): Promise<ToolInvokeResult | Record<string, unknown>> {
  return request<ToolInvokeResult | Record<string, unknown>>("/api/v1/knowledge/embeddings/query", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchTasks(status?: TaskRecord["status"]): Promise<{ items: TaskRecord[]; nextCursor?: string }> {
  const query = status ? `?status=${encodeURIComponent(status)}&limit=100&view=active` : "?limit=100&view=active";
  return request<{ items: TaskRecord[]; nextCursor?: string }>(`/api/v1/tasks${query}`);
}

export async function fetchTasksByView(
  view: "active" | "trash" | "all",
  status?: TaskRecord["status"],
): Promise<{ items: TaskRecord[]; nextCursor?: string; view: "active" | "trash" | "all" }> {
  const query = new URLSearchParams({ limit: "100", view });
  if (status) {
    query.set("status", status);
  }
  return request<{ items: TaskRecord[]; nextCursor?: string; view: "active" | "trash" | "all" }>(
    `/api/v1/tasks?${query.toString()}`,
  );
}

export async function createTask(input: {
  title: string;
  description?: string;
  priority?: TaskRecord["priority"];
}): Promise<TaskRecord> {
  return request<TaskRecord>("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTask(
  taskId: string,
  input: Partial<Pick<TaskRecord, "status" | "priority" | "title" | "description" | "dueAt">> & {
    assignedAgentId?: string | null;
  },
): Promise<TaskRecord> {
  return request<TaskRecord>(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTask(
  taskId: string,
  input?: { mode?: "soft" | "hard"; deletedBy?: string; deleteReason?: string; confirmToken?: string },
): Promise<{ deleted: boolean; taskId: string; mode: "soft" | "hard" }> {
  const mode = input?.mode ?? "soft";
  return request<{ deleted: boolean; taskId: string; mode: "soft" | "hard" }>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}?mode=${mode}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        mode,
        deletedBy: input?.deletedBy,
        deleteReason: input?.deleteReason,
        confirmToken: input?.confirmToken,
      }),
    },
  );
}

export async function restoreTask(taskId: string): Promise<{ restored: boolean; taskId: string }> {
  return request<{ restored: boolean; taskId: string }>(`/api/v1/tasks/${encodeURIComponent(taskId)}/restore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchTaskActivities(taskId: string): Promise<{ items: TaskActivityRecord[] }> {
  return request<{ items: TaskActivityRecord[] }>(`/api/v1/tasks/${encodeURIComponent(taskId)}/activities`);
}

export async function addTaskActivity(
  taskId: string,
  input: {
    message: string;
    activityType?: TaskActivityRecord["activityType"];
    agentId?: string;
  },
): Promise<TaskActivityRecord> {
  return request<TaskActivityRecord>(`/api/v1/tasks/${encodeURIComponent(taskId)}/activities`, {
    method: "POST",
    body: JSON.stringify({
      activityType: input.activityType ?? "comment",
      message: input.message,
      agentId: input.agentId,
    }),
  });
}

export async function fetchTaskDeliverables(taskId: string): Promise<{ items: TaskDeliverableRecord[] }> {
  return request<{ items: TaskDeliverableRecord[] }>(`/api/v1/tasks/${encodeURIComponent(taskId)}/deliverables`);
}

export async function addTaskDeliverable(
  taskId: string,
  input: {
    title: string;
    deliverableType?: TaskDeliverableRecord["deliverableType"];
    path?: string;
    description?: string;
  },
): Promise<TaskDeliverableRecord> {
  return request<TaskDeliverableRecord>(`/api/v1/tasks/${encodeURIComponent(taskId)}/deliverables`, {
    method: "POST",
    body: JSON.stringify({
      deliverableType: input.deliverableType ?? "artifact",
      title: input.title,
      path: input.path,
      description: input.description,
    }),
  });
}

export async function fetchTaskSubagents(taskId: string): Promise<{ items: TaskSubagentSession[] }> {
  return request<{ items: TaskSubagentSession[] }>(`/api/v1/tasks/${encodeURIComponent(taskId)}/subagents`);
}

export async function registerTaskSubagent(
  taskId: string,
  input: { agentSessionId: string; agentName?: string },
): Promise<TaskSubagentSession> {
  return request<TaskSubagentSession>(`/api/v1/tasks/${encodeURIComponent(taskId)}/subagents`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTaskSubagent(
  agentSessionId: string,
  input: { status?: TaskSubagentSession["status"]; endedAt?: string },
): Promise<TaskSubagentSession> {
  return request<TaskSubagentSession>(`/api/v1/subagents/${encodeURIComponent(agentSessionId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchRealtimeEvents(limit = 100): Promise<{ items: RealtimeEvent[]; nextCursor?: string }> {
  return request<{ items: RealtimeEvent[]; nextCursor?: string }>(`/api/v1/events?limit=${limit}`);
}

export async function fetchDashboardState(): Promise<DashboardStateResponse> {
  return request<DashboardStateResponse>("/api/v1/dashboard/state");
}

export async function fetchSystemVitals(): Promise<SystemVitalsResponse> {
  return request<SystemVitalsResponse>("/api/v1/system/vitals");
}

export async function fetchCronJobs(): Promise<CronJobsResponse> {
  return request<CronJobsResponse>("/api/v1/cron/jobs");
}

export async function fetchOperators(): Promise<OperatorsResponse> {
  return request<OperatorsResponse>("/api/v1/operators");
}

export async function fetchMemoryFiles(dir = "memory"): Promise<{ items: Array<{ relativePath: string; size: number; modifiedAt: string }> }> {
  return request<{ items: Array<{ relativePath: string; size: number; modifiedAt: string }> }>(
    `/api/v1/memory/files?dir=${encodeURIComponent(dir)}`,
  );
}

export async function fetchAgents(
  view: "active" | "archived" | "all" = "active",
  limit = 300,
): Promise<AgentsResponse> {
  return request<AgentsResponse>(`/api/v1/agents?view=${encodeURIComponent(view)}&limit=${limit}`);
}

export async function fetchAgent(agentId: string): Promise<AgentProfileRecord> {
  return request<AgentProfileRecord>(`/api/v1/agents/${encodeURIComponent(agentId)}`);
}

export async function createAgentProfile(input: AgentProfileCreateInput): Promise<AgentProfileRecord> {
  return request<AgentProfileRecord>("/api/v1/agents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAgentProfile(
  agentId: string,
  input: AgentProfileUpdateInput,
): Promise<AgentProfileRecord> {
  return request<AgentProfileRecord>(`/api/v1/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveAgentProfile(
  agentId: string,
  input?: AgentProfileArchiveInput,
): Promise<AgentProfileRecord> {
  return request<AgentProfileRecord>(`/api/v1/agents/${encodeURIComponent(agentId)}/archive`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function restoreAgentProfile(agentId: string): Promise<AgentProfileRecord> {
  return request<AgentProfileRecord>(`/api/v1/agents/${encodeURIComponent(agentId)}/restore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function hardDeleteAgentProfile(agentId: string): Promise<{ deleted: boolean; agentId: string; mode: "hard" }> {
  return request<{ deleted: boolean; agentId: string; mode: "hard" }>(
    `/api/v1/agents/${encodeURIComponent(agentId)}?mode=hard`,
    {
      method: "DELETE",
      body: JSON.stringify({}),
    },
  );
}

export async function fetchFilesList(
  dir = ".",
  limit = 1000,
): Promise<{ items: Array<{ relativePath: string; size: number; modifiedAt: string }> }> {
  return request<{ items: Array<{ relativePath: string; size: number; modifiedAt: string }> }>(
    `/api/v1/files/list?dir=${encodeURIComponent(dir)}&limit=${limit}`,
  );
}

export async function fetchPathSuggestions(
  root = ".",
  limit = 150,
): Promise<{ items: string[] }> {
  return request<{ items: string[] }>(
    `/api/v1/files/path-suggestions?root=${encodeURIComponent(root)}&limit=${Math.max(1, Math.min(limit, 500))}`,
  );
}

export interface FileTemplate {
  templateId: string;
  title: string;
  description: string;
  defaultPath: string;
  body: string;
}

export async function fetchFileTemplates(): Promise<{ items: FileTemplate[] }> {
  return request<{ items: FileTemplate[] }>("/api/v1/files/templates");
}

export async function createFileFromTemplate(
  templateId: string,
  targetPath?: string,
): Promise<{ relativePath: string; fullPath: string; bytes: number }> {
  return request<{ relativePath: string; fullPath: string; bytes: number }>(
    `/api/v1/files/templates/${encodeURIComponent(templateId)}/create`,
    {
      method: "POST",
      body: JSON.stringify({ targetPath }),
    },
  );
}

export async function uploadFile(relativePath: string, content: string): Promise<{ relativePath: string; fullPath: string; bytes: number }> {
  return request<{ relativePath: string; fullPath: string; bytes: number }>("/api/v1/files/upload", {
    method: "POST",
    body: JSON.stringify({ relativePath, content }),
  });
}

export async function downloadFile(relativePath: string): Promise<{
  relativePath: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
  contentType: string;
  encoding: string;
  content: string;
}> {
  return request(`/api/v1/files/download?relativePath=${encodeURIComponent(relativePath)}`);
}

export async function fetchSkills(): Promise<{ items: SkillListItem[] }> {
  return request("/api/v1/skills");
}

export async function reloadSkills(): Promise<{ items: SkillListItem[] }> {
  return request("/api/v1/skills/reload", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function updateSkillState(
  skillId: string,
  input: { state: SkillRuntimeState; note?: string },
): Promise<SkillStateRecord> {
  return request<SkillStateRecord>(`/api/v1/skills/${encodeURIComponent(skillId)}/state`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function bulkUpdateSkillState(input: {
  skillIds: string[];
  state: SkillRuntimeState;
  note?: string;
}): Promise<{ items: SkillStateRecord[] }> {
  return request<{ items: SkillStateRecord[] }>("/api/v1/skills/bulk-state", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchSkillActivationPolicies(): Promise<SkillActivationPolicy> {
  return request<SkillActivationPolicy>("/api/v1/skills/activation-policies");
}

export async function patchSkillActivationPolicies(
  input: Partial<SkillActivationPolicy>,
): Promise<SkillActivationPolicy> {
  return request<SkillActivationPolicy>("/api/v1/skills/activation-policies", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchBankrSafetyPolicy(): Promise<BankrSafetyPolicy> {
  return request<BankrSafetyPolicy>("/api/v1/skills/bankr/policy");
}

export async function patchBankrSafetyPolicy(
  input: Partial<BankrSafetyPolicy>,
): Promise<BankrSafetyPolicy> {
  return request<BankrSafetyPolicy>("/api/v1/skills/bankr/policy", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function previewBankrAction(
  input: BankrActionPreviewRequest,
): Promise<BankrActionPreviewResponse> {
  return request<BankrActionPreviewResponse>("/api/v1/skills/bankr/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchBankrActionAudit(query?: {
  limit?: number;
  cursor?: string;
}): Promise<{ items: BankrActionAuditRecord[] }> {
  const params = new URLSearchParams();
  if (query?.limit) {
    params.set("limit", String(query.limit));
  }
  if (query?.cursor) {
    params.set("cursor", query.cursor);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<{ items: BankrActionAuditRecord[] }>(`/api/v1/skills/bankr/audit${suffix}`);
}

export async function fetchSettings(): Promise<RuntimeSettingsResponse> {
  return request<RuntimeSettingsResponse>("/api/v1/settings");
}

export async function fetchOnboardingState(): Promise<OnboardingState> {
  return request<OnboardingState>("/api/v1/onboarding/state");
}

export async function bootstrapOnboarding(input: OnboardingBootstrapInput): Promise<OnboardingBootstrapResult> {
  return request<OnboardingBootstrapResult>("/api/v1/onboarding/bootstrap", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function completeOnboarding(completedBy?: string): Promise<OnboardingCompleteResponse> {
  return request<OnboardingCompleteResponse>("/api/v1/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({
      completedBy,
    }),
  });
}

export async function patchSettings(input: {
  defaultToolProfile?: string;
  budgetMode?: "saver" | "balanced" | "power";
  networkAllowlist?: string[];
  auth?: AuthSettingsUpdateInput;
  llm?: {
    activeProviderId?: string;
    activeModel?: string;
    upsertProvider?: {
      providerId: string;
      label?: string;
      baseUrl?: string;
      defaultModel?: string;
      apiKey?: string;
      apiKeyEnv?: string;
      headers?: Record<string, string>;
    };
  };
  memory?: {
    enabled?: boolean;
    qmdEnabled?: boolean;
    qmdApplyToChat?: boolean;
    qmdApplyToOrchestration?: boolean;
    qmdMaxContextTokens?: number;
    qmdMinPromptChars?: number;
    qmdCacheTtlSeconds?: number;
    qmdDistillerProviderId?: string;
    qmdDistillerModel?: string;
  };
  mesh?: {
    enabled?: boolean;
    mode?: "lan" | "wan" | "tailnet";
    nodeId?: string;
    mdns?: boolean;
    staticPeers?: string[];
    requireMtls?: boolean;
    tailnetEnabled?: boolean;
  };
  npu?: {
    enabled?: boolean;
    autoStart?: boolean;
    sidecarUrl?: string;
  };
}): Promise<RuntimeSettingsResponse> {
  return request<RuntimeSettingsResponse>("/api/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function composeMemoryContext(input: {
  scope: "chat" | "orchestration";
  prompt: string;
  sessionId?: string;
  taskId?: string;
  runId?: string;
  phaseId?: string;
  workspace?: string;
  maxContextTokens?: number;
  forceRefresh?: boolean;
}): Promise<MemoryContextPack> {
  return request<MemoryContextPack>("/api/v1/memory/context/compose", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMemoryContext(contextId: string): Promise<MemoryContextPack> {
  return request<MemoryContextPack>(`/api/v1/memory/context/${encodeURIComponent(contextId)}`);
}

export async function fetchMemoryQmdStats(from?: string, to?: string, limit = 60): Promise<MemoryQmdStatsResponse & { recent: MemoryContextPack[] }> {
  const search = new URLSearchParams();
  if (from) search.set("from", from);
  if (to) search.set("to", to);
  search.set("limit", String(limit));
  return request<MemoryQmdStatsResponse & { recent: MemoryContextPack[] }>(
    `/api/v1/memory/qmd/stats?${search.toString()}`,
  );
}

export async function fetchOrchestrationRunContext(runId: string): Promise<{ items: MemoryContextPack[] }> {
  return request<{ items: MemoryContextPack[] }>(
    `/api/v1/orchestration/runs/${encodeURIComponent(runId)}/context`,
  );
}

export async function fetchIntegrationCatalog(
  kind?: IntegrationCatalogEntry["kind"],
): Promise<{ items: IntegrationCatalogEntry[] }> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return request(`/api/v1/integrations/catalog${query}`);
}

export async function fetchIntegrationFormSchema(catalogId: string): Promise<IntegrationFormSchema> {
  return request<IntegrationFormSchema>(
    `/api/v1/integrations/catalog/${encodeURIComponent(catalogId)}/form-schema`,
  );
}

export async function fetchIntegrationConnections(
  kind?: IntegrationConnection["kind"],
): Promise<{ items: IntegrationConnection[] }> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}&limit=300` : "?limit=300";
  return request(`/api/v1/integrations/connections${query}`);
}

export async function createIntegrationConnection(input: {
  catalogId: string;
  label?: string;
  enabled?: boolean;
  status?: IntegrationConnection["status"];
  config?: Record<string, unknown>;
}): Promise<IntegrationConnection> {
  return request("/api/v1/integrations/connections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateIntegrationConnection(
  connectionId: string,
  input: {
    label?: string;
    enabled?: boolean;
    status?: IntegrationConnection["status"];
    config?: Record<string, unknown>;
    lastSyncAt?: string;
    lastError?: string;
  },
): Promise<IntegrationConnection> {
  return request(`/api/v1/integrations/connections/${encodeURIComponent(connectionId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteIntegrationConnection(connectionId: string): Promise<{ deleted: boolean }> {
  return request(`/api/v1/integrations/connections/${encodeURIComponent(connectionId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}

export async function fetchIntegrationPlugins(): Promise<{ items: IntegrationPluginRecord[] }> {
  return request<{ items: IntegrationPluginRecord[] }>("/api/v1/integrations/plugins");
}

export async function installIntegrationPlugin(input: {
  source: string;
  pluginId?: string;
}): Promise<IntegrationPluginRecord> {
  return request<IntegrationPluginRecord>("/api/v1/integrations/plugins/install", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function enableIntegrationPlugin(pluginId: string): Promise<IntegrationPluginRecord> {
  return request<IntegrationPluginRecord>(`/api/v1/integrations/plugins/${encodeURIComponent(pluginId)}/enable`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function disableIntegrationPlugin(pluginId: string): Promise<IntegrationPluginRecord> {
  return request<IntegrationPluginRecord>(`/api/v1/integrations/plugins/${encodeURIComponent(pluginId)}/disable`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchLlmConfig(): Promise<RuntimeSettingsResponse["llm"]> {
  return request<RuntimeSettingsResponse["llm"]>("/api/v1/llm/config");
}

export async function fetchLlmModels(providerId?: string): Promise<{ items: Array<{ id: string; ownedBy?: string; created?: number }> }> {
  const query = providerId ? `?providerId=${encodeURIComponent(providerId)}` : "";
  return request(`/api/v1/llm/models${query}`);
}

export async function createLlmChatCompletion(input: {
  providerId?: string;
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
  memory?: {
    enabled?: boolean;
    mode?: "qmd" | "off";
    sessionId?: string;
    taskId?: string;
    workspace?: string;
    maxContextTokens?: number;
    forceRefresh?: boolean;
  };
  temperature?: number;
  max_tokens?: number;
}): Promise<LlmChatCompletionResponse> {
  return request<LlmChatCompletionResponse>("/api/v1/llm/chat-completions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface ProviderSecretStatus {
  providerId: string;
  hasSecret: boolean;
  source: "none" | "keychain" | "env" | "inline";
}

export async function fetchProviderSecretStatus(providerId: string): Promise<ProviderSecretStatus> {
  return request<ProviderSecretStatus>(`/api/v1/secrets/providers/${encodeURIComponent(providerId)}/status`);
}

export async function saveProviderSecret(providerId: string, apiKey: string): Promise<ProviderSecretStatus> {
  return request<ProviderSecretStatus>(`/api/v1/secrets/providers/${encodeURIComponent(providerId)}`, {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });
}

export async function deleteProviderSecret(providerId: string): Promise<ProviderSecretStatus> {
  return request<ProviderSecretStatus>(`/api/v1/secrets/providers/${encodeURIComponent(providerId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}

export async function fetchMeshStatus(): Promise<MeshStatusResponse> {
  return request<MeshStatusResponse>("/api/v1/mesh/status");
}

export async function fetchMeshNodes(limit = 200): Promise<{ items: MeshNodeRecord[] }> {
  return request<{ items: MeshNodeRecord[] }>(`/api/v1/mesh/nodes?limit=${limit}`);
}

export async function fetchMeshLeases(limit = 200): Promise<{ items: MeshLeaseRecord[] }> {
  return request<{ items: MeshLeaseRecord[] }>(`/api/v1/mesh/leases?limit=${limit}`);
}

export async function fetchMeshSessionOwners(limit = 500): Promise<{ items: MeshSessionOwnerRecord[] }> {
  return request<{ items: MeshSessionOwnerRecord[] }>(`/api/v1/mesh/sessions/owners?limit=${limit}`);
}

export async function fetchMeshReplicationOffsets(limit = 500): Promise<{ items: MeshReplicationOffsetRecord[] }> {
  return request<{ items: MeshReplicationOffsetRecord[] }>(`/api/v1/mesh/replication/offsets?limit=${limit}`);
}

export async function fetchNpuStatus(): Promise<NpuRuntimeStatus> {
  return request<NpuRuntimeStatus>("/api/v1/npu/status");
}

export async function fetchNpuModels(): Promise<{ items: NpuModelManifest[] }> {
  return request<{ items: NpuModelManifest[] }>("/api/v1/npu/models");
}

export async function startNpuRuntime(): Promise<NpuRuntimeStatus> {
  return request<NpuRuntimeStatus>("/api/v1/npu/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function stopNpuRuntime(): Promise<NpuRuntimeStatus> {
  return request<NpuRuntimeStatus>("/api/v1/npu/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function refreshNpuRuntime(): Promise<NpuRuntimeStatus> {
  return request<NpuRuntimeStatus>("/api/v1/npu/refresh", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchMcpServers(): Promise<{ items: McpServerRecord[] }> {
  return request<{ items: McpServerRecord[] }>("/api/v1/mcp/servers");
}

export async function createMcpServer(input: {
  label: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  authType?: "none" | "token" | "oauth2";
  enabled?: boolean;
  category?: McpServerRecord["category"];
  trustTier?: McpServerRecord["trustTier"];
  costTier?: McpServerRecord["costTier"];
  policy?: Partial<McpServerRecord["policy"]>;
  verifiedAt?: string;
}): Promise<McpServerRecord> {
  return request<McpServerRecord>("/api/v1/mcp/servers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMcpServer(
  serverId: string,
  input: {
    label?: string;
    command?: string;
    args?: string[];
    url?: string;
    authType?: "none" | "token" | "oauth2";
    enabled?: boolean;
    category?: McpServerRecord["category"];
    trustTier?: McpServerRecord["trustTier"];
    costTier?: McpServerRecord["costTier"];
    policy?: Partial<McpServerRecord["policy"]>;
    verifiedAt?: string;
  },
): Promise<McpServerRecord> {
  return request<McpServerRecord>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateMcpServerPolicy(
  serverId: string,
  policy: Partial<McpServerRecord["policy"]>,
): Promise<McpServerRecord> {
  return request<McpServerRecord>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}/policy`, {
    method: "PATCH",
    body: JSON.stringify(policy),
  });
}

export async function deleteMcpServer(serverId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}

export async function connectMcpServer(serverId: string): Promise<McpServerRecord> {
  return request<McpServerRecord>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}/connect`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function disconnectMcpServer(serverId: string): Promise<McpServerRecord> {
  return request<McpServerRecord>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}/disconnect`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function startMcpOAuth(serverId: string): Promise<McpOAuthStartResponse> {
  return request<McpOAuthStartResponse>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}/oauth/start`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function completeMcpOAuth(serverId: string, input: { code: string; state?: string }): Promise<McpServerRecord> {
  return request<McpServerRecord>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}/oauth/complete`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMcpTools(serverId: string): Promise<{ items: McpToolRecord[] }> {
  return request<{ items: McpToolRecord[] }>(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}/tools`);
}

export async function invokeMcpTool(input: {
  serverId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  agentId?: string;
  sessionId?: string;
  taskId?: string;
}): Promise<McpInvokeResponse> {
  return request<McpInvokeResponse>("/api/v1/mcp/invoke", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function transcribeVoice(input: {
  bytesBase64: string;
  mimeType?: string;
  language?: string;
}): Promise<VoiceTranscribeResponse> {
  return request<VoiceTranscribeResponse>("/api/v1/voice/transcribe", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchVoiceStatus(): Promise<VoiceStatus> {
  return request<VoiceStatus>("/api/v1/voice/status");
}

export async function startVoiceTalkSession(input?: {
  mode?: "push_to_talk" | "wake";
  sessionId?: string;
}): Promise<VoiceTalkSessionRecord> {
  return request<VoiceTalkSessionRecord>("/api/v1/voice/talk/sessions", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function stopVoiceTalkSession(talkSessionId: string): Promise<VoiceTalkSessionRecord> {
  return request<VoiceTalkSessionRecord>(`/api/v1/voice/talk/sessions/${encodeURIComponent(talkSessionId)}/stop`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function startVoiceWake(): Promise<VoiceStatus["wake"]> {
  return request<VoiceStatus["wake"]>("/api/v1/voice/wake/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function stopVoiceWake(): Promise<VoiceStatus["wake"]> {
  return request<VoiceStatus["wake"]>("/api/v1/voice/wake/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchDaemonStatus(): Promise<{
  running: boolean;
  pid: number;
  uptimeSeconds: number;
  host: string;
  state: "running" | "stopped";
  lastCommandAt?: string;
}> {
  return request<{
    running: boolean;
    pid: number;
    uptimeSeconds: number;
    host: string;
    state: "running" | "stopped";
    lastCommandAt?: string;
  }>("/api/v1/daemon/status");
}

export async function startDaemon(): Promise<{
  accepted: boolean;
  status: Awaited<ReturnType<typeof fetchDaemonStatus>>;
}> {
  return request<{
    accepted: boolean;
    status: Awaited<ReturnType<typeof fetchDaemonStatus>>;
  }>("/api/v1/daemon/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function stopDaemon(): Promise<{
  accepted: boolean;
  status: Awaited<ReturnType<typeof fetchDaemonStatus>>;
}> {
  return request<{
    accepted: boolean;
    status: Awaited<ReturnType<typeof fetchDaemonStatus>>;
  }>("/api/v1/daemon/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function restartDaemon(): Promise<{
  accepted: boolean;
  status: Awaited<ReturnType<typeof fetchDaemonStatus>>;
}> {
  return request<{
    accepted: boolean;
    status: Awaited<ReturnType<typeof fetchDaemonStatus>>;
  }>("/api/v1/daemon/restart", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchDaemonLogs(tail = 200): Promise<{
  items: Array<{ timestamp: string; level: "info" | "warn" | "error"; message: string }>;
}> {
  return request<{
    items: Array<{ timestamp: string; level: "info" | "warn" | "error"; message: string }>;
  }>(`/api/v1/daemon/logs?tail=${Math.max(1, Math.min(2000, tail))}`);
}

export async function evaluateUiChangeRisk(input: {
  pageId: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
}): Promise<ChangeRiskEvaluationResponse> {
  return request<ChangeRiskEvaluationResponse>("/api/v1/ui/change-risk/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type EventStreamConnectionState = "connecting" | "open" | "retrying" | "error" | "closed";

export interface EventStreamStatus {
  state: EventStreamConnectionState;
  reconnectAttempts: number;
  lastEventAt?: string;
  lastErrorAt?: string;
}

interface EventStreamSubscriber {
  onEvent: (event: RealtimeEvent) => void;
  onStateChange?: (state: EventStreamConnectionState) => void;
  onStatusChange?: (status: EventStreamStatus) => void;
}

const eventStreamSubscribers = new Set<EventStreamSubscriber>();
let sharedEventSource: EventSource | null = null;
let eventReconnectTimer: number | null = null;
let eventConnectionState: EventStreamConnectionState = "closed";
let eventConnectAttempt = 0;
let eventConnectInFlight = false;
let reconnectAttempts = 0;
let lastEventAt: string | undefined;
let lastErrorAt: string | undefined;

export function connectEventStream(
  onEvent: (event: RealtimeEvent) => void,
  onStateChange?: (state: EventStreamConnectionState) => void,
  onStatusChange?: (status: EventStreamStatus) => void,
): () => void {
  const subscriber: EventStreamSubscriber = { onEvent, onStateChange, onStatusChange };
  eventStreamSubscribers.add(subscriber);
  notifyEventStreamState(subscriber, eventConnectionState);
  notifyEventStreamStatus(subscriber, buildEventStreamStatus());
  void ensureEventStreamConnected();

  return () => {
    eventStreamSubscribers.delete(subscriber);
    if (eventStreamSubscribers.size === 0) {
      eventConnectAttempt += 1;
      closeSharedEventSource();
      clearReconnectTimer();
      setEventConnectionState("closed");
      reconnectAttempts = 0;
      lastEventAt = undefined;
      lastErrorAt = undefined;
    }
  };
}

async function buildEventStreamUrl(): Promise<string> {
  const url = new URL(`${API_BASE}/api/v1/events/stream`);
  url.searchParams.set("replay", "20");

  const auth = readGatewayAuthState();
  if (!auth) {
    return url.toString();
  }

  if (auth.mode === "token" && auth.token?.trim()) {
    url.searchParams.set(auth.tokenQueryParam?.trim() || "access_token", auth.token.trim());
    return url.toString();
  }

  if (auth.mode === "basic" && auth.username && auth.password) {
    const issued = await request<SseTokenIssueResponse>("/api/v1/auth/sse-token", {
      method: "POST",
      body: JSON.stringify({}),
    });
    url.searchParams.set("sse_token", issued.token);
  }

  return url.toString();
}

async function ensureEventStreamConnected(): Promise<void> {
  if (sharedEventSource || eventConnectInFlight || eventStreamSubscribers.size === 0 || typeof window === "undefined") {
    return;
  }

  eventConnectInFlight = true;
  const connectAttempt = ++eventConnectAttempt;
  setEventConnectionState("connecting");

  let streamUrl = "";
  try {
    streamUrl = await buildEventStreamUrl();
  } catch {
    eventConnectInFlight = false;
    if (connectAttempt !== eventConnectAttempt || eventStreamSubscribers.size === 0) {
      return;
    }
    lastErrorAt = new Date().toISOString();
    setEventConnectionState("error");
    scheduleReconnect();
    return;
  }

  eventConnectInFlight = false;
  if (connectAttempt !== eventConnectAttempt || eventStreamSubscribers.size === 0) {
    return;
  }

  const source = new EventSource(streamUrl);
  sharedEventSource = source;

  source.onopen = () => {
    if (sharedEventSource !== source) {
      return;
    }
    clearReconnectTimer();
    reconnectAttempts = 0;
    setEventConnectionState("open");
  };

  source.onmessage = (evt) => {
    if (sharedEventSource !== source) {
      return;
    }
    try {
      const event = JSON.parse(evt.data) as RealtimeEvent;
      lastEventAt = event.timestamp || new Date().toISOString();
      notifyEventStreamStatusToAll();
      for (const subscriber of eventStreamSubscribers) {
        subscriber.onEvent(event);
      }
    } catch {
      // ignore malformed messages
    }
  };

  source.onerror = () => {
    if (sharedEventSource !== source) {
      return;
    }
    closeSharedEventSource();
    if (eventStreamSubscribers.size === 0) {
      setEventConnectionState("closed");
      return;
    }
    lastErrorAt = new Date().toISOString();
    setEventConnectionState("error");
    scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (eventReconnectTimer !== null || typeof window === "undefined") {
    return;
  }

  reconnectAttempts += 1;
  setEventConnectionState("retrying");
  const delay = computeReconnectDelay(reconnectAttempts);

  eventReconnectTimer = window.setTimeout(() => {
    eventReconnectTimer = null;
    void ensureEventStreamConnected();
  }, delay);
}

function closeSharedEventSource(): void {
  eventConnectInFlight = false;
  if (!sharedEventSource) {
    return;
  }
  sharedEventSource.close();
  sharedEventSource = null;
}

function clearReconnectTimer(): void {
  if (eventReconnectTimer === null || typeof window === "undefined") {
    return;
  }
  window.clearTimeout(eventReconnectTimer);
  eventReconnectTimer = null;
}

function setEventConnectionState(state: EventStreamConnectionState): void {
  eventConnectionState = state;
  for (const subscriber of eventStreamSubscribers) {
    notifyEventStreamState(subscriber, state);
    notifyEventStreamStatus(subscriber, buildEventStreamStatus());
  }
}

function notifyEventStreamState(subscriber: EventStreamSubscriber, state: EventStreamConnectionState): void {
  subscriber.onStateChange?.(state);
}

function computeReconnectDelay(attempt: number): number {
  const clampedAttempt = Math.max(1, attempt);
  const base = Math.min(30_000, 1000 * (2 ** (clampedAttempt - 1)));
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(30_000, base + jitter);
}

function notifyEventStreamStatusToAll(): void {
  const status = buildEventStreamStatus();
  for (const subscriber of eventStreamSubscribers) {
    notifyEventStreamStatus(subscriber, status);
  }
}

function notifyEventStreamStatus(subscriber: EventStreamSubscriber, status: EventStreamStatus): void {
  subscriber.onStatusChange?.(status);
}

function buildEventStreamStatus(): EventStreamStatus {
  return {
    state: eventConnectionState,
    reconnectAttempts,
    lastEventAt,
    lastErrorAt,
  };
}
