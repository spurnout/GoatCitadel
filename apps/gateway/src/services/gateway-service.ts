import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { EventIngestService } from "@goatcitadel/gateway-core";
import { MeshService } from "@goatcitadel/mesh-core";
import { OrchestrationEngine } from "@goatcitadel/orchestration";
import { ToolPolicyEngine, assertExistingPathRealpathAllowed, assertWritePathInJail } from "@goatcitadel/policy-engine";
import { SkillsService } from "@goatcitadel/skills";
import { Storage } from "@goatcitadel/storage";
import type {
  AgentProfileArchiveInput,
  AgentProfileCreateInput,
  AgentProfileRecord,
  AgentProfileUpdateInput,
  AuthRuntimeSettings,
  AuthSettingsUpdateInput,
  ApprovalCreateInput,
  ApprovalReplayEvent,
  ApprovalRequest,
  ApprovalResolveInput,
  ChannelInboundMessageInput,
  MemoryContextComposeRequest,
  MemoryContextPack,
  MemoryQmdStatsResponse,
  CronJobRecord,
  DashboardState,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GatewayEventInput,
  GatewayEventResult,
  IntegrationCatalogEntry,
  IntegrationConnection,
  IntegrationConnectionCreateInput,
  IntegrationConnectionUpdateInput,
  IntegrationKind,
  LlmModelRecord,
  LlmRuntimeConfig,
  OnboardingBootstrapInput,
  OnboardingBootstrapResult,
  OnboardingChecklistItem,
  OnboardingState,
  MeshJoinRequest,
  MeshJoinResult,
  MeshLeaseAcquireRequest,
  MeshLeaseRecord,
  MeshLeaseReleaseRequest,
  MeshLeaseRenewRequest,
  MeshNodeRecord,
  MeshReplicationIngestRequest,
  MeshReplicationRecord,
  MeshSessionClaimRequest,
  MeshSessionOwnerRecord,
  MeshStatus,
  MeshReplicationOffset,
  NpuModelManifest,
  NpuRuntimeStatus,
  OperatorSummary,
  OrchestrationPlan,
  OrchestrationRun,
  PendingApprovalAction,
  RealtimeEvent,
  SkillResolveInput,
  SystemVitals,
  TaskActivityCreateInput,
  TaskActivityRecord,
  TaskCreateInput,
  TaskDeliverableCreateInput,
  TaskDeliverableRecord,
  TaskRecord,
  TaskStatus,
  TaskSubagentCreateInput,
  TaskSubagentSession,
  TaskSubagentUpdateInput,
  TaskUpdateInput,
  ToolInvokeRequest,
  ToolInvokeResult,
} from "@goatcitadel/contracts";
import { BUILTIN_AGENT_PROFILES } from "@goatcitadel/contracts";
import type { GatewayRuntimeConfig } from "../config.js";
import type { OrchestrationCheckpoint } from "@goatcitadel/storage";
import { LlmService } from "./llm-service.js";
import { ApprovalExplainerService } from "./approval-explainer-service.js";
import { INTEGRATION_CATALOG } from "./integration-catalog.js";
import { MemoryContextService } from "./memory-context-service.js";
import { NpuSidecarService } from "./npu-sidecar-service.js";

export interface ApprovalResolveResult {
  approval: ApprovalRequest;
  executedAction?: ToolInvokeResult;
}

export interface ApprovalReplayResult {
  approval: ApprovalRequest;
  events: ApprovalReplayEvent[];
  pendingAction?: PendingApprovalAction;
}

export interface FileUploadResult {
  relativePath: string;
  fullPath: string;
  bytes: number;
}

export interface FileDownloadResult {
  relativePath: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
  contentType: string;
  isText: boolean;
  content: string | Buffer;
}

export interface FileTemplateRecord {
  templateId: string;
  title: string;
  description: string;
  defaultPath: string;
  body: string;
}

export interface MemoryFileEntry {
  relativePath: string;
  size: number;
  modifiedAt: string;
}

export interface RuntimeSettings {
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
  auth: AuthRuntimeSettings;
  llm: LlmRuntimeConfig;
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

interface RealtimeListener {
  (event: RealtimeEvent): void;
}

export class GatewayService {
  private readonly storage: Storage;
  private readonly eventIngestService: EventIngestService;
  private readonly policyEngine: ToolPolicyEngine;
  private readonly skillsService: SkillsService;
  private readonly orchestrationEngine: OrchestrationEngine;
  private readonly llmService: LlmService;
  private readonly memoryContextService: MemoryContextService;
  private readonly meshService: MeshService;
  private readonly npuSidecar: NpuSidecarService;
  private readonly approvalExplainer: ApprovalExplainerService;
  private readonly realtime = new EventEmitter();
  private readonly backgroundTasks = new Set<Promise<void>>();
  private readonly onboardingMarkerPath: string;
  private closing = false;
  private onboardingMarker: { completedAt?: string; completedBy?: string } = {};

  public constructor(private readonly config: GatewayRuntimeConfig) {
    this.storage = new Storage({
      dbPath: config.dbPath,
      transcriptsDir: path.resolve(config.rootDir, config.assistant.transcriptsDir),
      auditDir: path.resolve(config.rootDir, config.assistant.auditDir),
    });
    this.onboardingMarkerPath = path.resolve(
      config.rootDir,
      config.assistant.dataDir,
      "onboarding-state.json",
    );

    this.eventIngestService = new EventIngestService(this.storage);
    this.policyEngine = new ToolPolicyEngine(config.toolPolicy, this.storage);
    this.skillsService = new SkillsService([
      { source: "extra", dir: path.join(config.rootDir, "skills", "extra") },
      { source: "bundled", dir: path.join(config.rootDir, "skills", "bundled") },
      { source: "managed", dir: path.join(config.rootDir, ".assistant", "skills") },
      { source: "workspace", dir: path.join(config.rootDir, "skills", "workspace") },
    ]);
    this.orchestrationEngine = new OrchestrationEngine();
    this.llmService = new LlmService(config.llm);
    this.memoryContextService = new MemoryContextService(
      this.storage,
      this.llmService,
      config,
      (eventType, payload) => {
        this.publishRealtime(eventType, "memory", payload);
      },
    );
    this.meshService = new MeshService(this.storage, {
      enabled: config.assistant.mesh.enabled,
      mode: config.assistant.mesh.mode,
      localNodeId: config.assistant.mesh.nodeId,
      localNodeLabel: config.assistant.mesh.label,
      advertiseAddress: config.assistant.mesh.advertiseAddress,
      requireMtls: config.assistant.mesh.security.requireMtls,
      tailnetEnabled: config.assistant.mesh.security.tailnet.enabled,
      joinToken: process.env[config.assistant.mesh.security.joinTokenEnv],
      defaultLeaseTtlSeconds: config.assistant.mesh.leases.ttlSeconds,
    });
    this.npuSidecar = new NpuSidecarService({
      rootDir: config.rootDir,
      config: config.assistant.npu,
      onEvent: (eventType, payload) => {
        this.publishRealtime(eventType, "npu", payload);
      },
    });
    this.approvalExplainer = new ApprovalExplainerService(
      this.storage,
      this.llmService,
      config.assistant.approvalExplainer,
      (payload) => {
        this.publishRealtime("approval_explained", "approvals", { ...payload });
      },
    );
  }

  public async init(): Promise<void> {
    await this.loadOnboardingMarker();
    this.storage.agentProfiles.seedBuiltins(BUILTIN_AGENT_PROFILES);
    await this.skillsService.reload();
    await this.loadCronJobsFromConfig();
    this.meshService.init();
    await this.npuSidecar.init();
    // Enforce env-only secret persistence policy on startup.
    this.persistLlmConfig();
    this.persistAssistantConfig();
  }

  public subscribeRealtime(listener: RealtimeListener): () => void {
    this.realtime.on("event", listener);
    return () => {
      this.realtime.off("event", listener);
    };
  }

  public listRealtimeEvents(limit = 100, cursor?: string): RealtimeEvent[] {
    return this.storage.realtimeEvents.list(limit, cursor);
  }

  public async ingestEvent(
    idempotencyKey: string,
    payload: GatewayEventInput,
  ): Promise<GatewayEventResult> {
    const result = await this.eventIngestService.ingest({
      endpoint: "/api/v1/gateway/events",
      idempotencyKey,
      payload,
    });

    this.publishRealtime("session_event", "gateway", {
      eventId: payload.eventId,
      sessionId: result.session.sessionId,
      sessionKey: result.session.sessionKey,
      actorType: payload.actor.type,
      actorId: payload.actor.id,
      messageRole: payload.message.role,
      taskId: payload.taskId,
      deduped: result.deduped,
    });

    return result;
  }

  public listSessions(limit: number, cursor?: string) {
    return this.storage.sessions.list(limit, cursor);
  }

