import type {
  AgentProfileArchiveInput,
  AgentProfileCreateInput,
  AgentProfileRecord,
  AgentProfileUpdateInput,
  AuthSettingsUpdateInput,
  ApprovalReplayEvent,
  ApprovalRequest,
  ChangeRiskEvaluationResponse,
  MemoryContextPack,
  MemoryQmdStatsResponse,
  NpuModelManifest,
  NpuRuntimeStatus,
  OnboardingBootstrapInput,
  OnboardingBootstrapResult,
  OnboardingState,
  PendingApprovalAction,
  SessionMeta,
  ToolInvokeResult,
} from "@goatcitadel/contracts";

const API_BASE = import.meta.env.VITE_GATEWAY_URL ?? "http://127.0.0.1:8787";
const AUTH_STORAGE_KEY = "goatcitadel.gateway.auth";

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

function readGatewayAuthHeaders(path: string): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      mode?: "none" | "token" | "basic";
      token?: string;
      username?: string;
      password?: string;
      tokenQueryParam?: string;
    };

    if (parsed.mode === "token" && parsed.token?.trim()) {
      return {
        Authorization: `Bearer ${parsed.token.trim()}`,
      };
    }
    if (parsed.mode === "basic" && parsed.username && parsed.password) {
      const encoded = btoa(`${parsed.username}:${parsed.password}`);
      return {
        Authorization: `Basic ${encoded}`,
      };
    }

    if (parsed.token?.trim()) {
      return {
        Authorization: `Bearer ${parsed.token.trim()}`,
      };
    }
  } catch {
    // ignore auth parse errors
  }
  return {};
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
      apiKeySource: "inline" | "env" | "none";
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
  maturity: "native" | "beta" | "planned";
  authMethods: string[];
  capabilities: string[];
  docsUrl?: string;
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

export async function fetchSkills(): Promise<{
  items: Array<{
    skillId: string;
    name: string;
    source: string;
    dir: string;
    declaredTools: string[];
    requires: string[];
    keywords: string[];
    mtime: string;
  }>;
}> {
  return request("/api/v1/skills");
}

export async function reloadSkills(): Promise<{ items: unknown[] }> {
  return request("/api/v1/skills/reload", {
    method: "POST",
    body: JSON.stringify({}),
  });
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

export async function evaluateUiChangeRisk(input: {
  pageId: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
}): Promise<ChangeRiskEvaluationResponse> {
  return request<ChangeRiskEvaluationResponse>("/api/v1/ui/change-risk/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type EventStreamConnectionState = "connecting" | "open" | "error" | "closed";

interface EventStreamSubscriber {
  onEvent: (event: RealtimeEvent) => void;
  onStateChange?: (state: EventStreamConnectionState) => void;
}

const eventStreamSubscribers = new Set<EventStreamSubscriber>();
let sharedEventSource: EventSource | null = null;
let eventReconnectTimer: number | null = null;
let eventConnectionState: EventStreamConnectionState = "closed";

export function connectEventStream(
  onEvent: (event: RealtimeEvent) => void,
  onStateChange?: (state: EventStreamConnectionState) => void,
): () => void {
  const subscriber: EventStreamSubscriber = { onEvent, onStateChange };
  eventStreamSubscribers.add(subscriber);
  notifyEventStreamState(subscriber, eventConnectionState);
  ensureEventStreamConnected();

  return () => {
    eventStreamSubscribers.delete(subscriber);
    if (eventStreamSubscribers.size === 0) {
      closeSharedEventSource();
      clearReconnectTimer();
      setEventConnectionState("closed");
    }
  };
}

function buildEventStreamUrl(): string {
  const url = new URL(`${API_BASE}/api/v1/events/stream`);
  url.searchParams.set("replay", "20");

  if (typeof window === "undefined") {
    return url.toString();
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return url.toString();
    }
    const parsed = JSON.parse(raw) as {
      mode?: "none" | "token" | "basic";
      token?: string;
      username?: string;
      password?: string;
      tokenQueryParam?: string;
    };
    if (parsed.mode === "token" && parsed.token?.trim()) {
      url.searchParams.set(parsed.tokenQueryParam?.trim() || "access_token", parsed.token.trim());
    } else if (parsed.mode === "basic" && parsed.username && parsed.password) {
      url.searchParams.set("basic_auth", btoa(`${parsed.username}:${parsed.password}`));
    }
  } catch {
    // ignore auth parse errors
  }

  return url.toString();
}

function ensureEventStreamConnected(): void {
  if (sharedEventSource || eventStreamSubscribers.size === 0 || typeof window === "undefined") {
    return;
  }

  setEventConnectionState("connecting");
  const source = new EventSource(buildEventStreamUrl());
  sharedEventSource = source;

  source.onopen = () => {
    setEventConnectionState("open");
  };

  source.onmessage = (evt) => {
    try {
      const event = JSON.parse(evt.data) as RealtimeEvent;
      for (const subscriber of eventStreamSubscribers) {
        subscriber.onEvent(event);
      }
    } catch {
      // ignore malformed messages
    }
  };

  source.onerror = () => {
    closeSharedEventSource();
    if (eventStreamSubscribers.size === 0) {
      setEventConnectionState("closed");
      return;
    }
    setEventConnectionState("error");
    scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (eventReconnectTimer !== null || typeof window === "undefined") {
    return;
  }

  eventReconnectTimer = window.setTimeout(() => {
    eventReconnectTimer = null;
    ensureEventStreamConnected();
  }, 2000);
}

function closeSharedEventSource(): void {
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
  }
}

function notifyEventStreamState(subscriber: EventStreamSubscriber, state: EventStreamConnectionState): void {
  subscriber.onStateChange?.(state);
}
