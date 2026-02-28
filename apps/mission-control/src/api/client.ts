const API_BASE = import.meta.env.VITE_GATEWAY_URL ?? "http://127.0.0.1:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.method && init.method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
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

export interface SessionsResponse {
  items: Array<{
    sessionId: string;
    sessionKey: string;
    health: string;
    updatedAt: string;
    tokenTotal: number;
    costUsdTotal: number;
  }>;
  nextCursor?: string;
}

export interface ApprovalsResponse {
  items: Array<{
    approvalId: string;
    kind: string;
    riskLevel: string;
    status: string;
    createdAt: string;
    preview: Record<string, unknown>;
    explanationStatus: "not_requested" | "pending" | "completed" | "failed";
    explanation?: {
      summary: string;
      riskExplanation: string;
      saferAlternative?: string;
      generatedAt: string;
      providerId?: string;
      model?: string;
    };
    explanationError?: string;
  }>;
}

export interface ApprovalReplayResponse {
  approval: {
    approvalId: string;
    kind: string;
    riskLevel: string;
    status: string;
    explanationStatus: "not_requested" | "pending" | "completed" | "failed";
    explanation?: {
      summary: string;
      riskExplanation: string;
      saferAlternative?: string;
      generatedAt: string;
      providerId?: string;
      model?: string;
    };
    explanationError?: string;
  };
  events: Array<{
    eventId: string;
    eventType: string;
    actorId: string;
    timestamp: string;
    payload: Record<string, unknown>;
  }>;
  pendingAction?: {
    resolutionStatus?: string;
    request: Record<string, unknown>;
    result?: Record<string, unknown>;
  };
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
  openclawSessionId: string;
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
  items: Array<{
    agentId: string;
    name: string;
    status: "active" | "idle";
    sessionCount: number;
    activeSessions: number;
    lastUpdatedAt?: string;
  }>;
}

export interface RuntimeSettingsResponse {
  environment: string;
  defaultToolProfile: string;
  budgetMode: string;
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

export async function fetchSessions(): Promise<SessionsResponse> {
  return request<SessionsResponse>("/api/v1/sessions?limit=50");
}

export async function fetchApprovals(status = "pending"): Promise<ApprovalsResponse> {
  return request<ApprovalsResponse>(`/api/v1/approvals?status=${encodeURIComponent(status)}`);
}

export async function resolveApproval(
  approvalId: string,
  decision: "approve" | "reject",
): Promise<{ approval: unknown; executedAction?: { outcome: string; policyReason: string } }> {
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
  const query = status ? `?status=${encodeURIComponent(status)}&limit=100` : "?limit=100";
  return request<{ items: TaskRecord[]; nextCursor?: string }>(`/api/v1/tasks${query}`);
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

export async function updateTask(taskId: string, input: Partial<Pick<TaskRecord, "status" | "priority" | "assignedAgentId" | "title" | "description" | "dueAt">>): Promise<TaskRecord> {
  return request<TaskRecord>(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
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
  input: { openclawSessionId: string; agentName?: string },
): Promise<TaskSubagentSession> {
  return request<TaskSubagentSession>(`/api/v1/tasks/${encodeURIComponent(taskId)}/subagents`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTaskSubagent(
  openclawSessionId: string,
  input: { status?: TaskSubagentSession["status"]; endedAt?: string },
): Promise<TaskSubagentSession> {
  return request<TaskSubagentSession>(`/api/v1/subagents/${encodeURIComponent(openclawSessionId)}`, {
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

export async function fetchAgents(): Promise<AgentsResponse> {
  return request<AgentsResponse>("/api/v1/agents");
}

export async function fetchFilesList(
  dir = ".",
  limit = 1000,
): Promise<{ items: Array<{ relativePath: string; size: number; modifiedAt: string }> }> {
  return request<{ items: Array<{ relativePath: string; size: number; modifiedAt: string }> }>(
    `/api/v1/files/list?dir=${encodeURIComponent(dir)}&limit=${limit}`,
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

export async function patchSettings(input: {
  defaultToolProfile?: string;
  budgetMode?: "saver" | "balanced" | "power";
  networkAllowlist?: string[];
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
}): Promise<RuntimeSettingsResponse> {
  return request<RuntimeSettingsResponse>("/api/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
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
  temperature?: number;
  max_tokens?: number;
}): Promise<LlmChatCompletionResponse> {
  return request<LlmChatCompletionResponse>("/api/v1/llm/chat-completions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function connectEventStream(onEvent: (event: RealtimeEvent) => void): () => void {
  const source = new EventSource(`${API_BASE}/api/v1/events/stream?replay=20`);
  source.onmessage = (evt) => {
    try {
      onEvent(JSON.parse(evt.data) as RealtimeEvent);
    } catch {
      // ignore malformed
    }
  };
  return () => {
    source.close();
  };
}