  public getSession(sessionId: string) {
    return this.storage.sessions.getBySessionId(sessionId);
  }

  public async getTranscript(sessionId: string) {
    return this.storage.transcripts.read(sessionId);
  }

  public async invokeTool(request: ToolInvokeRequest): Promise<ToolInvokeResult> {
    const result = await this.policyEngine.invoke(request);
    this.publishRealtime("tool_invoked", "policy", {
      toolName: request.toolName,
      sessionId: request.sessionId,
      agentId: request.agentId,
      taskId: request.taskId,
      outcome: result.outcome,
      policyReason: result.policyReason,
      approvalId: result.approvalId,
      auditEventId: result.auditEventId,
    });

    if (result.outcome === "approval_required" && result.approvalId) {
      this.scheduleApprovalExplanationById(result.approvalId);
    }

    return result;
  }

  public async createApproval(input: ApprovalCreateInput): Promise<ApprovalRequest> {
    const approval = this.storage.approvals.create(input);

    this.storage.approvalEvents.append({
      approvalId: approval.approvalId,
      eventType: "created",
      actorId: "system",
      payload: {
        kind: approval.kind,
        riskLevel: approval.riskLevel,
        status: approval.status,
      },
    });

    await this.storage.audit.append("approvals", {
      event: "approval.create",
      approvalId: approval.approvalId,
      kind: approval.kind,
      riskLevel: approval.riskLevel,
      status: approval.status,
    });

    this.publishRealtime("approval_created", "approvals", {
      approvalId: approval.approvalId,
      kind: approval.kind,
      riskLevel: approval.riskLevel,
      status: approval.status,
    });

    this.scheduleApprovalExplanation(approval);

    return approval;
  }

  public listApprovals(status?: ApprovalRequest["status"], limit = 100): ApprovalRequest[] {
    return this.storage.approvals.list(status, limit);
  }

  public getApprovalReplay(approvalId: string, replayedBy = "operator"): ApprovalReplayResult {
    const approval = this.storage.approvals.get(approvalId);

    this.storage.approvalEvents.append({
      approvalId,
      eventType: "replayed",
      actorId: replayedBy,
      payload: {
        status: approval.status,
      },
    });

    return {
      approval,
      events: this.storage.approvalEvents.listByApprovalId(approvalId),
      pendingAction: this.storage.pendingApprovalActions.find(approvalId),
    };
  }

  public async resolveApproval(approvalId: string, input: ApprovalResolveInput): Promise<ApprovalResolveResult> {
    const approval = this.storage.approvals.resolve(approvalId, input);

    this.storage.approvalEvents.append({
      approvalId,
      eventType: "resolved",
      actorId: input.resolvedBy,
      payload: {
        decision: input.decision,
        status: approval.status,
        editedPayload: input.editedPayload,
      },
    });

    let executedAction: ToolInvokeResult | undefined;

    if (input.decision === "approve") {
      executedAction = await this.policyEngine.executeApprovedAction(approvalId);
    } else {
      const pending = this.storage.pendingApprovalActions.find(approvalId);
      if (pending && pending.resolutionStatus === "pending") {
        this.storage.pendingApprovalActions.markResolved(approvalId, "rejected", {
          decision: input.decision,
        });
      }
    }

    await this.storage.audit.append("approvals", {
      event: "approval.resolve",
      approvalId,
      status: approval.status,
      resolvedBy: input.resolvedBy,
      decision: input.decision,
      executedAction: executedAction
        ? {
            outcome: executedAction.outcome,
            policyReason: executedAction.policyReason,
            auditEventId: executedAction.auditEventId,
          }
        : undefined,
    });

    this.publishRealtime("approval_resolved", "approvals", {
      approvalId,
      status: approval.status,
      decision: input.decision,
      resolvedBy: input.resolvedBy,
      executedOutcome: executedAction?.outcome,
    });

    return {
      approval,
      executedAction,
    };
  }

  public costSummary(
    scope: "session" | "day" | "agent" | "task",
    from: string,
    to: string,
  ) {
    return this.storage.costLedger.summary(scope, from, to);
  }

  public runCheaper() {
    return {
      mode: "saver",
      actions: [
        "trim context",
        "summarize tool outputs",
        "reduce fanout",
      ],
    };
  }

  public listSkills() {
    return this.skillsService.list();
  }

  public async reloadSkills() {
    return this.skillsService.reload();
  }

  public resolveSkillActivation(input: SkillResolveInput) {
    return this.skillsService.resolveActivation(input);
  }

  public listTasks(
    limit: number,
    status?: TaskStatus,
    cursor?: string,
    view: "active" | "trash" | "all" = "active",
  ): TaskRecord[] {
    return this.storage.tasks.list({
      status,
      limit,
      cursor,
      view,
    });
  }

  public getTask(taskId: string): TaskRecord {
    return this.storage.tasks.get(taskId);
  }

  public createTask(input: TaskCreateInput): TaskRecord {
    const created = this.storage.tasks.create(input);
    this.publishRealtime("task_created", "tasks", {
      task: created,
    });
    return created;
  }

  public updateTask(taskId: string, input: TaskUpdateInput): TaskRecord {
    if (input.status === "done") {
      const deliverables = this.storage.taskDeliverables.countByTask(taskId);
      if (deliverables < 1) {
        throw new Error("Cannot mark task done without at least one deliverable");
      }
    }

    const updated = this.storage.tasks.update(taskId, input);
    this.publishRealtime("task_updated", "tasks", {
      task: updated,
    });
    return updated;
  }

  public softDeleteTask(taskId: string, deletedBy?: string, deleteReason?: string): boolean {
    const deleted = this.storage.tasks.softDelete(taskId, deletedBy, deleteReason);
    if (deleted) {
      this.publishRealtime("task_deleted", "tasks", { taskId, mode: "soft" });
    }
    return deleted;
  }

  public restoreTask(taskId: string): boolean {
    const restored = this.storage.tasks.restore(taskId);
    if (restored) {
      this.publishRealtime("task_restored", "tasks", { taskId });
    }
    return restored;
  }

  public hardDeleteTask(taskId: string): boolean {
    const deleted = this.storage.tasks.hardDelete(taskId);
    if (deleted) {
      this.publishRealtime("task_deleted", "tasks", { taskId, mode: "hard" });
    }
    return deleted;
  }

  public listTaskActivities(taskId: string, limit = 200): TaskActivityRecord[] {
    this.storage.tasks.get(taskId);
    return this.storage.taskActivities.listByTask(taskId, limit);
  }

  public appendTaskActivity(taskId: string, input: TaskActivityCreateInput): TaskActivityRecord {
    this.storage.tasks.get(taskId);
    const activity = this.storage.taskActivities.append(taskId, input);
    this.publishRealtime("activity_logged", "tasks", {
      taskId,
      activity,
    });
    return activity;
  }

  public listTaskDeliverables(taskId: string, limit = 200): TaskDeliverableRecord[] {
    this.storage.tasks.get(taskId);
    return this.storage.taskDeliverables.listByTask(taskId, limit);
  }

  public appendTaskDeliverable(taskId: string, input: TaskDeliverableCreateInput): TaskDeliverableRecord {
    this.storage.tasks.get(taskId);
    const deliverable = this.storage.taskDeliverables.append(taskId, input);
    this.publishRealtime("deliverable_added", "tasks", {
      taskId,
      deliverable,
    });
    return deliverable;
  }

  public listTaskSubagents(taskId: string, limit = 200): TaskSubagentSession[] {
    this.storage.tasks.get(taskId);
    return this.storage.taskSubagents.listByTask(taskId, limit);
  }

  public registerTaskSubagent(taskId: string, input: TaskSubagentCreateInput): TaskSubagentSession {
    this.storage.tasks.get(taskId);
    const session = this.storage.taskSubagents.create(taskId, input);
    this.publishRealtime("subagent_registered", "tasks", {
      taskId,
      session,
    });
    return session;
  }

  public updateTaskSubagent(agentSessionId: string, input: TaskSubagentUpdateInput): TaskSubagentSession {
    const updated = this.storage.taskSubagents.updateByAgentSessionId(agentSessionId, {
      ...input,
      endedAt: input.endedAt ?? (input.status && input.status !== "active" ? new Date().toISOString() : undefined),
    });

    this.publishRealtime("subagent_updated", "tasks", {
      taskId: updated.taskId,
      session: updated,
    });
    return updated;
  }

  public getDashboardState(): DashboardState {
    const sessions = this.storage.sessions.list(200);
    const pendingApprovals = this.storage.approvals.list("pending", 10000).length;
    const activeSubagents = this.storage.taskSubagents.activeCount();
    const taskStatusCounts = this.storage.tasks.statusCounts();
    const recentEvents = this.storage.realtimeEvents.list(100);

    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    const byDay = this.storage.costLedger.summary("day", from, to);
    const dailyCostUsd = byDay.reduce((sum, row) => sum + row.costUsd, 0);

    return {
      timestamp: now.toISOString(),
      sessions,
      pendingApprovals,
      activeSubagents,
      taskStatusCounts,
      recentEvents,
      dailyCostUsd,
    };
  }

