import { randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  ApprovalReplayEvent,
  MemoryContextPack,
  NpuModelManifest,
  NpuRuntimeStatus,
  OnboardingBootstrapInput,
  OnboardingBootstrapResult,
  OnboardingState,
  PendingApprovalAction,
  RealtimeEvent,
  SessionMeta,
  ToolAccessEvaluateResponse,
  ToolCatalogEntry,
  ToolGrantRecord,
  ToolInvokeResult,
} from "@goatcitadel/contracts";
import type { TuiResolvedAuth } from "./profile.js";

export interface TuiApiClientOptions {
  baseUrl: string;
  auth: TuiResolvedAuth;
  readOnly: boolean;
}

export interface TuiCostSummaryResponse {
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

export class TuiApiClient {
  public readonly baseUrl: string;
  public readonly readOnly: boolean;
  private readonly auth: TuiResolvedAuth;

  public constructor(options: TuiApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.auth = options.auth;
    this.readOnly = options.readOnly;
  }

  public async health(): Promise<{ status: string }> {
    return this.request("/health", { method: "GET" });
  }

  public async dashboard(): Promise<{
    timestamp: string;
    sessions: SessionMeta[];
    pendingApprovals: number;
    activeSubagents: number;
    taskStatusCounts: Array<{ status: string; count: number }>;
    recentEvents: RealtimeEvent[];
    dailyCostUsd: number;
  }> {
    return this.request("/api/v1/dashboard/state", { method: "GET" });
  }

  public async systemVitals(): Promise<{
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
  }> {
    return this.request("/api/v1/system/vitals", { method: "GET" });
  }

  public async listApprovals(status = "pending"): Promise<{ items: ApprovalRequest[] }> {
    return this.request(`/api/v1/approvals?status=${encodeURIComponent(status)}`, { method: "GET" });
  }

  public async getApprovalReplay(approvalId: string): Promise<{
    approval: ApprovalRequest;
    events: ApprovalReplayEvent[];
    pendingAction?: PendingApprovalAction;
  }> {
    return this.request(`/api/v1/approvals/${encodeURIComponent(approvalId)}/replay`, { method: "GET" });
  }

  public async resolveApproval(approvalId: string, decision: "approve" | "reject"): Promise<{
    approval: ApprovalRequest;
    executedAction?: ToolInvokeResult;
  }> {
    return this.request(
      `/api/v1/approvals/${encodeURIComponent(approvalId)}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({
          decision,
          resolvedBy: "tui-operator",
        }),
      },
      true,
    );
  }

  public async listSessions(limit = 50): Promise<{ items: SessionMeta[]; nextCursor?: string }> {
    return this.request(`/api/v1/sessions?limit=${limit}`, { method: "GET" });
  }

  public async listCosts(scope: "day" | "session" | "agent" | "task"): Promise<TuiCostSummaryResponse> {
    return this.request(`/api/v1/costs/summary?scope=${scope}`, { method: "GET" });
  }

  public async runCheaper(): Promise<{ mode: string; actions: string[] }> {
    return this.request("/api/v1/costs/run-cheaper", {
      method: "POST",
      body: JSON.stringify({}),
    }, true);
  }

  public async listTasks(status?: string): Promise<{ items: Array<Record<string, unknown>>; nextCursor?: string }> {
    const query = status ? `?status=${encodeURIComponent(status)}&limit=100` : "?limit=100";
    return this.request(`/api/v1/tasks${query}`, { method: "GET" });
  }

  public async createTask(input: {
    title: string;
    description?: string;
    priority?: "low" | "normal" | "high" | "urgent";
  }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async updateTask(taskId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }, true);
  }

  public async listTaskActivities(taskId: string): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(taskId)}/activities`, { method: "GET" });
  }

