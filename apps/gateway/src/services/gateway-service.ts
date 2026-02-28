import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { EventIngestService } from "@personal-ai/gateway-core";
import { OrchestrationEngine } from "@personal-ai/orchestration";
import { ToolPolicyEngine, assertExistingPathRealpathAllowed, assertWritePathInJail } from "@personal-ai/policy-engine";
import { SkillsService } from "@personal-ai/skills";
import { Storage } from "@personal-ai/storage";
import type {
  ApprovalCreateInput,
  ApprovalReplayEvent,
  ApprovalRequest,
  ApprovalResolveInput,
  CronJobRecord,
  DashboardState,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GatewayEventInput,
  GatewayEventResult,
  LlmModelRecord,
  LlmRuntimeConfig,
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
} from "@personal-ai/contracts";
import type { GatewayRuntimeConfig } from "../config.js";
import type { OrchestrationCheckpoint } from "@personal-ai/storage";
import { LlmService } from "./llm-service.js";
import { ApprovalExplainerService } from "./approval-explainer-service.js";

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

export interface MemoryFileEntry {
  relativePath: string;
  size: number;
  modifiedAt: string;
}

export interface AgentSummary {
  agentId: string;
  name: string;
  status: "active" | "idle";
  sessionCount: number;
  activeSessions: number;
  lastUpdatedAt?: string;
}

export interface RuntimeSettings {
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
  llm: LlmRuntimeConfig;
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
  private readonly approvalExplainer: ApprovalExplainerService;
  private readonly realtime = new EventEmitter();

  public constructor(private readonly config: GatewayRuntimeConfig) {
    this.storage = new Storage({
      dbPath: config.dbPath,
      transcriptsDir: path.resolve(config.rootDir, config.assistant.transcriptsDir),
      auditDir: path.resolve(config.rootDir, config.assistant.auditDir),
    });

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
    await this.skillsService.reload();
    await this.loadCronJobsFromConfig();
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

  public listTasks(limit: number, status?: TaskStatus, cursor?: string): TaskRecord[] {
    return this.storage.tasks.list({
      status,
      limit,
      cursor,
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

  public deleteTask(taskId: string): boolean {
    const deleted = this.storage.tasks.delete(taskId);
    if (deleted) {
      this.publishRealtime("task_deleted", "tasks", { taskId });
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

  public updateTaskSubagent(openclawSessionId: string, input: TaskSubagentUpdateInput): TaskSubagentSession {
    const updated = this.storage.taskSubagents.updateByOpenclawSessionId(openclawSessionId, {
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

  public listAgents(limit = 500): AgentSummary[] {
    const sessions = this.storage.taskSubagents.listAll(limit);
    const byAgent = new Map<string, AgentSummary>();

    for (const session of sessions) {
      const agentId = session.agentName?.trim() || session.openclawSessionId;
      const current = byAgent.get(agentId) ?? {
        agentId,
        name: session.agentName?.trim() || session.openclawSessionId,
        status: "idle",
        sessionCount: 0,
        activeSessions: 0,
        lastUpdatedAt: undefined,
      };

      current.sessionCount += 1;
      if (session.status === "active") {
        current.activeSessions += 1;
      }

      current.status = current.activeSessions > 0 ? "active" : "idle";

      if (!current.lastUpdatedAt || Date.parse(session.updatedAt) > Date.parse(current.lastUpdatedAt)) {
        current.lastUpdatedAt = session.updatedAt;
      }

      byAgent.set(agentId, current);
    }

    return Array.from(byAgent.values()).sort((a, b) => {
      const left = Date.parse(a.lastUpdatedAt ?? "1970-01-01T00:00:00.000Z");
      const right = Date.parse(b.lastUpdatedAt ?? "1970-01-01T00:00:00.000Z");
      return right - left;
    });
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
      llm: this.llmService.getRuntimeConfig(),
    };
  }

  public updateSettings(input: {
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
  }): RuntimeSettings {
    if (input.defaultToolProfile) {
      if (!Object.prototype.hasOwnProperty.call(this.config.toolPolicy.profiles, input.defaultToolProfile)) {
        throw new Error(`Unknown tool profile: ${input.defaultToolProfile}`);
      }
      this.config.toolPolicy.tools.profile = input.defaultToolProfile as typeof this.config.toolPolicy.tools.profile;
      this.config.assistant.defaultToolProfile = input.defaultToolProfile;
    }

    if (input.budgetMode) {
      this.config.budgets.mode = input.budgetMode;
    }

    if (input.networkAllowlist) {
      this.config.toolPolicy.sandbox.networkAllowlist = input.networkAllowlist;
    }

    if (input.llm) {
      this.llmService.updateRuntimeConfig(input.llm);
      this.persistLlmConfig();
    }

    return this.getSettings();
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

  public async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await this.llmService.chatCompletions(request);
    const runtime = this.llmService.getRuntimeConfig();
    this.publishRealtime("system", "llm", {
      type: "chat_completion",
      providerId: request.providerId ?? runtime.activeProviderId,
      model: request.model ?? runtime.activeModel,
      messageCount: request.messages.length,
      stream: request.stream ?? false,
    });
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

  public close(): void {
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
    void this.approvalExplainer.explainApproval(approval).catch((error) => {
      this.publishRealtime("system", "approvals", {
        type: "approval_explainer_error",
        approvalId: approval.approvalId,
        error: (error as Error).message,
      });
    });
  }

  private scheduleApprovalExplanationById(approvalId: string): void {
    let approval: ApprovalRequest;
    try {
      approval = this.storage.approvals.get(approvalId);
    } catch {
      return;
    }
    this.scheduleApprovalExplanation(approval);
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

  private normalizeRelativePath(inputPath: string): string {
    const normalized = path.normalize(inputPath).replaceAll("\\", "/");
    if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
      throw new Error(`Invalid relative path: ${inputPath}`);
    }
    if (path.isAbsolute(normalized)) {
      throw new Error(`Absolute paths are not allowed: ${inputPath}`);
    }
    return normalized;
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