  public getSystemVitals(): SystemVitals {
    const total = os.totalmem();
    const free = os.freemem();
    const processMem = process.memoryUsage();
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      uptimeSeconds: os.uptime(),
      loadAverage: os.loadavg(),
      cpuCount: os.cpus().length,
      memoryTotalBytes: total,
      memoryFreeBytes: free,
      memoryUsedBytes: total - free,
      processRssBytes: processMem.rss,
      processHeapUsedBytes: processMem.heapUsed,
    };
  }

  public listOperators(): OperatorSummary[] {
    const sessions = this.storage.sessions.list(10000);
    const byOperator = new Map<string, OperatorSummary>();
    const activeThreshold = Date.now() - 10 * 60 * 1000;

    for (const session of sessions) {
      const key = session.account;
      const existing = byOperator.get(key) ?? {
        operatorId: key,
        sessionCount: 0,
        activeSessions: 0,
        lastActivityAt: undefined,
      };

      existing.sessionCount += 1;
      if (Date.parse(session.lastActivityAt) >= activeThreshold) {
        existing.activeSessions += 1;
      }

      if (!existing.lastActivityAt || Date.parse(session.lastActivityAt) > Date.parse(existing.lastActivityAt)) {
        existing.lastActivityAt = session.lastActivityAt;
      }

      byOperator.set(key, existing);
    }

    return Array.from(byOperator.values()).sort((a, b) => {
      const left = Date.parse(a.lastActivityAt ?? "1970-01-01T00:00:00.000Z");
      const right = Date.parse(b.lastActivityAt ?? "1970-01-01T00:00:00.000Z");
      return right - left;
    });
  }

  public listCronJobs(): CronJobRecord[] {
    return this.storage.cronJobs.list();
  }

  public async uploadWorkspaceFile(relativePath: string, content: string): Promise<FileUploadResult> {
    const normalized = this.normalizeRelativePath(relativePath);
    const fullPath = path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, normalized);
    assertWritePathInJail(fullPath, this.config.toolPolicy.sandbox.writeJailRoots);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");

    const result = {
      relativePath: normalized,
      fullPath,
      bytes: Buffer.byteLength(content, "utf8"),
    };

    this.publishRealtime("system", "files", {
      type: "file_uploaded",
      ...result,
    });