  public async appendTaskActivity(taskId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(taskId)}/activities`, {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async listSkills(): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request("/api/v1/skills", { method: "GET" });
  }

  public async reloadSkills(): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request("/api/v1/skills/reload", {
      method: "POST",
      body: JSON.stringify({}),
    }, true);
  }

  public async resolveSkills(text: string, explicitSkills?: string[]): Promise<Record<string, unknown>> {
    return this.request("/api/v1/skills/resolve-activation", {
      method: "POST",
      body: JSON.stringify({
        text,
        explicitSkills: explicitSkills && explicitSkills.length > 0 ? explicitSkills : undefined,
      }),
    });
  }

  public async integrationCatalog(kind?: string): Promise<{ items: Array<Record<string, unknown>> }> {
    const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return this.request(`/api/v1/integrations/catalog${query}`, { method: "GET" });
  }

  public async integrationConnections(kind?: string): Promise<{ items: Array<Record<string, unknown>> }> {
    const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return this.request(`/api/v1/integrations/connections${query}`, { method: "GET" });
  }

  public async createIntegrationConnection(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("/api/v1/integrations/connections", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async updateIntegrationConnection(connectionId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/integrations/connections/${encodeURIComponent(connectionId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }, true);
  }

  public async deleteIntegrationConnection(connectionId: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/v1/integrations/connections/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    }, true);
  }

  public async meshStatus(): Promise<Record<string, unknown>> {
    return this.request("/api/v1/mesh/status", { method: "GET" });
  }

  public async meshNodes(): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request("/api/v1/mesh/nodes?limit=100", { method: "GET" });
  }

  public async meshLeases(): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request("/api/v1/mesh/leases?limit=100", { method: "GET" });
  }

  public async meshOwners(): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request("/api/v1/mesh/sessions/owners?limit=200", { method: "GET" });
  }

  public async meshReplicationOffsets(): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request("/api/v1/mesh/replication/offsets?limit=200", { method: "GET" });
  }

  public async meshAcquireLease(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("/api/v1/mesh/leases/acquire", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async meshRenewLease(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("/api/v1/mesh/leases/renew", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async meshReleaseLease(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("/api/v1/mesh/leases/release", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async meshClaimSession(sessionId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/mesh/sessions/${encodeURIComponent(sessionId)}/claim`, {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async npuStatus(): Promise<NpuRuntimeStatus> {
    return this.request("/api/v1/npu/status", { method: "GET" });
  }

  public async npuModels(): Promise<{ items: NpuModelManifest[] }> {
    return this.request("/api/v1/npu/models", { method: "GET" });
  }

  public async npuStart(): Promise<NpuRuntimeStatus> {
    return this.request("/api/v1/npu/start", {
      method: "POST",
      body: JSON.stringify({}),
    }, true);
  }

  public async npuStop(): Promise<NpuRuntimeStatus> {
    return this.request("/api/v1/npu/stop", {
      method: "POST",
      body: JSON.stringify({}),
    }, true);
  }

  public async npuRefresh(): Promise<NpuRuntimeStatus> {
    return this.request("/api/v1/npu/refresh", {
      method: "POST",
      body: JSON.stringify({}),
    }, true);
  }

  public async onboardingState(): Promise<OnboardingState> {
    return this.request("/api/v1/onboarding/state", { method: "GET" });
  }

  public async onboardingBootstrap(input: OnboardingBootstrapInput): Promise<OnboardingBootstrapResult> {
    return this.request("/api/v1/onboarding/bootstrap", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async onboardingComplete(completedBy: string): Promise<{ state: OnboardingState }> {
    return this.request("/api/v1/onboarding/complete", {
      method: "POST",
      body: JSON.stringify({ completedBy }),
    }, true);
  }

  public async runtimeSettings(): Promise<Record<string, unknown>> {
    return this.request("/api/v1/settings", { method: "GET" });
  }

  public async patchRuntimeSettings(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    }, true);
  }

  public async listEvents(limit = 100): Promise<{ items: RealtimeEvent[]; nextCursor?: string }> {
    return this.request(`/api/v1/events?limit=${limit}`, { method: "GET" });
  }

  public async listMemoryQmdStats(): Promise<{
    from: string;
    to: string;
    totalRuns: number;
    generatedRuns: number;
    cacheHitRuns: number;
    fallbackRuns: number;
    failedRuns: number;
    originalTokenEstimate: number;
    distilledTokenEstimate: number;
    savingsPercent: number;
    recent: MemoryContextPack[];
  }> {
    return this.request("/api/v1/memory/qmd/stats?limit=25", { method: "GET" });
  }

  public async toolsCatalog(): Promise<{ items: ToolCatalogEntry[] }> {
    return this.request("/api/v1/tools/catalog", { method: "GET" });
  }

  public async toolsEvaluateAccess(input: {
    toolName: string;
    agentId: string;
    sessionId: string;
    taskId?: string;
    args?: Record<string, unknown>;
  }): Promise<ToolAccessEvaluateResponse> {
    return this.request("/api/v1/tools/access/evaluate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public async toolsListGrants(input?: {
    scope?: "global" | "session" | "agent" | "task";
    scopeRef?: string;
    limit?: number;
  }): Promise<{ items: ToolGrantRecord[] }> {
    const query = new URLSearchParams();
    if (input?.scope) {
      query.set("scope", input.scope);
    }
    if (input?.scopeRef) {
      query.set("scopeRef", input.scopeRef);
    }
    query.set("limit", String(input?.limit ?? 300));
    return this.request(`/api/v1/tools/grants?${query.toString()}`, { method: "GET" });
  }

  public async toolsCreateGrant(input: {
    toolPattern: string;
    decision: "allow" | "deny";
    scope: "global" | "session" | "agent" | "task";
    scopeRef?: string;
    grantType?: "one_time" | "ttl" | "persistent";
    constraints?: Record<string, unknown>;
    createdBy: string;
    expiresAt?: string;
    usesRemaining?: number;
  }): Promise<ToolGrantRecord> {
    return this.request("/api/v1/tools/grants", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public async toolsRevokeGrant(grantId: string): Promise<{ revoked: boolean; grantId: string }> {
    return this.request(`/api/v1/tools/grants/${encodeURIComponent(grantId)}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    }, true);
  }

  public async toolsInvoke(input: {
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
    return this.request("/api/v1/tools/invoke", {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  }

  public streamHeaders(): Record<string, string> {
    if (this.auth.mode === "token" && this.auth.token) {
      return { Authorization: `Bearer ${this.auth.token}` };
    }
    if (this.auth.mode === "basic" && this.auth.username && this.auth.password) {
      return {
        Authorization: `Basic ${Buffer.from(`${this.auth.username}:${this.auth.password}`).toString("base64")}`,
      };
    }
    return {};
  }

  private async request<T>(
    routePath: string,
    init: RequestInit,
    mutating = false,
  ): Promise<T> {
    if (mutating && this.readOnly) {
      throw new Error("Read-only mode is enabled for this TUI session");
    }

    const headers = new Headers(init.headers ?? {});
    headers.set("Content-Type", "application/json");

    if (mutating) {
      headers.set("Idempotency-Key", randomUUID());
    }

    if (this.auth.mode === "token" && this.auth.token) {
      headers.set("Authorization", `Bearer ${this.auth.token}`);
    } else if (this.auth.mode === "basic" && this.auth.username && this.auth.password) {
      headers.set("Authorization", `Basic ${Buffer.from(`${this.auth.username}:${this.auth.password}`).toString("base64")}`);
    }

    const response = await fetch(`${this.baseUrl}${routePath}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${init.method ?? "GET"} ${routePath} failed (${response.status}): ${body}`);
    }
    if (response.status === 204) {
      return {} as T;
    }
    return (await response.json()) as T;
  }
}