    return result;
  }

  public listFileTemplates(): FileTemplateRecord[] {
    const today = new Date().toISOString().slice(0, 10);
    return FILE_TEMPLATES.map((template) => ({
      ...template,
      defaultPath: template.defaultPath.replaceAll("{date}", today),
    }));
  }

  public async createWorkspaceFileFromTemplate(templateId: string, targetPath?: string): Promise<FileUploadResult> {
    const template = FILE_TEMPLATES.find((item) => item.templateId === templateId);
    if (!template) {
      throw new Error(`Unknown file template: ${templateId}`);
    }
    const today = new Date().toISOString().slice(0, 10);
    const resolvedPath = (targetPath && targetPath.trim()) || template.defaultPath.replaceAll("{date}", today);
    const content = template.body.replaceAll("{date}", today);
    return this.uploadWorkspaceFile(resolvedPath, content);
  }

  public async downloadWorkspaceFile(relativePath: string): Promise<FileDownloadResult> {
    const normalized = this.normalizeRelativePath(relativePath);
    const fullPath = path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, normalized);
    try {
      assertExistingPathRealpathAllowed(
        fullPath,
        this.config.toolPolicy.sandbox.writeJailRoots,
        this.config.toolPolicy.sandbox.readOnlyRoots,
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new Error(`File not found: ${normalized}`);
      }
      throw error;
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${fullPath}`);
    }

    const contentType = detectMimeType(fullPath);
    const isText = isTextContentType(contentType);
    const content = isText
      ? await fs.readFile(fullPath, "utf8")
      : await fs.readFile(fullPath);

    return {
      relativePath: normalized,
      fullPath,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      contentType,
      isText,
      content,
    };
  }

  public async listMemoryFiles(relativeDir = "memory"): Promise<MemoryFileEntry[]> {
    const normalized = this.normalizeRelativePath(relativeDir);
    const baseDir = path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, normalized);
    assertWritePathInJail(baseDir, this.config.toolPolicy.sandbox.writeJailRoots);

    let entries: Array<{ isFile: () => boolean; name: string }>;
    try {
      entries = await fs.readdir(baseDir, { withFileTypes: true, encoding: "utf8" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const files: MemoryFileEntry[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const fullPath = path.join(baseDir, entry.name);
      const stat = await fs.stat(fullPath);
      files.push({
        relativePath: path.posix.join(normalized, entry.name),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    files.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
    return files;
  }

  public async listWorkspaceFiles(relativeDir = ".", maxItems = 1000): Promise<MemoryFileEntry[]> {
    const normalized = relativeDir === "." ? "." : this.normalizeRelativePath(relativeDir);
    const baseDir = normalized === "."
      ? path.resolve(this.config.rootDir, this.config.assistant.workspaceDir)
      : path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, normalized);

    assertWritePathInJail(baseDir, this.config.toolPolicy.sandbox.writeJailRoots);

    const out: MemoryFileEntry[] = [];
    await walkFiles(baseDir, baseDir, out, maxItems);
    out.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
    return out;
  }

  public async composeMemoryContext(input: MemoryContextComposeRequest): Promise<MemoryContextPack> {
    return this.memoryContextService.compose(input);
  }

  public getMemoryContext(contextId: string): MemoryContextPack {
    return this.memoryContextService.get(contextId);
  }

  public listRunContexts(runId: string): MemoryContextPack[] {
    return this.memoryContextService.listByRun(runId);
  }

  public listRecentMemoryContexts(limit = 60): MemoryContextPack[] {
    return this.memoryContextService.listRecent(limit);
  }

  public getMemoryQmdStats(from: string, to: string): MemoryQmdStatsResponse {
    return this.memoryContextService.stats(from, to);
  }

  public listAgents(view: "active" | "archived" | "all" = "active", limit = 500): AgentProfileRecord[] {
    const profiles = this.storage.agentProfiles.list(view, limit);
    const runtime = this.buildAgentRuntimeRollups(profiles);

    const merged = profiles.map((profile) => {
      const runtimeStats = runtime.get(profile.roleId);
      const activeSessions = runtimeStats?.activeSessions ?? 0;
      const sessionCount = runtimeStats?.sessionCount ?? 0;
      const lastUpdatedAt = runtimeStats?.lastUpdatedAt;
      return {
        ...profile,
        status: activeSessions > 0 ? "active" : "idle",
        sessionCount,
        activeSessions,
        lastUpdatedAt,
      } satisfies AgentProfileRecord;
    });

    return merged.sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
      }
      if (left.isBuiltin !== right.isBuiltin) {
        return left.isBuiltin ? -1 : 1;
      }
      const leftUpdated = Date.parse(left.lastUpdatedAt ?? left.updatedAt);
      const rightUpdated = Date.parse(right.lastUpdatedAt ?? right.updatedAt);
      if (leftUpdated !== rightUpdated) {
        return rightUpdated - leftUpdated;
      }
      return left.name.localeCompare(right.name);
    });
  }

  public getAgent(agentId: string): AgentProfileRecord {
    const profile = this.storage.agentProfiles.get(agentId);
    const runtime = this.buildAgentRuntimeRollups([profile]).get(profile.roleId);
    const activeSessions = runtime?.activeSessions ?? 0;
    return {
      ...profile,
      status: activeSessions > 0 ? "active" : "idle",
      sessionCount: runtime?.sessionCount ?? 0,
      activeSessions,
      lastUpdatedAt: runtime?.lastUpdatedAt,
    };
  }

  public createAgentProfile(input: AgentProfileCreateInput): AgentProfileRecord {
    const created = this.storage.agentProfiles.create(input);
    const agent = this.getAgent(created.agentId);
    this.publishRealtime("system", "agents", {
      type: "agent_profile_created",
      agentId: agent.agentId,
      roleId: agent.roleId,
      name: agent.name,
      isBuiltin: agent.isBuiltin,
    });
    return agent;
  }

  public updateAgentProfile(agentId: string, input: AgentProfileUpdateInput): AgentProfileRecord {
    const updated = this.storage.agentProfiles.update(agentId, input);
    const agent = this.getAgent(updated.agentId);
    this.publishRealtime("system", "agents", {
      type: "agent_profile_updated",
      agentId: agent.agentId,
      roleId: agent.roleId,
      name: agent.name,
    });
    return agent;
  }

  public archiveAgentProfile(agentId: string, input: AgentProfileArchiveInput): AgentProfileRecord {
    const archived = this.storage.agentProfiles.archive(agentId, input);
    const agent = this.getAgent(archived.agentId);
    this.publishRealtime("system", "agents", {
      type: "agent_profile_archived",
      agentId: agent.agentId,
      roleId: agent.roleId,
      archivedBy: input.archivedBy,
    });
    return agent;
  }

  public restoreAgentProfile(agentId: string): AgentProfileRecord {
    const restored = this.storage.agentProfiles.restore(agentId);
    const agent = this.getAgent(restored.agentId);
    this.publishRealtime("system", "agents", {
      type: "agent_profile_restored",
      agentId: agent.agentId,
      roleId: agent.roleId,
    });
    return agent;
  }

  public hardDeleteAgentProfile(agentId: string): boolean {
    const deleted = this.storage.agentProfiles.hardDelete(agentId);
    if (deleted) {
      this.publishRealtime("system", "agents", {
        type: "agent_profile_deleted",
        agentId,
      });
    }
    return deleted;
  }

  public getSettings(): RuntimeSettings {
    return {
      environment: this.config.assistant.environment,
      defaultToolProfile: this.config.toolPolicy.tools.profile,
      budgetMode: this.config.budgets.mode,
      workspaceDir: this.config.assistant.workspaceDir,
      writeJailRoots: this.config.toolPolicy.sandbox.writeJailRoots,
      readOnlyRoots: this.config.toolPolicy.sandbox.readOnlyRoots,
      networkAllowlist: this.config.toolPolicy.sandbox.networkAllowlist,
      approvalExplainer: this.config.assistant.approvalExplainer,
      memory: {
        enabled: this.config.assistant.memory.enabled,
        qmd: {
          enabled: this.config.assistant.memory.qmd.enabled,
          applyToChat: this.config.assistant.memory.qmd.applyToChat,
          applyToOrchestration: this.config.assistant.memory.qmd.applyToOrchestration,
          minPromptChars: this.config.assistant.memory.qmd.minPromptChars,
          maxContextTokens: this.config.assistant.memory.qmd.maxContextTokens,
          cacheTtlSeconds: this.config.assistant.memory.qmd.cacheTtlSeconds,
          distillerProviderId: this.config.assistant.memory.qmd.distiller.providerId,
          distillerModel: this.config.assistant.memory.qmd.distiller.model,
        },
      },
      auth: this.getAuthRuntimeSettings(),
      llm: this.llmService.getRuntimeConfig(),
      mesh: {
        enabled: this.config.assistant.mesh.enabled,
        mode: this.config.assistant.mesh.mode,
        nodeId: this.config.assistant.mesh.nodeId,
        mdns: this.config.assistant.mesh.discovery.mdns,
        staticPeers: this.config.assistant.mesh.discovery.staticPeers,
        requireMtls: this.config.assistant.mesh.security.requireMtls,
        tailnetEnabled: this.config.assistant.mesh.security.tailnet.enabled,
      },
      npu: {
        enabled: this.config.assistant.npu.enabled,
        autoStart: this.config.assistant.npu.autoStart,
        sidecarUrl: this.config.assistant.npu.sidecar.baseUrl,
        status: this.npuSidecar.getStatus(),
      },
    };
  }

  public getOnboardingState(): OnboardingState {
    const settings = this.getSettings();
    const activeProvider = settings.llm.providers.find(
      (provider) => provider.providerId === settings.llm.activeProviderId,
    );
    const authReady = this.isAuthConfiguredForMode(settings.auth);
    const llmReady = Boolean(
      activeProvider
      && settings.llm.activeModel.trim()
      && (activeProvider.hasApiKey || this.isProviderLikelyLocal(activeProvider.baseUrl)),
    );
    const runtimeReady = Boolean(settings.defaultToolProfile.trim()) && Boolean(settings.budgetMode.trim());
    const meshReady = settings.mesh.enabled
      ? Boolean(settings.mesh.nodeId.trim()) && (settings.mesh.mode !== "tailnet" || settings.mesh.tailnetEnabled)
      : true;

    const checklist: OnboardingChecklistItem[] = [
      {
        id: "auth",
        label: "Gateway access control",
        status: authReady ? "complete" : "needs_input",
        detail: authReady
          ? `Mode ${settings.auth.mode} is configured.`
          : "Configure token/basic credentials or explicitly choose none for local trusted use.",
      },
      {
        id: "llm",
        label: "LLM provider",
        status: llmReady ? "complete" : "needs_input",
        detail: llmReady
          ? `Provider ${settings.llm.activeProviderId} with model ${settings.llm.activeModel} is ready.`
          : "Select an active provider/model and configure an API key (or use a local endpoint).",
      },
      {
        id: "runtime",
        label: "Runtime defaults",
        status: runtimeReady ? "complete" : "needs_input",
        detail: runtimeReady
          ? `Profile ${settings.defaultToolProfile} / budget ${settings.budgetMode}.`
          : "Choose a default tool profile and budget mode.",
      },
      {
        id: "mesh",
        label: "Mesh (optional)",
        status: settings.mesh.enabled ? (meshReady ? "complete" : "needs_input") : "optional",
        detail: settings.mesh.enabled
          ? `Mesh ${settings.mesh.mode} on node ${settings.mesh.nodeId}.`
          : "Mesh disabled. You can enable this later.",
      },
    ];

    return {
      completed: Boolean(this.onboardingMarker.completedAt),
      completedAt: this.onboardingMarker.completedAt,
      completedBy: this.onboardingMarker.completedBy,
      checklist,
      settings: {
        defaultToolProfile: settings.defaultToolProfile,
        budgetMode: settings.budgetMode,
        networkAllowlist: settings.networkAllowlist,
        auth: settings.auth,
        llm: {
          activeProviderId: settings.llm.activeProviderId,
          activeModel: settings.llm.activeModel,
          providers: settings.llm.providers.map((provider) => ({
            providerId: provider.providerId,
            label: provider.label,
            baseUrl: provider.baseUrl,
            defaultModel: provider.defaultModel,
            hasApiKey: provider.hasApiKey,
            apiKeySource: provider.apiKeySource,
          })),
        },
        mesh: settings.mesh,
      },
    };
  }

  public bootstrapOnboarding(input: OnboardingBootstrapInput): OnboardingBootstrapResult {
    this.updateSettings({
      defaultToolProfile: input.defaultToolProfile,
      budgetMode: input.budgetMode,
      networkAllowlist: input.networkAllowlist,
      auth: input.auth,
      llm: input.llm,
      mesh: input.mesh,
    });

    if (input.markComplete) {
      this.markOnboardingComplete(input.completedBy ?? "operator");
    }

    return {
      state: this.getOnboardingState(),
      appliedAt: new Date().toISOString(),
    };
  }

  public markOnboardingComplete(completedBy = "operator"): OnboardingState {
    this.onboardingMarker = {
      completedAt: new Date().toISOString(),
      completedBy: completedBy.trim() || "operator",
    };
    this.persistOnboardingMarker();
    this.publishRealtime("system", "onboarding", {
      type: "onboarding_completed",
      completedAt: this.onboardingMarker.completedAt,
      completedBy: this.onboardingMarker.completedBy,
    });
    return this.getOnboardingState();
  }

  public updateSettings(input: {
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
  }): RuntimeSettings {
    let persistAssistant = false;
    let persistToolPolicy = false;
    let persistBudgets = false;

    if (input.defaultToolProfile) {
      if (!Object.prototype.hasOwnProperty.call(this.config.toolPolicy.profiles, input.defaultToolProfile)) {
        throw new Error(`Unknown tool profile: ${input.defaultToolProfile}`);
      }
      this.config.toolPolicy.tools.profile = input.defaultToolProfile as typeof this.config.toolPolicy.tools.profile;
      this.config.assistant.defaultToolProfile = input.defaultToolProfile;
      persistAssistant = true;
      persistToolPolicy = true;
    }

    if (input.budgetMode) {
      this.config.budgets.mode = input.budgetMode;
      persistBudgets = true;
    }

    if (input.networkAllowlist) {
      this.config.toolPolicy.sandbox.networkAllowlist = input.networkAllowlist
        .map((host) => host.trim())
        .filter(Boolean);
      persistToolPolicy = true;
    }

    if (input.auth) {
      this.updateAuthSettings(input.auth);
      persistAssistant = true;
    }

    if (input.memory) {
      if (input.memory.enabled !== undefined) {
        this.config.assistant.memory.enabled = input.memory.enabled;
      }
      if (input.memory.qmdEnabled !== undefined) {
        this.config.assistant.memory.qmd.enabled = input.memory.qmdEnabled;
      }
      if (input.memory.qmdApplyToChat !== undefined) {
        this.config.assistant.memory.qmd.applyToChat = input.memory.qmdApplyToChat;
      }
      if (input.memory.qmdApplyToOrchestration !== undefined) {
        this.config.assistant.memory.qmd.applyToOrchestration = input.memory.qmdApplyToOrchestration;
      }
      if (input.memory.qmdMaxContextTokens !== undefined) {
        this.config.assistant.memory.qmd.maxContextTokens = Math.max(100, input.memory.qmdMaxContextTokens);
      }
      if (input.memory.qmdMinPromptChars !== undefined) {
        this.config.assistant.memory.qmd.minPromptChars = Math.max(0, input.memory.qmdMinPromptChars);
      }
      if (input.memory.qmdCacheTtlSeconds !== undefined) {
        this.config.assistant.memory.qmd.cacheTtlSeconds = Math.max(10, input.memory.qmdCacheTtlSeconds);
      }
      if (input.memory.qmdDistillerProviderId !== undefined) {
        this.config.assistant.memory.qmd.distiller.providerId = input.memory.qmdDistillerProviderId.trim() || undefined;
      }
      if (input.memory.qmdDistillerModel !== undefined) {
        this.config.assistant.memory.qmd.distiller.model = input.memory.qmdDistillerModel.trim() || undefined;
      }
      persistAssistant = true;
    }

    if (input.mesh) {
      if (input.mesh.enabled !== undefined) {
        this.config.assistant.mesh.enabled = input.mesh.enabled;
      }
      if (input.mesh.mode) {
        this.config.assistant.mesh.mode = input.mesh.mode;
      }
      if (input.mesh.nodeId !== undefined) {
        const trimmed = input.mesh.nodeId.trim();
        if (!trimmed) {
          throw new Error("mesh.nodeId cannot be empty");
        }
        this.config.assistant.mesh.nodeId = trimmed;
      }
      if (input.mesh.mdns !== undefined) {
        this.config.assistant.mesh.discovery.mdns = input.mesh.mdns;
      }
      if (input.mesh.staticPeers) {
        this.config.assistant.mesh.discovery.staticPeers = input.mesh.staticPeers
          .map((peer) => peer.trim())
          .filter(Boolean);
      }
      if (input.mesh.requireMtls !== undefined) {
        this.config.assistant.mesh.security.requireMtls = input.mesh.requireMtls;
      }
      if (input.mesh.tailnetEnabled !== undefined) {
        this.config.assistant.mesh.security.tailnet.enabled = input.mesh.tailnetEnabled;
      }

      this.meshService.updateOptions({
        enabled: this.config.assistant.mesh.enabled,
        mode: this.config.assistant.mesh.mode,
        localNodeId: this.config.assistant.mesh.nodeId,
        localNodeLabel: this.config.assistant.mesh.label,
        advertiseAddress: this.config.assistant.mesh.advertiseAddress,
        requireMtls: this.config.assistant.mesh.security.requireMtls,
        tailnetEnabled: this.config.assistant.mesh.security.tailnet.enabled,
        joinToken: process.env[this.config.assistant.mesh.security.joinTokenEnv],
        defaultLeaseTtlSeconds: this.config.assistant.mesh.leases.ttlSeconds,
      });
      persistAssistant = true;
    }

    if (input.npu) {
      if (input.npu.enabled !== undefined) {
        this.config.assistant.npu.enabled = input.npu.enabled;
      }
      if (input.npu.autoStart !== undefined) {
        this.config.assistant.npu.autoStart = input.npu.autoStart;
      }
      if (input.npu.sidecarUrl !== undefined) {
        const trimmed = input.npu.sidecarUrl.trim();
        if (!trimmed) {
          throw new Error("npu.sidecarUrl cannot be empty");
        }
        this.config.assistant.npu.sidecar.baseUrl = trimmed;
      }

      this.npuSidecar.updateConfig(this.config.assistant.npu);
      if (!this.config.assistant.npu.enabled) {
        void this.npuSidecar.stop("disabled");
      } else if (this.config.assistant.npu.autoStart) {
        void this.npuSidecar.start("config_autostart").catch(() => {
          // surfaced via status + realtime events
        });
      }
      persistAssistant = true;
    }

    if (input.llm) {
      this.llmService.updateRuntimeConfig(input.llm);
      this.persistLlmConfig();
    }

    if (persistToolPolicy) {
      this.persistToolPolicyConfig();
    }
    if (persistBudgets) {
      this.persistBudgetsConfig();
    }
    if (persistAssistant) {
      this.persistAssistantConfig();
    }

    return this.getSettings();
  }

  public getAuthRuntimeSettings(): AuthRuntimeSettings {
    return {
      mode: this.config.assistant.auth.mode,
      allowLoopbackBypass: this.config.assistant.auth.allowLoopbackBypass,
      tokenConfigured: Boolean(this.config.assistant.auth.token.value?.trim()),
      basicConfigured: Boolean(
        this.config.assistant.auth.basic.username?.trim()
        && this.config.assistant.auth.basic.password?.trim(),
      ),
    };
  }

  public updateAuthSettings(input: AuthSettingsUpdateInput): AuthRuntimeSettings {
    if (input.mode) {
      this.config.assistant.auth.mode = input.mode;
    }
    if (input.allowLoopbackBypass !== undefined) {
      this.config.assistant.auth.allowLoopbackBypass = input.allowLoopbackBypass;
    }
    if (input.token !== undefined) {
      this.config.assistant.auth.token.value = input.token.trim() || undefined;
    }
    if (input.basicUsername !== undefined) {
      this.config.assistant.auth.basic.username = input.basicUsername.trim() || undefined;
    }
    if (input.basicPassword !== undefined) {
      this.config.assistant.auth.basic.password = input.basicPassword.trim() || undefined;
    }
    return this.getAuthRuntimeSettings();
  }

  public listIntegrationCatalog(kind?: IntegrationKind): IntegrationCatalogEntry[] {
    if (!kind) {
      return INTEGRATION_CATALOG;
    }
    return INTEGRATION_CATALOG.filter((entry) => entry.kind === kind);
  }

  public listIntegrationConnections(kind?: IntegrationKind, limit = 300): IntegrationConnection[] {
    return this.storage.integrationConnections.list(kind, limit);
  }

  public createIntegrationConnection(input: IntegrationConnectionCreateInput): IntegrationConnection {
    const catalog = INTEGRATION_CATALOG.find((entry) => entry.catalogId === input.catalogId);
    if (!catalog) {
      throw new Error(`Unknown integration catalog id: ${input.catalogId}`);
    }

    const created = this.storage.integrationConnections.create({
      ...input,
      catalogId: catalog.catalogId,
      kind: catalog.kind,
      key: catalog.key,
      label: input.label?.trim() || catalog.label,
    });

    this.publishRealtime("system", "integrations", {
      type: "integration_connection_created",
      connectionId: created.connectionId,
      catalogId: created.catalogId,
      kind: created.kind,
      key: created.key,
      enabled: created.enabled,
      status: created.status,
    });

    return created;
  }

  public updateIntegrationConnection(connectionId: string, input: IntegrationConnectionUpdateInput): IntegrationConnection {
    const updated = this.storage.integrationConnections.update(connectionId, input);
    this.publishRealtime("system", "integrations", {
      type: "integration_connection_updated",
      connectionId: updated.connectionId,
      enabled: updated.enabled,
      status: updated.status,
      lastError: updated.lastError,
    });
    return updated;
  }

  public deleteIntegrationConnection(connectionId: string): boolean {
    const deleted = this.storage.integrationConnections.delete(connectionId);
    if (deleted) {
      this.publishRealtime("system", "integrations", {
        type: "integration_connection_deleted",
        connectionId,
      });
    }
    return deleted;
  }

  public getMeshStatus(): MeshStatus {
    return this.meshService.status();
  }

  public listMeshNodes(limit = 200): MeshNodeRecord[] {
    return this.meshService.listNodes(limit);
  }

  public meshJoin(input: MeshJoinRequest): MeshJoinResult {
    const joined = this.meshService.join(input);
    this.publishRealtime("system", "mesh", {
      type: "mesh_node_joined",
      nodeId: joined.node.nodeId,
      transport: joined.node.transport,
      advertiseAddress: joined.node.advertiseAddress,
    });
    return joined;
  }

  public acquireMeshLease(input: MeshLeaseAcquireRequest): MeshLeaseRecord {
    const lease = this.meshService.acquireLease(input);
    this.publishRealtime("system", "mesh", {
      type: "mesh_lease_acquired",
      leaseKey: lease.leaseKey,
      holderNodeId: lease.holderNodeId,
      fencingToken: lease.fencingToken,
      expiresAt: lease.expiresAt,
    });
    return lease;
  }

  public renewMeshLease(input: MeshLeaseRenewRequest): MeshLeaseRecord {
    const lease = this.meshService.renewLease(input);
    this.publishRealtime("system", "mesh", {
      type: "mesh_lease_renewed",
      leaseKey: lease.leaseKey,
      holderNodeId: lease.holderNodeId,
      fencingToken: lease.fencingToken,
      expiresAt: lease.expiresAt,
    });
    return lease;
  }

  public releaseMeshLease(input: MeshLeaseReleaseRequest): { released: boolean } {
    const result = this.meshService.releaseLease(input);
    this.publishRealtime("system", "mesh", {
      type: "mesh_lease_released",
      leaseKey: input.leaseKey,
      holderNodeId: input.holderNodeId,
      fencingToken: input.fencingToken,
      released: result.released,
    });
    return result;
  }

  public claimMeshSessionOwner(sessionId: string, input: MeshSessionClaimRequest): MeshSessionOwnerRecord {
    const owner = this.meshService.claimSessionOwner(sessionId, input);
    this.publishRealtime("system", "mesh", {
      type: "mesh_session_claimed",
      sessionId,
      ownerNodeId: owner.ownerNodeId,
      epoch: owner.epoch,
    });
    return owner;
  }

  public getMeshSessionOwner(sessionId: string): MeshSessionOwnerRecord {
    return this.meshService.getSessionOwner(sessionId);
  }

  public ingestMeshReplicationEvent(input: MeshReplicationIngestRequest): MeshReplicationRecord {
    const event = this.meshService.ingestReplicationEvent(input);
    this.publishRealtime("system", "mesh", {
      type: "mesh_replication_event",
      replicationId: event.replicationId,
      sourceNodeId: event.sourceNodeId,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
    });
    return event;
  }

  public listMeshLeases(limit = 200): MeshLeaseRecord[] {
    return this.meshService.listLeases(limit);
  }

  public listMeshSessionOwners(limit = 500): MeshSessionOwnerRecord[] {
    return this.meshService.listSessionOwners(limit);
  }

  public listMeshReplicationEvents(limit = 200, cursor?: string): MeshReplicationRecord[] {
    return this.meshService.listReplicationEvents(limit, cursor);
  }

  public listMeshReplicationOffsets(limit = 500): MeshReplicationOffset[] {
    return this.meshService.listReplicationOffsets(limit);
  }

  public async ingestChannelMessage(
    channel: string,
    idempotencyKey: string,
    input: ChannelInboundMessageInput,
  ): Promise<GatewayEventResult> {
    const payload: GatewayEventInput = {
      eventId: input.eventId ?? `channel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      route: {
        channel,
        account: input.account,
        peer: input.peer,
        room: input.room,
        threadId: input.threadId,
      },
      actor: {
        type: input.actorType ?? "user",
        id: input.actorId,
      },
      message: {
        role: input.role ?? "user",
        content: input.content,
      },
      usage: input.usage,
    };

    const result = await this.ingestEvent(idempotencyKey, payload);
    this.publishRealtime("system", "channels", {
      type: "channel_message_ingested",
      channel,
      eventId: payload.eventId,
      sessionId: result.session.sessionId,
      account: input.account,
      actorId: input.actorId,
    });
    return result;
  }

  public listLlmProviders(): LlmRuntimeConfig["providers"] {
    return this.llmService.listProviders();
  }

  public getLlmConfig(): LlmRuntimeConfig {
    return this.llmService.getRuntimeConfig();
  }

  public updateLlmConfig(input: {
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
  }): LlmRuntimeConfig {
    const updated = this.llmService.updateRuntimeConfig(input);
    this.persistLlmConfig();
    return updated;
  }

  public async listLlmModels(providerId?: string): Promise<LlmModelRecord[]> {
    return this.llmService.listModels(providerId);
  }

  public getNpuStatus(): NpuRuntimeStatus {
    return this.npuSidecar.getStatus();
  }

  public async startNpuRuntime(): Promise<NpuRuntimeStatus> {
    const status = await this.npuSidecar.start("api");
    this.publishRealtime("system", "npu", {
      type: "npu_started",
      status,
    });
    return status;
  }

  public async stopNpuRuntime(): Promise<NpuRuntimeStatus> {
    const status = await this.npuSidecar.stop("api");
    this.publishRealtime("system", "npu", {
      type: "npu_stopped",
      status,
    });
    return status;
  }

  public async refreshNpuRuntime(): Promise<NpuRuntimeStatus> {
    const status = await this.npuSidecar.refresh();
    this.publishRealtime("system", "npu", {
      type: "npu_refreshed",
      status,
    });
    return status;
  }

  public async listNpuModels(): Promise<NpuModelManifest[]> {
    return this.npuSidecar.listModels();
  }

  public async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    let response: ChatCompletionResponse;
    let memoryContext: MemoryContextPack | undefined;
    const memoryInput = request.memory;
    const useQmd = (
      this.config.assistant.memory.enabled
      && this.config.assistant.memory.qmd.enabled
      && this.config.assistant.memory.qmd.applyToChat
      && memoryInput?.mode !== "off"
      && (memoryInput?.enabled ?? true)
    );

    if (useQmd) {
      const prompt = extractPromptFromMessages(request.messages);
      if (prompt.trim()) {
        memoryContext = await this.memoryContextService.compose({
          scope: "chat",
          prompt,
          sessionId: memoryInput?.sessionId,
          taskId: memoryInput?.taskId,
          workspace: memoryInput?.workspace,
          maxContextTokens: memoryInput?.maxContextTokens,
          forceRefresh: memoryInput?.forceRefresh,
        });
      }
    }

    const withContext = memoryContext
      ? {
        ...request,
        messages: [
          {
            role: "system" as const,
            content: buildMemoryContextSystemMessage(memoryContext),
          },
          ...request.messages,
        ],
      }
      : request;

    response = await this.llmService.chatCompletions(withContext);
    const runtime = this.llmService.getRuntimeConfig();
    this.publishRealtime("system", "llm", {
      type: "chat_completion",
      providerId: request.providerId ?? runtime.activeProviderId,
      model: request.model ?? runtime.activeModel,
      messageCount: request.messages.length,
      stream: request.stream ?? false,
      memoryContextId: memoryContext?.contextId,
      memoryQmdStatus: memoryContext?.quality.status,
    });

    if (memoryContext) {
      response.memoryContext = {
        contextId: memoryContext.contextId,
        cacheHit: memoryContext.quality.status === "cache_hit",
        originalTokenEstimate: memoryContext.originalTokenEstimate,
        distilledTokenEstimate: memoryContext.distilledTokenEstimate,
        savingsPercent: calculateSavings(
          memoryContext.originalTokenEstimate,
          memoryContext.distilledTokenEstimate,
        ),
        citationsCount: memoryContext.citations.length,
      };
    }
    return response;
  }

  public createOrchestrationPlan(plan: OrchestrationPlan): OrchestrationRun {
    this.storage.orchestration.upsertPlan(plan);
    const run = this.orchestrationEngine.createRun(plan);
    const persisted = this.storage.orchestration.createRun(run);

    this.createCheckpoint({
      runId: persisted.runId,
      planId: persisted.planId,
      checkpointKind: "run_created",
      details: { status: persisted.status },
    });

    this.storage.orchestration.appendRunEvent(persisted.runId, "run.created", {
      status: persisted.status,
    });

    this.publishRealtime("orchestration_event", "orchestration", {
      runId: persisted.runId,
      planId: persisted.planId,
      event: "run_created",
      status: persisted.status,
    });

    return persisted;
  }

  public runOrchestrationPlan(planId: string): OrchestrationRun {
    const plan = this.storage.orchestration.getPlan(planId);
    let run = this.storage.orchestration.findLatestRunByPlan(planId);

    if (!run) {
      run = this.createOrchestrationPlan(plan);
    }

    const started = this.orchestrationEngine.startRun(plan, run);
    const persisted = this.storage.orchestration.updateRun(started);

    this.createCheckpoint({
      runId: persisted.runId,
      planId,
      waveId: persisted.currentWaveId,
      phaseId: persisted.currentPhaseId,
      checkpointKind: "run_started",
      details: {
        status: persisted.status,
      },
    });

    this.storage.orchestration.appendRunEvent(persisted.runId, "run.started", {
      status: persisted.status,
      waveId: persisted.currentWaveId,
      phaseId: persisted.currentPhaseId,
    });

    this.publishRealtime("orchestration_event", "orchestration", {
      runId: persisted.runId,
      planId,
      event: "run_started",
      status: persisted.status,
      waveId: persisted.currentWaveId,
      phaseId: persisted.currentPhaseId,
    });

    if (this.config.assistant.memory.enabled && this.config.assistant.memory.qmd.applyToOrchestration) {
      this.scheduleOrchestrationMemoryContext(plan, persisted);
    }

    return persisted;
  }

  public approvePhase(
    runId: string,
    phaseId: string,
    approvedBy: string,
    costIncrementUsd = 0,
  ): { run: OrchestrationRun; checkpoints: OrchestrationCheckpoint[] } {
    const run = this.storage.orchestration.getRun(runId);
    const plan = this.storage.orchestration.getPlan(run.planId);
    const previousWaveId = run.currentWaveId;

    const next = this.orchestrationEngine.approvePhase(plan, run, phaseId, {
      costIncrementUsd,
    });

    const persisted = this.storage.orchestration.updateRun(next);

    this.createCheckpoint({
      runId,
      planId: plan.planId,
      waveId: previousWaveId,
      phaseId,
      checkpointKind: "phase_approved",
      details: {
        approvedBy,
        status: persisted.status,
        nextWaveId: persisted.currentWaveId,
        nextPhaseId: persisted.currentPhaseId,
      },
    });

    if (previousWaveId !== persisted.currentWaveId && persisted.currentWaveId) {
      this.createCheckpoint({
        runId,
        planId: plan.planId,
        waveId: persisted.currentWaveId,
        phaseId: persisted.currentPhaseId,
        checkpointKind: "wave_advanced",
        details: {
          fromWave: previousWaveId,
          toWave: persisted.currentWaveId,
        },
      });
    }

    if (persisted.status === "completed") {
      this.createCheckpoint({
        runId,
        planId: plan.planId,
        checkpointKind: "run_completed",
        details: {
          totalIterations: persisted.totalIterations,
          totalCostUsd: persisted.totalCostUsd,
        },
      });
    }

    if (persisted.status === "stopped_by_limit") {
      this.createCheckpoint({
        runId,
        planId: plan.planId,
        checkpointKind: "run_stopped",
        details: {
          totalIterations: persisted.totalIterations,
          totalCostUsd: persisted.totalCostUsd,
        },
      });
    }

    this.storage.orchestration.appendRunEvent(runId, "phase.approved", {
      approvedBy,
      phaseId,
      status: persisted.status,
      currentWaveId: persisted.currentWaveId,
      currentPhaseId: persisted.currentPhaseId,
      totalIterations: persisted.totalIterations,
      totalCostUsd: persisted.totalCostUsd,
    });

    this.publishRealtime("orchestration_event", "orchestration", {
      runId,
      planId: plan.planId,
      event: "phase_approved",
      phaseId,
      approvedBy,
      status: persisted.status,
      currentWaveId: persisted.currentWaveId,
      currentPhaseId: persisted.currentPhaseId,
    });

    if (this.config.assistant.memory.enabled && this.config.assistant.memory.qmd.applyToOrchestration) {
      this.scheduleOrchestrationMemoryContext(plan, persisted);
    }

    return {
      run: persisted,
      checkpoints: this.storage.orchestration.listCheckpoints(runId),
    };
  }

  public getRun(runId: string): OrchestrationRun {
    return this.storage.orchestration.getRun(runId);
  }

  public listRunCheckpoints(runId: string): OrchestrationCheckpoint[] {
    return this.storage.orchestration.listCheckpoints(runId);
  }

  public async close(): Promise<void> {
    this.closing = true;
    if (this.backgroundTasks.size > 0) {
      const tasks = [...this.backgroundTasks];
      this.backgroundTasks.clear();
      await Promise.allSettled(tasks);
    }
    await this.npuSidecar.close();
    this.storage.close();
  }

  private publishRealtime(eventType: string, source: string, payload: Record<string, unknown>): RealtimeEvent {
    const event = this.storage.realtimeEvents.append(eventType, source, payload);
    this.realtime.emit("event", event);
    return event;
  }

  private createCheckpoint(input: Omit<OrchestrationCheckpoint, "checkpointId" | "createdAt" | "gitRef">): OrchestrationCheckpoint {
    return this.storage.orchestration.createCheckpoint({
      ...input,
      gitRef: this.getGitHead(),
    });
  }

  private scheduleApprovalExplanation(approval: ApprovalRequest): void {
    if (this.closing) {
      return;
    }

    const task = this.approvalExplainer.explainApproval(approval)
      .catch((error) => {
        if (this.closing) {
          return;
        }
        this.publishRealtime("system", "approvals", {
          type: "approval_explainer_error",
          approvalId: approval.approvalId,
          error: (error as Error).message,
        });
      })
      .finally(() => {
        this.backgroundTasks.delete(task);
      });

    this.backgroundTasks.add(task);
    void task;
  }

  private scheduleApprovalExplanationById(approvalId: string): void {
    if (this.closing) {
      return;
    }
    let approval: ApprovalRequest;
    try {
      approval = this.storage.approvals.get(approvalId);
    } catch {
      return;
    }
    this.scheduleApprovalExplanation(approval);
  }

  private scheduleOrchestrationMemoryContext(plan: OrchestrationPlan, run: OrchestrationRun): void {
    if (this.closing || !run.currentPhaseId) {
      return;
    }
    const phase = findPlanPhase(plan, run.currentPhaseId);
    if (!phase) {
      return;
    }

    const task = this.memoryContextService.compose({
      scope: "orchestration",
      prompt: [
        `Plan goal: ${plan.goal}`,
        `Wave: ${run.currentWaveId ?? "(none)"}`,
        `Phase: ${phase.phaseId}`,
        `Owner: ${phase.ownerAgentId}`,
        `Spec path: ${phase.specPath}`,
        `Loop mode: ${phase.loopMode}`,
      ].join("\n"),
      runId: run.runId,
      phaseId: phase.phaseId,
      workspace: "memory",
    })
      .then((pack) => {
        this.publishRealtime("memory_qmd_generated", "orchestration", {
          runId: run.runId,
          phaseId: phase.phaseId,
          contextId: pack.contextId,
          status: pack.quality.status,
        });
      })
      .catch((error) => {
        this.publishRealtime("memory_qmd_failed", "orchestration", {
          runId: run.runId,
          phaseId: phase.phaseId,
          error: (error as Error).message,
        });
      })
      .finally(() => {
        this.backgroundTasks.delete(task);
      });

    this.backgroundTasks.add(task);
    void task;
  }

  private getGitHead(): string | undefined {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: this.config.rootDir,
        encoding: "utf8",
      }).trim();
    } catch {
      return undefined;
    }
  }

  private buildAgentRuntimeRollups(
    profiles: Pick<AgentProfileRecord, "roleId" | "name" | "aliases">[],
  ): Map<string, { sessionCount: number; activeSessions: number; lastUpdatedAt?: string }> {
    const byRoleId = new Map<string, { sessionCount: number; activeSessions: number; lastUpdatedAt?: string }>();
    const lookup = new Map<string, string>();

    for (const profile of profiles) {
      const roleKey = this.normalizeLookupValue(profile.roleId);
      if (roleKey) {
        lookup.set(roleKey, profile.roleId);
      }
      const nameKey = this.normalizeLookupValue(profile.name);
      if (nameKey) {
        lookup.set(nameKey, profile.roleId);
      }
      for (const alias of profile.aliases) {
        const aliasKey = this.normalizeLookupValue(alias);
        if (aliasKey) {
          lookup.set(aliasKey, profile.roleId);
        }
      }
    }

    const sessions = this.storage.taskSubagents.listAll(5000);
    for (const session of sessions) {
      const roleId = this.inferSessionRoleId(session.agentName, session.agentSessionId, lookup);
      if (!roleId) {
        continue;
      }

      const current = byRoleId.get(roleId) ?? {
        sessionCount: 0,
        activeSessions: 0,
        lastUpdatedAt: undefined as string | undefined,
      };
      current.sessionCount += 1;
      if (session.status === "active") {
        current.activeSessions += 1;
      }
      if (!current.lastUpdatedAt || Date.parse(session.updatedAt) > Date.parse(current.lastUpdatedAt)) {
        current.lastUpdatedAt = session.updatedAt;
      }
      byRoleId.set(roleId, current);
    }

    return byRoleId;
  }

  private inferSessionRoleId(
    agentName: string | undefined,
    agentSessionId: string,
    lookup: Map<string, string>,
  ): string | undefined {
    const directCandidates = [agentName, agentSessionId];
    for (const candidate of directCandidates) {
      if (!candidate) {
        continue;
      }
      const found = lookup.get(this.normalizeLookupValue(candidate));
      if (found) {
        return found;
      }
    }

    const normalizedName = this.normalizeLookupValue(agentName ?? "");
    const normalizedSessionId = this.normalizeLookupValue(agentSessionId);
    for (const [key, roleId] of lookup.entries()) {
      if (!key) {
        continue;
      }
      if (normalizedName.includes(key) || normalizedSessionId.includes(key)) {
        return roleId;
      }
    }

    return undefined;
  }

  private normalizeLookupValue(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  private normalizeRelativePath(inputPath: string): string {
    const normalized = path.normalize(inputPath).replaceAll("\\", "/");
    if (
      !normalized
      || normalized === "."
      || normalized === ".."
      || normalized.startsWith("../")
      || normalized.endsWith("/..")
      || normalized.includes("/../")
    ) {
      throw new Error(`Invalid relative path: ${inputPath}`);
    }
    if (path.isAbsolute(normalized)) {
      throw new Error(`Absolute paths are not allowed: ${inputPath}`);
    }
    return normalized;
  }

  private isAuthConfiguredForMode(auth: RuntimeSettings["auth"]): boolean {
    if (auth.mode === "none") {
      return true;
    }
    if (auth.mode === "token") {
      return auth.tokenConfigured;
    }
    return auth.basicConfigured;
  }

  private isProviderLikelyLocal(baseUrl: string): boolean {
    try {
      const parsed = new URL(baseUrl);
      const host = parsed.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "::1";
    } catch {
      return false;
    }
  }

  private async loadOnboardingMarker(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.onboardingMarkerPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.onboardingMarker = {};
        return;
      }
      throw error;
    }

    try {
      const parsed = JSON.parse(raw) as { completedAt?: string; completedBy?: string };
      this.onboardingMarker = {
        completedAt: parsed.completedAt?.trim() || undefined,
        completedBy: parsed.completedBy?.trim() || undefined,
      };
    } catch {
      this.onboardingMarker = {};
    }
  }

  private persistOnboardingMarker(): void {
    fsSync.mkdirSync(path.dirname(this.onboardingMarkerPath), { recursive: true });
    fsSync.writeFileSync(this.onboardingMarkerPath, JSON.stringify(this.onboardingMarker, null, 2), "utf8");
  }

  private async loadCronJobsFromConfig(): Promise<void> {
    const filePath = path.join(this.config.rootDir, "config", "cron-jobs.json");
    let raw: string;

    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }

    const parsed = JSON.parse(raw) as { jobs?: CronJobRecord[] } | CronJobRecord[];
    const jobs = Array.isArray(parsed) ? parsed : parsed.jobs ?? [];

    for (const job of jobs) {
      this.storage.cronJobs.upsert(job);
    }
  }

  private persistLlmConfig(): void {
    const filePath = path.join(this.config.rootDir, "config", "llm-providers.json");
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, JSON.stringify(this.llmService.exportConfigFile(), null, 2), "utf8");
  }

  private persistToolPolicyConfig(): void {
    const filePath = path.join(this.config.rootDir, "config", "tool-policy.json");
    const payload = {
      ...this.config.toolPolicy,
      sandbox: {
        ...this.config.toolPolicy.sandbox,
        writeJailRoots: this.config.toolPolicy.sandbox.writeJailRoots.map((root) => this.serializeRootPath(root)),
        readOnlyRoots: this.config.toolPolicy.sandbox.readOnlyRoots.map((root) => this.serializeRootPath(root)),
      },
    };
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  private persistBudgetsConfig(): void {
    const filePath = path.join(this.config.rootDir, "config", "budgets.json");
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, JSON.stringify(this.config.budgets, null, 2), "utf8");
  }

  private persistAssistantConfig(): void {
    const filePath = path.join(this.config.rootDir, "config", "assistant.config.json");
    const payload = {
      environment: this.config.assistant.environment,
      defaultToolProfile: this.config.assistant.defaultToolProfile,
      dataDir: this.config.assistant.dataDir,
      transcriptsDir: this.config.assistant.transcriptsDir,
      auditDir: this.config.assistant.auditDir,
      workspaceDir: this.config.assistant.workspaceDir,
      worktreesDir: this.config.assistant.worktreesDir,
      auth: {
        mode: this.config.assistant.auth.mode,
        allowLoopbackBypass: this.config.assistant.auth.allowLoopbackBypass,
        token: {
          queryParam: this.config.assistant.auth.token.queryParam,
        },
        basic: {},
      },
      approvalExplainer: this.config.assistant.approvalExplainer,
      memory: this.config.assistant.memory,
      mesh: this.config.assistant.mesh,
      npu: this.config.assistant.npu,
      budgets: this.config.assistant.budgets,
    };
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  private serializeRootPath(fullPath: string): string {
    const relative = path.relative(this.config.rootDir, fullPath).replaceAll("\\", "/");
    if (
      relative
      && relative !== "."
      && !relative.startsWith("../")
      && relative !== ".."
      && !path.isAbsolute(relative)
    ) {
      return relative.startsWith("./") ? relative : `./${relative}`;
    }
    return fullPath.replaceAll("\\", "/");
  }
}

function extractPromptFromMessages(messages: ChatCompletionRequest["messages"]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      const text = message.content
        .map((part) => {
          const maybeText = (part as Record<string, unknown>).text;
          return typeof maybeText === "string" ? maybeText : "";
        })
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function buildMemoryContextSystemMessage(pack: MemoryContextPack): string {
  return [
    "Distilled context from GoatCitadel memory:",
    pack.contextText,
    "",
    `ContextId: ${pack.contextId}`,
    `Citations: ${pack.citations.length}`,
  ].join("\n");
}

function calculateSavings(originalTokens: number, distilledTokens: number): number {
  if (originalTokens <= 0) {
    return 0;
  }
  return Number((((originalTokens - distilledTokens) / originalTokens) * 100).toFixed(2));
}

function findPlanPhase(plan: OrchestrationPlan, phaseId: string) {
  for (const wave of plan.waves) {
    const phase = wave.phases.find((item) => item.phaseId === phaseId);
    if (phase) {
      return phase;
    }
  }
  return undefined;
}

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html" || ext === ".htm") {
    return "text/html";
  }
  if (ext === ".css") {
    return "text/css";
  }
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".ts" || ext === ".tsx") {
    return "application/javascript";
  }
  if (ext === ".json") {
    return "application/json";
  }
  if (ext === ".md") {
    return "text/markdown";
  }
  if (ext === ".txt" || ext === ".log") {
    return "text/plain";
  }
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".gif") {
    return "image/gif";
  }
  if (ext === ".pdf") {
    return "application/pdf";
  }
  return "application/octet-stream";
}

function isTextContentType(contentType: string): boolean {
  return (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/javascript" ||
    contentType === "text/markdown"
  );
}

const FILE_TEMPLATES: FileTemplateRecord[] = [
  {
    templateId: "artifact-report",
    title: "Artifact Report",
    description: "Structured report artifact with purpose, evidence, and next actions.",
    defaultPath: "artifacts/artifact-report-{date}.md",
    body: [
      "# Artifact Report ({date})",
      "",
      "## What this is",
      "- Brief description of the artifact and why it exists.",
      "",
      "## Inputs",
      "- Source files:",
      "- Data references:",
      "",
      "## Output",
      "- Result summary:",
      "",
      "## Verification",
      "- Checks performed:",
      "- Remaining risk:",
      "",
      "## Next actions",
      "- [ ] Follow-up item 1",
      "- [ ] Follow-up item 2",
      "",
    ].join("\n"),
  },
  {
    templateId: "research-brief",
    title: "Research Brief",
    description: "Quick research summary with findings and citations.",
    defaultPath: "docs/research-brief-{date}.md",
    body: [
      "# Research Brief ({date})",
      "",
      "## Question",
      "- What are we trying to answer?",
      "",
      "## Findings",
      "1. Finding one",
      "2. Finding two",
      "",
      "## Sources",
      "- Source 1:",
      "- Source 2:",
      "",
      "## Recommendation",
      "- Proposed decision and tradeoff.",
      "",
    ].join("\n"),
  },
  {
    templateId: "release-note",
    title: "Release Note",
    description: "Release note draft with highlights, fixes, and known issues.",
    defaultPath: "docs/release-notes-{date}.md",
    body: [
      "# Release Notes ({date})",
      "",
      "## Highlights",
      "- Feature 1",
      "- Feature 2",
      "",
      "## Fixes",
      "- Fix 1",
      "- Fix 2",
      "",
      "## Known Issues",
      "- Issue 1",
      "",
      "## Upgrade Notes",
      "- Migration/compatibility guidance.",
      "",
    ].join("\n"),
  },
  {
    templateId: "bug-report",
    title: "Bug Report",
    description: "Bug template for reproducible issue reports.",
    defaultPath: "artifacts/bug-report-{date}.md",
    body: [
      "# Bug Report ({date})",
      "",
      "## Summary",
      "- One-line description.",
      "",
      "## Repro Steps",
      "1. Step one",
      "2. Step two",
      "",
      "## Expected",
      "- What should happen.",
      "",
      "## Actual",
      "- What happened instead.",
      "",
      "## Environment",
      "- OS:",
      "- Branch/commit:",
      "- Config context:",
      "",
    ].join("\n"),
  },
];

async function walkFiles(
  rootDir: string,
  currentDir: string,
  out: MemoryFileEntry[],
  maxItems: number,
): Promise<void> {
  if (out.length >= maxItems) {
    return;
  }

  let entries: Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string }>;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= maxItems) {
      return;
    }

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(rootDir, fullPath, out, maxItems);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const stat = await fs.stat(fullPath);
    out.push({
      relativePath: path.relative(rootDir, fullPath).replaceAll("\\", "/"),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
}
