import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
  BackupCreateResponse,
  BackupManifestFileRecord,
  BackupManifestRecord,
  AuthRuntimeSettings,
  AuthSettingsUpdateInput,
  ApprovalCreateInput,
  ApprovalReplayEvent,
  ApprovalRequest,
  ApprovalResolveInput,
  CalendarCreateEventInput,
  CalendarListQuery,
  ChannelSendInput,
  ChannelInboundMessageInput,
  ChatAttachmentRecord,
  ChatAttachmentMediaType,
  ChatAttachmentPreviewResponse,
  ChatInputPart,
  ChatMessageRecord,
  ChatProjectRecord,
  ChatSendMessageResponse,
  ChatSessionBindingRecord,
  ChatSessionRecord,
  ChatStreamChunk,
  DocsIngestInput,
  EmbeddingIndexInput,
  EmbeddingQueryInput,
  MemoryContextComposeRequest,
  MemoryContextPack,
  MemoryQmdStatsResponse,
  MemorySearchQuery,
  MemoryWriteInput,
  CronJobRecord,
  DashboardState,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GatewayEventInput,
  GatewayEventResult,
  IntegrationCatalogEntry,
  IntegrationFormSchema,
  IntegrationPluginInstallInput,
  IntegrationPluginRecord,
  IntegrationConnection,
  IntegrationConnectionCreateInput,
  IntegrationConnectionUpdateInput,
  IntegrationKind,
  McpInvokeRequest,
  McpInvokeResponse,
  McpOAuthStartResponse,
  McpServerCreateInput,
  McpServerRecord,
  McpServerUpdateInput,
  McpToolRecord,
  MediaCreateJobRequest,
  MediaJobRecord,
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
  RetentionPolicy,
  RetentionPruneResult,
  SessionMeta,
  TranscriptEvent,
  SessionSummary,
  SessionTimelineItem,
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
  ToolAccessEvaluateRequest,
  ToolAccessEvaluateResponse,
  ToolCatalogEntry,
  ToolGrantCreateInput,
  ToolGrantRecord,
  TaskUpdateInput,
  GmailReadQuery,
  GmailSendInput,
  ToolInvokeRequest,
  ToolInvokeResult,
  VoiceStatus,
  VoiceTalkSessionRecord,
  VoiceTranscribeResponse,
} from "@goatcitadel/contracts";
import { BUILTIN_AGENT_PROFILES } from "@goatcitadel/contracts";
import type { GatewayRuntimeConfig } from "../config.js";
import type { OrchestrationCheckpoint } from "@goatcitadel/storage";
import { LlmService } from "./llm-service.js";
import { ApprovalExplainerService } from "./approval-explainer-service.js";
import { getIntegrationFormSchema, INTEGRATION_CATALOG } from "./integration-catalog.js";
import { MemoryContextService } from "./memory-context-service.js";
import { NpuSidecarService } from "./npu-sidecar-service.js";
import { SecretStoreService } from "./secret-store-service.js";

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

const RETENTION_SETTINGS_KEY = "retention_policy";
const MCP_SERVERS_SETTING_KEY = "mcp_servers_v1";
const MCP_TOOLS_SETTING_KEY = "mcp_tools_v1";
const INTEGRATION_PLUGINS_SETTING_KEY = "integration_plugins_v1";
const DAEMON_LOG_TAIL_SETTING_KEY = "daemon_log_tail_v1";
const VOICE_STATUS_SETTING_KEY = "voice_status_v1";
const VOICE_WAKE_STATUS_SETTING_KEY = "voice_wake_status_v1";
const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  realtimeEventsDays: 14,
  backupsKeep: 20,
  transcriptsDays: undefined,
  auditDays: undefined,
};

const DEFAULT_VOICE_PROVIDER: VoiceTranscribeResponse["provider"] = "whisper.cpp";
const CORE_CHANNEL_KEYS = new Set([
  "discord",
  "slack",
  "telegram",
  "whatsapp",
  "matrix",
  "google-chat",
  "mattermost",
  "webchat",
]);

interface ChatSessionListQuery {
  scope?: "mission" | "external" | "all";
  projectId?: string;
  q?: string;
  view?: "active" | "archived" | "all";
  limit?: number;
  cursor?: string;
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
    const secretStore = new SecretStoreService();
    this.skillsService = new SkillsService([
      { source: "extra", dir: path.join(config.rootDir, "skills", "extra") },
      { source: "bundled", dir: path.join(config.rootDir, "skills", "bundled") },
      { source: "managed", dir: path.join(config.rootDir, ".assistant", "skills") },
      { source: "workspace", dir: path.join(config.rootDir, "skills", "workspace") },
    ]);
    this.orchestrationEngine = new OrchestrationEngine();
    this.llmService = new LlmService(config.llm, process.env, {
      networkAllowlist: config.toolPolicy.sandbox.networkAllowlist,
      secretStore,
    });
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

  public async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    const session = this.getSession(sessionId);
    const events = await this.readTranscriptOrEmpty(sessionId);
    const latest = events.at(-1);
    const countsByType: Record<string, number> = {};
    let lastMessagePreview: string | undefined;

    for (const event of events) {
      countsByType[event.type] = (countsByType[event.type] ?? 0) + 1;
      if (event.type === "message.user" || event.type === "message.assistant") {
        const content = this.extractMessagePreview(event.payload);
        if (content) {
          lastMessagePreview = content;
        }
      }
    }

    return {
      session,
      transcriptEventCount: events.length,
      latestEventAt: latest?.timestamp,
      latestEventType: latest?.type,
      lastMessagePreview,
      countsByType,
    };
  }

  public async listSessionTimeline(sessionId: string, limit = 200): Promise<SessionTimelineItem[]> {
    const events = await this.readTranscriptOrEmpty(sessionId);
    const bounded = events.slice(-Math.max(1, Math.min(limit, 1000)));
    return bounded.reverse().map((event) => ({
      eventId: event.eventId,
      timestamp: event.timestamp,
      type: event.type,
      actorType: event.actorType,
      actorId: event.actorId,
      preview: this.extractMessagePreview(event.payload),
      payload: event.payload,
      tokenInput: event.tokenInput,
      tokenOutput: event.tokenOutput,
      costUsd: event.costUsd,
    }));
  }

  public listChatProjects(view: "active" | "archived" | "all" = "active", limit = 300): ChatProjectRecord[] {
    return this.storage.chatProjects.list(view, limit);
  }

  public createChatProject(input: {
    name: string;
    description?: string;
    workspacePath: string;
    color?: string;
  }): ChatProjectRecord {
    const created = this.storage.chatProjects.create(input);
    this.publishRealtime("system", "chat", {
      type: "chat_project_created",
      projectId: created.projectId,
      name: created.name,
    });
    return created;
  }

  public updateChatProject(projectId: string, input: {
    name?: string;
    description?: string;
    workspacePath?: string;
    color?: string;
  }): ChatProjectRecord {
    const updated = this.storage.chatProjects.update(projectId, input);
    this.publishRealtime("system", "chat", {
      type: "chat_project_updated",
      projectId: updated.projectId,
      name: updated.name,
    });
    return updated;
  }

  public archiveChatProject(projectId: string): ChatProjectRecord {
    const archived = this.storage.chatProjects.archive(projectId);
    this.publishRealtime("system", "chat", {
      type: "chat_project_archived",
      projectId: archived.projectId,
    });
    return archived;
  }

  public restoreChatProject(projectId: string): ChatProjectRecord {
    const restored = this.storage.chatProjects.restore(projectId);
    this.publishRealtime("system", "chat", {
      type: "chat_project_restored",
      projectId: restored.projectId,
    });
    return restored;
  }

  public hardDeleteChatProject(projectId: string): boolean {
    const deleted = this.storage.chatProjects.hardDelete(projectId);
    if (deleted) {
      this.publishRealtime("system", "chat", {
        type: "chat_project_deleted",
        projectId,
      });
    }
    return deleted;
  }

  public listChatSessions(query: ChatSessionListQuery = {}): ChatSessionRecord[] {
    const scope = query.scope ?? "all";
    const view = query.view ?? "active";
    const limit = Math.max(1, Math.min(1000, Math.floor(query.limit ?? 200)));
    const allSessions = this.storage.sessions.list(20000);
    const projects = this.storage.chatProjects.list("all", 2000);
    const projectById = new Map(projects.map((project) => [project.projectId, project]));
    const sessionIds = allSessions.map((session) => session.sessionId);
    const metaBySessionId = this.storage.chatSessionMeta.listBySessionIds(sessionIds);
    const projectLinkBySessionId = this.storage.chatSessionProjects.listBySessionIds(sessionIds);

    let records = allSessions.map((session) => {
      const meta = metaBySessionId.get(session.sessionId) ?? this.storage.chatSessionMeta.ensure(session.sessionId);
      const link = projectLinkBySessionId.get(session.sessionId);
      const project = link ? projectById.get(link.projectId) : undefined;
      return toChatSessionRecord(session, meta, project);
    });

    if (scope !== "all") {
      records = records.filter((record) => record.scope === scope);
    }
    if (view !== "all") {
      records = records.filter((record) => record.lifecycleStatus === view);
    }
    if (query.projectId) {
      records = records.filter((record) => record.projectId === query.projectId);
    }
    if (query.q?.trim()) {
      const q = query.q.trim().toLowerCase();
      records = records.filter((record) => {
        const haystack = [
          record.title ?? "",
          record.sessionKey,
          record.channel,
          record.account,
          record.projectName ?? "",
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }

    records.sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      const byUpdated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (byUpdated !== 0) {
        return byUpdated;
      }
      return right.sessionId.localeCompare(left.sessionId);
    });

    if (query.cursor) {
      const [cursorUpdatedAt, cursorSessionId] = query.cursor.split("|");
      if (cursorUpdatedAt && cursorSessionId) {
        records = records.filter((record) => {
          if (record.updatedAt < cursorUpdatedAt) {
            return true;
          }
          if (record.updatedAt > cursorUpdatedAt) {
            return false;
          }
          return record.sessionId < cursorSessionId;
        });
      }
    }

    return records.slice(0, limit);
  }

  public createChatSession(input: {
    title?: string;
    projectId?: string;
  }): ChatSessionRecord {
    const peer = `chat_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const route = {
      channel: "mission",
      account: "operator",
      peer,
    };
    const resolution = {
      kind: "dm" as const,
      sessionKey: `${route.channel}:${route.account}:${route.peer}`,
      sessionId: `sess_${createHash("sha256").update(`${route.channel}:${route.account}:${route.peer}`).digest("hex").slice(0, 24)}`,
    };
    const now = new Date().toISOString();
    this.storage.sessions.upsert({
      sessionId: resolution.sessionId,
      sessionKey: resolution.sessionKey,
      kind: resolution.kind,
      channel: route.channel,
      account: route.account,
      displayName: input.title?.trim() || undefined,
      timestamp: now,
    });
    this.storage.chatSessionMeta.ensure(resolution.sessionId, now);
    if (input.title?.trim()) {
      this.storage.chatSessionMeta.patch(resolution.sessionId, {
        title: input.title.trim(),
      }, now);
    }
    this.storage.chatSessionBindings.upsert({
      sessionId: resolution.sessionId,
      transport: "llm",
      writable: true,
    }, now);
    if (input.projectId) {
      this.storage.chatProjects.get(input.projectId);
      this.storage.chatSessionProjects.assign(resolution.sessionId, input.projectId, now);
    }
    const created = this.requireChatSession(resolution.sessionId);
    if (!created) {
      throw new Error(`Failed to create chat session ${resolution.sessionId}`);
    }
    this.publishRealtime("chat_session_updated", "chat", {
      type: "chat_session_created",
      sessionId: created.sessionId,
      sessionKey: created.sessionKey,
    });
    return created;
  }

  public updateChatSession(sessionId: string, input: { title?: string }): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, {
      title: input.title,
    });
    return this.requireChatSession(sessionId);
  }

  public pinChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, { pinned: true });
    return this.requireChatSession(sessionId);
  }

  public unpinChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, { pinned: false });
    return this.requireChatSession(sessionId);
  }

  public archiveChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, {
      lifecycleStatus: "archived",
      archivedAt: new Date().toISOString(),
    });
    return this.requireChatSession(sessionId);
  }

  public restoreChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, {
      lifecycleStatus: "active",
      archivedAt: undefined,
    });
    return this.requireChatSession(sessionId);
  }

  public assignChatSessionProject(sessionId: string, projectId?: string): ChatSessionRecord {
    this.getSession(sessionId);
    if (!projectId) {
      this.storage.chatSessionProjects.unassign(sessionId);
      return this.requireChatSession(sessionId);
    }
    this.storage.chatProjects.get(projectId);
    this.storage.chatSessionProjects.assign(sessionId, projectId);
    return this.requireChatSession(sessionId);
  }

  public getChatSessionBinding(sessionId: string): ChatSessionBindingRecord | undefined {
    this.getSession(sessionId);
    return this.storage.chatSessionBindings.get(sessionId);
  }

  public setChatSessionBinding(input: {
    sessionId: string;
    transport: "llm" | "integration";
    connectionId?: string;
    target?: string;
    writable?: boolean;
  }): ChatSessionBindingRecord {
    this.getSession(input.sessionId);
    if (input.transport === "integration") {
      if (!input.connectionId?.trim() || !input.target?.trim()) {
        throw new Error("connectionId and target are required for integration transport");
      }
      this.storage.integrationConnections.get(input.connectionId);
    }
    const binding = this.storage.chatSessionBindings.upsert({
      sessionId: input.sessionId,
      transport: input.transport,
      connectionId: input.connectionId?.trim() || undefined,
      target: input.target?.trim() || undefined,
      writable: input.writable,
    });
    this.publishRealtime("chat_session_updated", "chat", {
      type: "chat_session_binding_updated",
      sessionId: input.sessionId,
      transport: binding.transport,
    });
    return binding;
  }

  public async listChatMessages(sessionId: string, limit = 200, cursor?: string): Promise<ChatMessageRecord[]> {
    this.getSession(sessionId);
    const events = await this.readTranscriptOrEmpty(sessionId);
    let messages = events
      .filter((event) => event.type === "message.user" || event.type === "message.assistant")
      .map((event) => toChatMessageRecord(event))
      .filter((message): message is ChatMessageRecord => Boolean(message));

    if (cursor) {
      const index = messages.findIndex((message) => message.messageId === cursor);
      if (index >= 0) {
        messages = messages.slice(0, index);
      }
    }

    return messages.slice(-Math.max(1, Math.min(limit, 1000)));
  }

  public async sendChatMessage(
    sessionId: string,
    input: {
      content: string;
      parts?: ChatInputPart[];
      providerId?: string;
      model?: string;
      useMemory?: boolean;
      attachments?: string[];
    },
  ): Promise<ChatSendMessageResponse> {
    const session = this.getSession(sessionId);
    const sessionMeta = this.storage.chatSessionMeta.ensure(sessionId);
    if (sessionMeta.lifecycleStatus === "archived") {
      throw new Error(`Session ${sessionId} is archived`);
    }
    const content = input.content.trim();
    if (!content) {
      throw new Error("content is required");
    }

    const attachments = this.storage.chatAttachments.listByIds(input.attachments ?? []);
    const inputParts = normalizeChatInputParts(content, input.parts, attachments);
    const route = this.routeFromSession(session);
    const userEventId = randomUUID();
    const userPayload = {
      eventId: userEventId,
      route,
      actor: {
        type: "user" as const,
        id: "operator",
      },
      message: {
        role: "user" as const,
        content,
        parts: inputParts,
        attachments: attachments.map((item) => ({
          attachmentId: item.attachmentId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
        })),
      },
    };
    await this.ingestEvent(randomUUID(), userPayload);

    const userMessage: ChatMessageRecord = {
      messageId: userEventId,
      sessionId,
      role: "user",
      actorType: "user",
      actorId: "operator",
      content,
      timestamp: new Date().toISOString(),
      attachments: attachments.map((item) => ({
        attachmentId: item.attachmentId,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
      })),
    };

    const binding = this.storage.chatSessionBindings.get(sessionId)
      ?? (session.channel === "mission"
        ? this.storage.chatSessionBindings.upsert({
          sessionId,
          transport: "llm",
          writable: true,
        })
        : undefined);

    if (!binding) {
      throw new Error("External sessions require writeback binding before send");
    }
    if (!binding.writable) {
      throw new Error("Session binding is not writable");
    }

    if (binding.transport === "integration") {
      if (!binding.connectionId || !binding.target) {
        throw new Error("Integration binding is missing connectionId or target");
      }
      const delivery = await this.commsSend({
        connectionId: binding.connectionId,
        target: binding.target,
        message: content,
        sessionId,
        agentId: "operator",
      });
      const assistantContent = typeof delivery === "object"
        ? `Delivered via integration ${binding.connectionId} to ${binding.target}.`
        : "Delivered via integration.";
      const assistantEventId = randomUUID();
      await this.ingestEvent(randomUUID(), {
        eventId: assistantEventId,
        route,
        actor: {
          type: "system",
          id: "integration",
        },
        message: {
          role: "assistant",
          content: assistantContent,
        },
      });
      const assistantMessage: ChatMessageRecord = {
        messageId: assistantEventId,
        sessionId,
        role: "assistant",
        actorType: "system",
        actorId: "integration",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      };
      this.publishRealtime("chat_message", "chat", {
        sessionId,
        role: "assistant",
        preview: assistantContent.slice(0, 160),
      });
      return {
        sessionId,
        userMessage,
        assistantMessage,
        transport: "integration",
      };
    }

    const history = await this.buildLlmMessagesFromTranscript(sessionId, {
      providerId: input.providerId,
      model: input.model,
    });
    const response = await this.createChatCompletion({
      providerId: input.providerId,
      model: input.model,
      messages: history,
      memory: {
        enabled: input.useMemory ?? true,
        mode: input.useMemory === false ? "off" : "qmd",
        sessionId,
      },
      stream: false,
    });
    const assistantContent = extractAssistantContent(response);
    const usage = parseUsageFromChatResponse(response);
    const assistantEventId = randomUUID();
    await this.ingestEvent(randomUUID(), {
      eventId: assistantEventId,
      route,
      actor: {
        type: "agent",
        id: "assistant",
      },
      message: {
        role: "assistant",
        content: assistantContent,
      },
      usage,
    });
    const assistantMessage: ChatMessageRecord = {
      messageId: assistantEventId,
      sessionId,
      role: "assistant",
      actorType: "agent",
      actorId: "assistant",
      content: assistantContent,
      timestamp: new Date().toISOString(),
      tokenInput: usage.inputTokens,
      tokenOutput: usage.outputTokens,
      costUsd: usage.costUsd,
    };
    this.publishRealtime("chat_message", "chat", {
      sessionId,
      role: "assistant",
      preview: assistantContent.slice(0, 160),
      model: response.model,
    });
    return {
      sessionId,
      userMessage,
      assistantMessage,
      transport: "llm",
      model: response.model ? String(response.model) : undefined,
    };
  }

  public async *sendChatMessageStream(
    sessionId: string,
    input: {
      content: string;
      parts?: ChatInputPart[];
      providerId?: string;
      model?: string;
      useMemory?: boolean;
      attachments?: string[];
    },
  ): AsyncGenerator<ChatStreamChunk> {
    const started = new Date().toISOString();
    yield {
      type: "message_start",
      sessionId,
      messageId: `msg_${randomUUID()}`,
    };
    try {
      const response = await this.sendChatMessage(sessionId, input);
      const assistant = response.assistantMessage;
      const messageId = assistant?.messageId ?? `msg_${randomUUID()}`;
      const content = assistant?.content ?? "";
      const chunks = splitIntoChunks(content, 120);
      for (const delta of chunks) {
        yield {
          type: "delta",
          sessionId,
          messageId,
          delta,
        };
      }
      yield {
        type: "usage",
        sessionId,
        messageId,
        usage: {
          inputTokens: assistant?.tokenInput,
          outputTokens: assistant?.tokenOutput,
          costUsd: assistant?.costUsd,
        },
      };
      yield {
        type: "message_done",
        sessionId,
        messageId,
        content,
      };
      yield {
        type: "done",
        sessionId,
      };
    } catch (error) {
      yield {
        type: "error",
        sessionId,
        error: (error as Error).message,
      };
      yield {
        type: "done",
        sessionId,
        content: started,
      };
    }
  }

  public async uploadChatAttachment(input: {
    sessionId: string;
    projectId?: string;
    fileName: string;
    mimeType: string;
    bytesBase64: string;
  }): Promise<ChatAttachmentRecord> {
    this.getSession(input.sessionId);
    const fileName = sanitizeAttachmentFileName(input.fileName);
    const mimeType = input.mimeType.trim() || "application/octet-stream";
    const bytes = Buffer.from(input.bytesBase64, "base64");
    if (bytes.length === 0) {
      throw new Error("Attachment payload is empty");
    }
    if (bytes.length > 20 * 1024 * 1024) {
      throw new Error("Attachment exceeds 20MB upload limit");
    }

    let projectId = input.projectId;
    if (!projectId) {
      projectId = this.storage.chatSessionProjects.get(input.sessionId)?.projectId;
    }
    const project = projectId ? this.storage.chatProjects.get(projectId) : undefined;
    const rootPath = project?.workspacePath ?? "chat/default";
    const stamp = new Date();
    const year = String(stamp.getUTCFullYear());
    const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
    const attachmentId = randomUUID();
    const storageRelPath = path.posix.join(
      rootPath,
      "attachments",
      year,
      month,
      `${attachmentId}-${fileName}`,
    );
    const fullPath = path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, storageRelPath);
    assertWritePathInJail(fullPath, this.config.toolPolicy.sandbox.writeJailRoots);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, bytes);

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const { extractStatus, extractPreview } = extractAttachmentPreview(bytes, mimeType, fileName);
    const mediaType = detectAttachmentMediaType(mimeType);
    const analysisStatus = inferAttachmentAnalysisStatus(mediaType, extractStatus);
    const created = this.storage.chatAttachments.create({
      attachmentId,
      sessionId: input.sessionId,
      projectId,
      fileName,
      mimeType,
      mediaType,
      sizeBytes: bytes.length,
      sha256,
      storageRelPath,
      extractStatus,
      extractPreview,
      analysisStatus,
      ocrText: mediaType === "text" ? extractPreview : undefined,
    });
    if (analysisStatus === "queued") {
      this.createMediaJob({
        type: mediaType === "image"
          ? "ocr"
          : mediaType === "audio"
            ? "audio_transcribe"
            : mediaType === "video"
              ? "video_transcribe"
              : "analyze",
        sessionId: input.sessionId,
        attachmentId,
      });
    }
    this.publishRealtime("chat_message", "chat", {
      type: "chat_attachment_uploaded",
      sessionId: input.sessionId,
      attachmentId,
      fileName,
      sizeBytes: bytes.length,
    });
    return created;
  }

  public getChatAttachment(attachmentId: string): ChatAttachmentRecord {
    return this.storage.chatAttachments.get(attachmentId);
  }

  public async readChatAttachmentContent(attachmentId: string): Promise<{
    record: ChatAttachmentRecord;
    fullPath: string;
    bytes: Buffer;
  }> {
    const record = this.storage.chatAttachments.get(attachmentId);
    const fullPath = path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, record.storageRelPath);
    assertExistingPathRealpathAllowed(
      fullPath,
      this.config.toolPolicy.sandbox.writeJailRoots,
      this.config.toolPolicy.sandbox.readOnlyRoots,
    );
    const bytes = await fs.readFile(fullPath);
    return {
      record,
      fullPath,
      bytes,
    };
  }

  public async listBackups(limit = 50): Promise<BackupManifestRecord[]> {
    const backupDir = this.getBackupDirectory();
    const entries = await listFilesSafe(backupDir);
    const manifests: BackupManifestRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".backup")) {
        continue;
      }
      const manifestPath = path.join(backupDir, entry.name, "manifest.json");
      try {
        const raw = await fs.readFile(manifestPath, "utf8");
        const parsed = JSON.parse(raw) as BackupManifestRecord;
        manifests.push(parsed);
      } catch {
        // skip invalid backup folders
      }
    }
    manifests.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return manifests.slice(0, Math.max(1, Math.min(limit, 500)));
  }

  public async createBackup(input?: {
    name?: string;
    outputPath?: string;
  }): Promise<BackupCreateResponse> {
    const now = new Date();
    const timestamp = formatBackupTimestamp(now);
    const backupId = sanitizeBackupName(input?.name) ?? `backup-${timestamp}-${randomUUID().slice(0, 8)}`;
    const backupDir = this.getBackupDirectory();
    const outputPath = input?.outputPath
      ? path.resolve(this.config.rootDir, input.outputPath)
      : path.join(backupDir, `${backupId}.backup`);
    const tempDir = `${outputPath}.tmp-${randomUUID().slice(0, 8)}`;
    const payloadDir = path.join(tempDir, "payload");

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(payloadDir, { recursive: true });

    const includePaths = this.buildBackupIncludePaths();
    for (const includePath of includePaths) {
      const source = path.resolve(this.config.rootDir, includePath);
      const target = path.join(payloadDir, includePath);
      await copyPathIfExists(source, target);
    }

    const files = await collectBackupFileRecords(payloadDir);
    const manifest: BackupManifestRecord = {
      backupId,
      createdAt: now.toISOString(),
      appVersion: readAppVersion(),
      gitRef: readGitRef(this.config.rootDir),
      rootDir: this.config.rootDir,
      files,
    };
    const manifestPath = path.join(tempDir, "manifest.json");
    const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
    await fs.writeFile(manifestPath, manifestRaw, "utf8");

    await fs.rm(outputPath, { recursive: true, force: true });
    await fs.rename(tempDir, outputPath);

    return {
      backupId,
      outputPath,
      bytes: files.reduce((sum, item) => sum + item.sizeBytes, 0) + Buffer.byteLength(manifestRaw, "utf8"),
      manifest,
    };
  }

  public async restoreBackup(input: {
    filePath: string;
    confirm: boolean;
  }): Promise<{ restored: boolean; backupId?: string; filesRestored: number }> {
    if (!input.confirm) {
      throw new Error("Backup restore requires explicit confirm=true");
    }

    const backupPath = path.resolve(this.config.rootDir, input.filePath);
    const manifestPath = path.join(backupPath, "manifest.json");
    const payloadDir = path.join(backupPath, "payload");
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as BackupManifestRecord;

    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error("Backup manifest has no files");
    }

    for (const file of manifest.files) {
      const source = path.join(payloadDir, file.path);
      const bytes = await fs.readFile(source);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== file.sha256) {
        throw new Error(`Backup checksum mismatch for ${file.path}`);
      }
    }

    for (const file of manifest.files) {
      const source = path.join(payloadDir, file.path);
      const target = path.resolve(this.config.rootDir, file.path);
      ensurePathWithinRoot(target, this.config.rootDir);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
    }

    return {
      restored: true,
      backupId: manifest.backupId,
      filesRestored: manifest.files.length,
    };
  }

  public getRetentionPolicy(): RetentionPolicy {
    const stored = this.storage.systemSettings.get<RetentionPolicy>(RETENTION_SETTINGS_KEY)?.value;
    return normalizeRetentionPolicy(stored ?? DEFAULT_RETENTION_POLICY);
  }

  public updateRetentionPolicy(input: Partial<RetentionPolicy>): RetentionPolicy {
    const current = this.getRetentionPolicy();
    const merged = normalizeRetentionPolicy({
      ...current,
      ...input,
    });
    this.storage.systemSettings.set(RETENTION_SETTINGS_KEY, merged);
    return merged;
  }

  public async pruneRetention(options: { dryRun?: boolean } = {}): Promise<RetentionPruneResult> {
    const policy = this.getRetentionPolicy();
    const dryRun = options.dryRun ?? true;
    const startedAt = new Date().toISOString();
    let removedRealtimeEvents = 0;
    let removedBackupFiles = 0;
    let removedTranscriptFiles = 0;
    let removedAuditFiles = 0;
    let reclaimedBytes = 0;

    const realtimeCutoff = new Date(Date.now() - policy.realtimeEventsDays * 24 * 60 * 60 * 1000).toISOString();
    const realtimeCountRow = this.storage.db.prepare(
      "SELECT COUNT(*) AS count FROM realtime_events WHERE created_at < ?",
    ).get(realtimeCutoff) as { count: number } | undefined;
    removedRealtimeEvents = Number(realtimeCountRow?.count ?? 0);
    if (!dryRun && removedRealtimeEvents > 0) {
      this.storage.realtimeEvents.pruneOlderThan(realtimeCutoff);
    }

    const backupDir = this.getBackupDirectory();
    const backupEntries = await listFilesSafe(backupDir);
    const sortedBackups = backupEntries
      .filter((entry) => entry.isFile())
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    const removableBackups = sortedBackups.slice(Math.max(0, policy.backupsKeep));
    removedBackupFiles = removableBackups.length;
    reclaimedBytes += removableBackups.reduce((sum, file) => sum + file.size, 0);
    if (!dryRun) {
      for (const file of removableBackups) {
        await fs.rm(path.join(backupDir, file.name), { force: true });
      }
    }

    if (policy.transcriptsDays !== undefined) {
      const transcriptsDir = path.resolve(this.config.rootDir, this.config.assistant.transcriptsDir);
      const cutoff = Date.now() - policy.transcriptsDays * 24 * 60 * 60 * 1000;
      const pruned = await pruneFilesOlderThan(transcriptsDir, cutoff, dryRun);
      removedTranscriptFiles = pruned.files;
      reclaimedBytes += pruned.bytes;
    }

    if (policy.auditDays !== undefined) {
      const auditDir = path.resolve(this.config.rootDir, this.config.assistant.auditDir);
      const cutoff = Date.now() - policy.auditDays * 24 * 60 * 60 * 1000;
      const pruned = await pruneFilesOlderThan(auditDir, cutoff, dryRun);
      removedAuditFiles = pruned.files;
      reclaimedBytes += pruned.bytes;
    }

    return {
      applied: !dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      removedRealtimeEvents,
      removedBackupFiles,
      removedTranscriptFiles,
      removedAuditFiles,
      reclaimedBytes,
    };
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

  public listToolCatalog(): ToolCatalogEntry[] {
    return this.policyEngine.listCatalog();
  }

  public evaluateToolAccess(input: ToolAccessEvaluateRequest): ToolAccessEvaluateResponse {
    return this.policyEngine.evaluateAccess(input);
  }

  public listToolGrants(
    scope?: "global" | "session" | "agent" | "task",
    scopeRef?: string,
    limit = 200,
  ): ToolGrantRecord[] {
    return this.policyEngine.listGrants(scope, scopeRef, limit);
  }

  public createToolGrant(input: ToolGrantCreateInput): ToolGrantRecord {
    const grant = this.policyEngine.createGrant(input);
    this.publishRealtime("system", "tools", {
      type: "tool_grant_created",
      grantId: grant.grantId,
      toolPattern: grant.toolPattern,
      decision: grant.decision,
      scope: grant.scope,
      scopeRef: grant.scopeRef,
      expiresAt: grant.expiresAt,
    });
    return grant;
  }

  public revokeToolGrant(grantId: string): boolean {
    const revoked = this.policyEngine.revokeGrant(grantId);
    if (revoked) {
      this.publishRealtime("system", "tools", {
        type: "tool_grant_revoked",
        grantId,
      });
    }
    return revoked;
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

  public async listWorkspacePathSuggestions(root = ".", limit = 150): Promise<string[]> {
    const maxItems = Math.max(limit * 3, 200);
    const files = await this.listWorkspaceFiles(root, maxItems);
    const suggestions = new Set<string>();

    const normalizedRoot = root === "." ? "" : this.normalizeRelativePath(root);
    if (normalizedRoot) {
      suggestions.add(normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`);
    } else {
      suggestions.add("memory/");
      suggestions.add("notes/");
      suggestions.add("artifacts/");
      suggestions.add("docs/");
      suggestions.add("workspace/");
    }

    for (const file of files) {
      suggestions.add(file.relativePath);
      const dir = path.posix.dirname(file.relativePath);
      if (dir && dir !== ".") {
        suggestions.add(dir.endsWith("/") ? dir : `${dir}/`);
      }
      if (suggestions.size >= limit * 4) {
        break;
      }
    }

    return [...suggestions].slice(0, limit);
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
      llm: this.llmService.getRuntimeConfig({
        includeKeychainForActiveProvider: true,
        useCache: true,
      }),
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
      this.llmService.updateNetworkAllowlist(this.config.toolPolicy.sandbox.networkAllowlist);
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
    const pluginIds = new Set(this.readIntegrationPlugins().map((item) => item.pluginId));
    const mapped = INTEGRATION_CATALOG.map((entry) => {
      let maturity = entry.maturity;
      if (entry.kind === "channel") {
        if (CORE_CHANNEL_KEYS.has(entry.key)) {
          maturity = entry.maturity === "planned" ? "native" : entry.maturity;
        } else if (entry.maturity === "planned") {
          maturity = pluginIds.size > 0 ? "plugin" : "disabled";
        }
      }
      if (entry.maturity === "planned" && pluginIds.has(entry.key)) {
        maturity = "plugin";
      }
      return {
        ...entry,
        maturity,
      };
    });
    if (!kind) {
      return mapped;
    }
    return mapped.filter((entry) => entry.kind === kind);
  }

  public getIntegrationFormSchema(catalogId: string): IntegrationFormSchema {
    const schema = getIntegrationFormSchema(catalogId);
    if (!schema) {
      throw new Error(`Unknown integration catalog id: ${catalogId}`);
    }
    return schema;
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

  public listIntegrationPlugins(): IntegrationPluginRecord[] {
    return this.readIntegrationPlugins();
  }

  public installIntegrationPlugin(input: IntegrationPluginInstallInput): IntegrationPluginRecord {
    const now = new Date().toISOString();
    const plugins = this.readIntegrationPlugins();
    const nextId = sanitizePluginId(input.pluginId ?? input.source);
    const existing = plugins.find((item) => item.pluginId === nextId);
    if (existing) {
      const updated: IntegrationPluginRecord = {
        ...existing,
        updatedAt: now,
      };
      this.writeIntegrationPlugins(plugins.map((item) => item.pluginId === nextId ? updated : item));
      return updated;
    }

    const created: IntegrationPluginRecord = {
      pluginId: nextId,
      label: toTitleCase(nextId),
      version: "0.1.0",
      description: `Installed from ${input.source}`,
      enabled: true,
      installedAt: now,
      updatedAt: now,
      capabilities: ["channel.adapter"],
    };
    this.writeIntegrationPlugins([created, ...plugins]);
    this.publishRealtime("system", "integrations", {
      type: "integration_plugin_installed",
      pluginId: created.pluginId,
      source: input.source,
    });
    return created;
  }

  public setIntegrationPluginEnabled(pluginId: string, enabled: boolean): IntegrationPluginRecord {
    const now = new Date().toISOString();
    const plugins = this.readIntegrationPlugins();
    const current = plugins.find((item) => item.pluginId === pluginId);
    if (!current) {
      throw new Error(`Unknown integration plugin: ${pluginId}`);
    }
    const updated: IntegrationPluginRecord = {
      ...current,
      enabled,
      updatedAt: now,
    };
    this.writeIntegrationPlugins(plugins.map((item) => item.pluginId === pluginId ? updated : item));
    this.publishRealtime("system", "integrations", {
      type: enabled ? "integration_plugin_enabled" : "integration_plugin_disabled",
      pluginId,
    });
    return updated;
  }

  public listMcpServers(): McpServerRecord[] {
    return this.readMcpServers();
  }

  public createMcpServer(input: McpServerCreateInput): McpServerRecord {
    const now = new Date().toISOString();
    const created: McpServerRecord = {
      serverId: randomUUID(),
      label: input.label.trim(),
      transport: input.transport,
      command: input.command?.trim() || undefined,
      args: input.args?.map((item) => item.trim()).filter(Boolean),
      url: input.url?.trim() || undefined,
      authType: input.authType ?? "none",
      enabled: input.enabled ?? true,
      status: "disconnected",
      createdAt: now,
      updatedAt: now,
    };
    const servers = [created, ...this.readMcpServers()];
    this.writeMcpServers(servers);
    this.publishRealtime("system", "mcp", {
      type: "mcp_server_created",
      serverId: created.serverId,
      transport: created.transport,
    });
    return created;
  }

  public updateMcpServer(serverId: string, input: McpServerUpdateInput): McpServerRecord {
    const now = new Date().toISOString();
    let updated: McpServerRecord | undefined;
    const servers = this.readMcpServers().map((item) => {
      if (item.serverId !== serverId) {
        return item;
      }
      updated = {
        ...item,
        label: input.label?.trim() || item.label,
        command: input.command === undefined ? item.command : (input.command.trim() || undefined),
        args: input.args === undefined ? item.args : input.args.map((entry) => entry.trim()).filter(Boolean),
        url: input.url === undefined ? item.url : (input.url.trim() || undefined),
        authType: input.authType ?? item.authType,
        enabled: input.enabled ?? item.enabled,
        updatedAt: now,
      };
      return updated;
    });
    if (!updated) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }
    this.writeMcpServers(servers);
    return updated;
  }

  public deleteMcpServer(serverId: string): { deleted: boolean } {
    const previous = this.readMcpServers();
    const next = previous.filter((item) => item.serverId !== serverId);
    const deleted = next.length !== previous.length;
    if (deleted) {
      this.writeMcpServers(next);
      this.writeMcpTools(this.readMcpTools().filter((tool) => tool.serverId !== serverId));
      this.publishRealtime("system", "mcp", {
        type: "mcp_server_deleted",
        serverId,
      });
    }
    return { deleted };
  }

  public connectMcpServer(serverId: string): McpServerRecord {
    const connected = this.patchMcpServerState(serverId, {
      status: "connected",
      lastConnectedAt: new Date().toISOString(),
      lastError: undefined,
    });
    const tools = this.readMcpTools();
    if (!tools.some((item) => item.serverId === serverId)) {
      this.writeMcpTools([
        ...tools,
        {
          serverId,
          toolName: "search",
          description: "Search tool exposed by MCP server.",
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
        {
          serverId,
          toolName: "fetch",
          description: "Fetch structured resource from MCP server.",
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
      ]);
    }
    return connected;
  }

  public disconnectMcpServer(serverId: string): McpServerRecord {
    return this.patchMcpServerState(serverId, {
      status: "disconnected",
    });
  }

  public startMcpOAuth(serverId: string): McpOAuthStartResponse {
    const server = this.requireMcpServer(serverId);
    const state = randomUUID();
    const callback = encodeURIComponent("http://127.0.0.1:8787/api/v1/mcp/oauth/callback");
    const authorizeUrl = `${server.url ?? "https://example-mcp-provider.local/oauth/authorize"}?state=${encodeURIComponent(state)}&redirect_uri=${callback}`;
    const authRows = this.readMcpAuthState();
    authRows[serverId] = {
      ...(authRows[serverId] ?? {}),
      oauthState: state,
      updatedAt: new Date().toISOString(),
    };
    this.writeMcpAuthState(authRows);
    return { authorizeUrl, state };
  }

  public completeMcpOAuth(serverId: string, code: string, state?: string): McpServerRecord {
    const authRows = this.readMcpAuthState();
    const authRow = authRows[serverId];
    if (!authRow) {
      throw new Error("No OAuth handshake in progress for this server.");
    }
    if (state && authRow.oauthState && authRow.oauthState !== state) {
      throw new Error("OAuth state mismatch.");
    }
    authRows[serverId] = {
      ...authRow,
      accessTokenRef: `keychain:goatcitadel:mcp:${serverId}:access-token`,
      refreshTokenRef: `keychain:goatcitadel:mcp:${serverId}:refresh-token`,
      oauthState: undefined,
      updatedAt: new Date().toISOString(),
      lastCodePreview: code.slice(0, 8),
    };
    this.writeMcpAuthState(authRows);
    return this.connectMcpServer(serverId);
  }

  public listMcpTools(serverId: string): McpToolRecord[] {
    this.requireMcpServer(serverId);
    return this.readMcpTools()
      .filter((item) => item.serverId === serverId)
      .sort((left, right) => left.toolName.localeCompare(right.toolName));
  }

  public invokeMcpTool(input: McpInvokeRequest): McpInvokeResponse {
    const server = this.requireMcpServer(input.serverId);
    if (!server.enabled || server.status !== "connected") {
      return {
        ok: false,
        error: "MCP server is not connected.",
      };
    }
    const tools = this.listMcpTools(input.serverId);
    const tool = tools.find((item) => item.toolName === input.toolName && item.enabled);
    if (!tool) {
      return {
        ok: false,
        error: `MCP tool ${input.toolName} is not enabled on server ${input.serverId}.`,
      };
    }
    this.publishRealtime("tool_invoked", "mcp", {
      type: "mcp_tool_invoked",
      serverId: input.serverId,
      toolName: input.toolName,
      sessionId: input.sessionId,
      taskId: input.taskId,
    });
    return {
      ok: true,
      output: {
        serverId: input.serverId,
        toolName: input.toolName,
        arguments: input.arguments ?? {},
        message: "MCP invocation recorded. Runtime adapter wiring is plugin-dependent.",
      },
    };
  }

  public createMediaJob(input: MediaCreateJobRequest): MediaJobRecord {
    const now = new Date().toISOString();
    const jobId = randomUUID();
    this.storage.db.prepare(`
      INSERT INTO media_jobs (
        job_id, session_id, attachment_id, job_type, status, input_json, output_json, error, created_at, updated_at, completed_at
      ) VALUES (
        @jobId, @sessionId, @attachmentId, @jobType, @status, @inputJson, NULL, NULL, @createdAt, @updatedAt, NULL
      )
    `).run({
      jobId,
      sessionId: input.sessionId ?? null,
      attachmentId: input.attachmentId ?? null,
      jobType: input.type,
      status: "queued",
      inputJson: input.input ? JSON.stringify(input.input) : null,
      createdAt: now,
      updatedAt: now,
    });
    const created = this.getMediaJob(jobId);
    this.processMediaJob(jobId);
    return created;
  }

  public getMediaJob(jobId: string): MediaJobRecord {
    const row = this.storage.db.prepare(`
      SELECT * FROM media_jobs
      WHERE job_id = ?
    `).get(jobId) as MediaJobRow | undefined;
    if (!row) {
      throw new Error(`Unknown media job: ${jobId}`);
    }
    return mapMediaJobRow(row);
  }

  public listMediaJobs(sessionId?: string): MediaJobRecord[] {
    const rows = this.storage.db.prepare(`
      SELECT * FROM media_jobs
      WHERE (@sessionId IS NULL OR session_id = @sessionId)
      ORDER BY created_at DESC
      LIMIT 500
    `).all({
      sessionId: sessionId ?? null,
    }) as unknown as MediaJobRow[];
    return rows.map(mapMediaJobRow);
  }

  public getChatAttachmentPreview(attachmentId: string): ChatAttachmentPreviewResponse {
    const record = this.getChatAttachment(attachmentId);
    return {
      attachmentId: record.attachmentId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      mediaType: record.mediaType ?? detectAttachmentMediaType(record.mimeType),
      thumbnailRelPath: record.thumbnailRelPath,
      extractPreview: record.extractPreview,
      ocrText: record.ocrText,
      transcriptText: record.transcriptText,
      analysisStatus: record.analysisStatus === "pending"
        ? "queued"
        : (record.analysisStatus ?? "queued"),
    };
  }

  public async transcribeVoice(input: {
    bytesBase64: string;
    mimeType?: string;
    language?: string;
  }): Promise<VoiceTranscribeResponse> {
    const bytes = Buffer.from(input.bytesBase64, "base64");
    if (bytes.length === 0) {
      throw new Error("Audio payload is empty.");
    }
    return this.transcribeAudioBytes(bytes, input.mimeType, input.language);
  }

  public getVoiceStatus(): VoiceStatus {
    const now = new Date().toISOString();
    const stt = this.storage.systemSettings.get<VoiceStatus["stt"]>(VOICE_STATUS_SETTING_KEY)?.value ?? {
      state: "stopped",
      provider: DEFAULT_VOICE_PROVIDER,
      updatedAt: now,
    };
    const wake = this.storage.systemSettings.get<VoiceStatus["wake"]>(VOICE_WAKE_STATUS_SETTING_KEY)?.value ?? {
      enabled: false,
      state: "stopped",
      model: "openwakeword",
      updatedAt: now,
    };
    const talkRecord = this.storage.systemSettings.get<{
      activeSessionId?: string;
      state: "stopped" | "running" | "error";
      mode?: "push_to_talk" | "wake";
      updatedAt: string;
    }>("voice_talk_status_v1")?.value ?? {
      activeSessionId: undefined,
      state: "stopped",
      mode: undefined,
      updatedAt: now,
    };
    return {
      stt,
      talk: talkRecord,
      wake,
    };
  }

  public startTalkSession(input?: { mode?: "push_to_talk" | "wake"; sessionId?: string }): VoiceTalkSessionRecord {
    const now = new Date().toISOString();
    const record: VoiceTalkSessionRecord = {
      talkSessionId: randomUUID(),
      mode: input?.mode ?? "push_to_talk",
      state: "running",
      createdAt: now,
      startedAt: now,
      sessionId: input?.sessionId,
    };
    this.storage.db.prepare(`
      INSERT INTO voice_sessions (
        voice_session_id, talk_session_id, mode, state, session_id, payload_json, created_at, updated_at
      ) VALUES (
        @voiceSessionId, @talkSessionId, @mode, @state, @sessionId, @payloadJson, @createdAt, @updatedAt
      )
    `).run({
      voiceSessionId: record.talkSessionId,
      talkSessionId: record.talkSessionId,
      mode: record.mode,
      state: record.state,
      sessionId: record.sessionId ?? null,
      payloadJson: JSON.stringify(record),
      createdAt: now,
      updatedAt: now,
    });
    this.storage.systemSettings.set("voice_talk_status_v1", {
      activeSessionId: record.talkSessionId,
      state: "running",
      mode: record.mode,
      updatedAt: now,
    });
    this.publishRealtime("system", "voice", {
      type: "voice_talk_started",
      talkSessionId: record.talkSessionId,
      mode: record.mode,
    });
    return record;
  }

  public stopTalkSession(talkSessionId: string): VoiceTalkSessionRecord {
    const now = new Date().toISOString();
    const row = this.storage.db.prepare(`
      SELECT payload_json FROM voice_sessions WHERE talk_session_id = ?
    `).get(talkSessionId) as { payload_json: string } | undefined;
    if (!row) {
      throw new Error(`Unknown talk session: ${talkSessionId}`);
    }
    const payload = safeJsonParse<VoiceTalkSessionRecord>(row.payload_json, {
      talkSessionId,
      mode: "push_to_talk",
      state: "running",
      createdAt: now,
    });
    const stopped: VoiceTalkSessionRecord = {
      ...payload,
      state: "stopped",
      stoppedAt: now,
    };
    this.storage.db.prepare(`
      UPDATE voice_sessions
      SET state = 'stopped', payload_json = @payloadJson, updated_at = @updatedAt
      WHERE talk_session_id = @talkSessionId
    `).run({
      payloadJson: JSON.stringify(stopped),
      updatedAt: now,
      talkSessionId,
    });
    this.storage.systemSettings.set("voice_talk_status_v1", {
      activeSessionId: undefined,
      state: "stopped",
      mode: stopped.mode,
      updatedAt: now,
    });
    this.publishRealtime("system", "voice", {
      type: "voice_talk_stopped",
      talkSessionId,
    });
    return stopped;
  }

  public startVoiceWake(): VoiceStatus["wake"] {
    const status: VoiceStatus["wake"] = {
      enabled: true,
      state: "running",
      model: "openwakeword",
      updatedAt: new Date().toISOString(),
    };
    this.storage.systemSettings.set(VOICE_WAKE_STATUS_SETTING_KEY, status);
    this.publishRealtime("system", "voice", {
      type: "voice_wake_started",
    });
    return status;
  }

  public stopVoiceWake(): VoiceStatus["wake"] {
    const status: VoiceStatus["wake"] = {
      enabled: false,
      state: "stopped",
      model: "openwakeword",
      updatedAt: new Date().toISOString(),
    };
    this.storage.systemSettings.set(VOICE_WAKE_STATUS_SETTING_KEY, status);
    this.publishRealtime("system", "voice", {
      type: "voice_wake_stopped",
    });
    return status;
  }

  public getDaemonStatus(): {
    running: boolean;
    pid: number;
    uptimeSeconds: number;
    host: string;
    state: "running" | "stopped";
    lastCommandAt?: string;
  } {
    const state = this.storage.systemSettings.get<{ state: "running" | "stopped"; lastCommandAt?: string }>("daemon_state_v1")?.value;
    return {
      running: (state?.state ?? "running") === "running",
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      host: os.hostname(),
      state: state?.state ?? "running",
      lastCommandAt: state?.lastCommandAt,
    };
  }

  public daemonStart(): { accepted: boolean; status: ReturnType<GatewayService["getDaemonStatus"]> } {
    const now = new Date().toISOString();
    this.storage.systemSettings.set("daemon_state_v1", {
      state: "running" as const,
      lastCommandAt: now,
    });
    this.appendDaemonLog("start", { at: now });
    return {
      accepted: true,
      status: this.getDaemonStatus(),
    };
  }

  public daemonStop(): { accepted: boolean; status: ReturnType<GatewayService["getDaemonStatus"]> } {
    const now = new Date().toISOString();
    this.storage.systemSettings.set("daemon_state_v1", {
      state: "stopped" as const,
      lastCommandAt: now,
    });
    this.appendDaemonLog("stop", { at: now });
    return {
      accepted: true,
      status: this.getDaemonStatus(),
    };
  }

  public daemonRestart(): { accepted: boolean; status: ReturnType<GatewayService["getDaemonStatus"]> } {
    const now = new Date().toISOString();
    this.storage.systemSettings.set("daemon_state_v1", {
      state: "running" as const,
      lastCommandAt: now,
    });
    this.appendDaemonLog("restart", { at: now });
    return {
      accepted: true,
      status: this.getDaemonStatus(),
    };
  }

  public listDaemonLogs(tail = 200): Array<{ timestamp: string; level: "info" | "warn" | "error"; message: string }> {
    const rows = this.storage.systemSettings.get<Array<{ timestamp: string; level: "info" | "warn" | "error"; message: string }>>(
      DAEMON_LOG_TAIL_SETTING_KEY,
    )?.value ?? [];
    const bounded = Math.max(1, Math.min(2000, Math.floor(tail)));
    return rows.slice(-bounded);
  }

  public async commsSend(input: ChannelSendInput): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "channel.send",
        args: {
          connectionId: input.connectionId,
          target: input.target,
          message: input.message,
          attachments: input.attachments,
        },
        sessionId: input.sessionId ?? "session:operator:comms",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "comms_send",
    );
  }

  public async commsGmailRead(input: GmailReadQuery): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "gmail.read",
        args: {
          connectionId: input.connectionId,
          query: input.query,
          maxResults: input.maxResults,
        },
        sessionId: input.sessionId ?? "session:operator:comms",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "comms_gmail_read",
    );
  }

  public async commsGmailSend(input: GmailSendInput): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "gmail.send",
        args: {
          connectionId: input.connectionId,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml,
        },
        sessionId: input.sessionId ?? "session:operator:comms",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "comms_gmail_send",
    );
  }

  public async commsCalendarList(input: CalendarListQuery): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "calendar.list",
        args: {
          connectionId: input.connectionId,
          calendarId: input.calendarId,
          fromIso: input.fromIso,
          toIso: input.toIso,
          maxResults: input.maxResults,
        },
        sessionId: input.sessionId ?? "session:operator:comms",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "comms_calendar_list",
    );
  }

  public async commsCalendarCreate(input: CalendarCreateEventInput): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "calendar.create_event",
        args: {
          connectionId: input.connectionId,
          calendarId: input.calendarId,
          title: input.title,
          description: input.description,
          startIso: input.startIso,
          endIso: input.endIso,
          attendees: input.attendees,
          timeZone: input.timeZone,
        },
        sessionId: input.sessionId ?? "session:operator:comms",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "comms_calendar_create",
    );
  }

  public async knowledgeMemoryWrite(input: MemoryWriteInput): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "memory.write",
        args: {
          namespace: input.namespace,
          title: input.title,
          content: input.content,
          tags: input.tags,
          metadata: input.metadata,
          source: input.source,
        },
        sessionId: input.sessionId ?? "session:operator:knowledge",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "knowledge_memory_write",
    );
  }

  public async knowledgeMemorySearch(input: MemorySearchQuery): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "memory.search",
        args: {
          namespace: input.namespace,
          query: input.query,
          limit: input.limit,
          filters: input.filters,
        },
        sessionId: input.sessionId ?? "session:operator:knowledge",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "knowledge_memory_search",
    );
  }

  public async knowledgeDocsIngest(input: DocsIngestInput): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "docs.ingest",
        args: {
          sourceType: input.sourceType,
          source: input.source,
          namespace: input.namespace,
          title: input.title,
          chunking: input.chunking,
          metadata: input.metadata,
        },
        sessionId: input.sessionId ?? "session:operator:knowledge",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "knowledge_docs_ingest",
    );
  }

  public async knowledgeEmbeddingsIndex(input: EmbeddingIndexInput): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "embeddings.index",
        args: {
          namespace: input.namespace,
          documentId: input.documentId,
          force: input.force,
        },
        sessionId: input.sessionId ?? "session:operator:knowledge",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "knowledge_embeddings_index",
    );
  }

  public async knowledgeEmbeddingsQuery(input: EmbeddingQueryInput): Promise<ToolInvokeResult | Record<string, unknown>> {
    return this.invokeAndUnwrap(
      {
        toolName: "embeddings.query",
        args: {
          namespace: input.namespace,
          query: input.query,
          limit: input.limit,
        },
        sessionId: input.sessionId ?? "session:operator:knowledge",
        agentId: input.agentId ?? "operator",
        taskId: input.taskId,
      },
      "knowledge_embeddings_query",
    );
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

  public getProviderSecretStatus(providerId: string): {
    providerId: string;
    hasSecret: boolean;
    source: "none" | "keychain" | "env" | "inline";
  } {
    const status = this.llmService.getProviderSecretStatus(providerId);
    return {
      providerId: status.providerId,
      hasSecret: status.hasApiKey,
      source: status.apiKeySource,
    };
  }

  public saveProviderSecret(providerId: string, apiKey: string): {
    providerId: string;
    hasSecret: boolean;
    source: "none" | "keychain" | "env" | "inline";
  } {
    this.llmService.setProviderApiKey(providerId, apiKey);
    this.llmService.clearInlineProviderApiKey(providerId);
    this.persistLlmConfig();
    return this.getProviderSecretStatus(providerId);
  }

  public deleteProviderSecret(providerId: string): {
    providerId: string;
    hasSecret: boolean;
    source: "none" | "keychain" | "env" | "inline";
  } {
    this.llmService.deleteProviderApiKey(providerId);
    return this.getProviderSecretStatus(providerId);
  }

  public getLlmConfig(): LlmRuntimeConfig {
    return this.llmService.getRuntimeConfig({
      includeKeychainForActiveProvider: true,
      useCache: true,
    });
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

  private readIntegrationPlugins(): IntegrationPluginRecord[] {
    const stored = this.storage.systemSettings.get<IntegrationPluginRecord[]>(INTEGRATION_PLUGINS_SETTING_KEY)?.value;
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored.filter((item): item is IntegrationPluginRecord => Boolean(item?.pluginId));
  }

  private writeIntegrationPlugins(plugins: IntegrationPluginRecord[]): void {
    this.storage.systemSettings.set(INTEGRATION_PLUGINS_SETTING_KEY, plugins);
  }

  private readMcpServers(): McpServerRecord[] {
    const stored = this.storage.systemSettings.get<McpServerRecord[]>(MCP_SERVERS_SETTING_KEY)?.value;
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored.filter((item): item is McpServerRecord => Boolean(item?.serverId));
  }

  private writeMcpServers(servers: McpServerRecord[]): void {
    this.storage.systemSettings.set(MCP_SERVERS_SETTING_KEY, servers);
  }

  private requireMcpServer(serverId: string): McpServerRecord {
    const server = this.readMcpServers().find((item) => item.serverId === serverId);
    if (!server) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }
    return server;
  }

  private patchMcpServerState(
    serverId: string,
    patch: Partial<Pick<McpServerRecord, "status" | "lastConnectedAt" | "lastError">>,
  ): McpServerRecord {
    const now = new Date().toISOString();
    let updated: McpServerRecord | undefined;
    const servers = this.readMcpServers().map((item) => {
      if (item.serverId !== serverId) {
        return item;
      }
      updated = {
        ...item,
        status: patch.status ?? item.status,
        lastConnectedAt: patch.lastConnectedAt ?? item.lastConnectedAt,
        lastError: patch.lastError ?? item.lastError,
        updatedAt: now,
      };
      return updated;
    });
    if (!updated) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }
    this.writeMcpServers(servers);
    return updated;
  }

  private readMcpTools(): McpToolRecord[] {
    const stored = this.storage.systemSettings.get<McpToolRecord[]>(MCP_TOOLS_SETTING_KEY)?.value;
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored.filter((item): item is McpToolRecord => Boolean(item?.serverId && item?.toolName));
  }

  private writeMcpTools(tools: McpToolRecord[]): void {
    this.storage.systemSettings.set(MCP_TOOLS_SETTING_KEY, tools);
  }

  private readMcpAuthState(): Record<string, McpAuthStateRecord> {
    return this.storage.systemSettings.get<Record<string, McpAuthStateRecord>>("mcp_auth_state_v1")?.value ?? {};
  }

  private writeMcpAuthState(state: Record<string, McpAuthStateRecord>): void {
    this.storage.systemSettings.set("mcp_auth_state_v1", state);
  }

  private processMediaJob(jobId: string): void {
    if (this.closing) {
      return;
    }
    const task = this.runMediaJob(jobId)
      .catch((error) => {
        const now = new Date().toISOString();
        this.storage.db.prepare(`
          UPDATE media_jobs
          SET status = 'failed', error = @error, updated_at = @updatedAt, completed_at = @completedAt
          WHERE job_id = @jobId
        `).run({
          error: (error as Error).message,
          updatedAt: now,
          completedAt: now,
          jobId,
        });
      })
      .finally(() => {
        this.backgroundTasks.delete(task);
      });
    this.backgroundTasks.add(task);
    void task;
  }

  private async runMediaJob(jobId: string): Promise<void> {
    const now = new Date().toISOString();
    this.storage.db.prepare(`
      UPDATE media_jobs
      SET status = 'running', updated_at = @updatedAt
      WHERE job_id = @jobId
    `).run({
      updatedAt: now,
      jobId,
    });
    const job = this.getMediaJob(jobId);
    const attachmentId = job.attachmentId;
    if (!attachmentId) {
      this.storage.db.prepare(`
        UPDATE media_jobs
        SET status = 'ready', output_json = @outputJson, updated_at = @updatedAt, completed_at = @completedAt
        WHERE job_id = @jobId
      `).run({
        outputJson: JSON.stringify({ message: "No attachment supplied." }),
        updatedAt: now,
        completedAt: now,
        jobId,
      });
      return;
    }

    const attachment = this.storage.chatAttachments.get(attachmentId);
    if (job.type === "audio_transcribe" || job.type === "video_transcribe") {
      const content = await this.readChatAttachmentContent(attachmentId);
      const transcript = await this.transcribeAudioBytes(content.bytes, content.record.mimeType);
      const completedAt = new Date().toISOString();
      this.storage.db.prepare(`
        UPDATE media_jobs
        SET status = 'ready', output_json = @outputJson, updated_at = @updatedAt, completed_at = @completedAt
        WHERE job_id = @jobId
      `).run({
        outputJson: JSON.stringify({ transcriptText: transcript.text, provider: transcript.provider }),
        updatedAt: completedAt,
        completedAt,
        jobId,
      });
      this.storage.db.prepare(`
        UPDATE chat_attachments
        SET transcript_text = @transcriptText, analysis_status = 'ready'
        WHERE attachment_id = @attachmentId
      `).run({
        transcriptText: transcript.text,
        attachmentId,
      });
      return;
    }

    if (job.type === "ocr" && attachment.mediaType === "image") {
      const completedAt = new Date().toISOString();
      this.storage.db.prepare(`
        UPDATE media_jobs
        SET status = 'unsupported', output_json = @outputJson, updated_at = @updatedAt, completed_at = @completedAt
        WHERE job_id = @jobId
      `).run({
        outputJson: JSON.stringify({
          message: "OCR worker is not installed. Configure sidecar OCR in a follow-up step.",
        }),
        updatedAt: completedAt,
        completedAt,
        jobId,
      });
      this.storage.db.prepare(`
        UPDATE chat_attachments
        SET analysis_status = 'unsupported'
        WHERE attachment_id = @attachmentId
      `).run({
        attachmentId,
      });
      return;
    }

    const completedAt = new Date().toISOString();
    this.storage.db.prepare(`
      UPDATE media_jobs
      SET status = 'ready', output_json = @outputJson, updated_at = @updatedAt, completed_at = @completedAt
      WHERE job_id = @jobId
    `).run({
      outputJson: JSON.stringify({
        mediaType: attachment.mediaType ?? detectAttachmentMediaType(attachment.mimeType),
        extractPreview: attachment.extractPreview,
      }),
      updatedAt: completedAt,
      completedAt,
      jobId,
    });
    this.storage.db.prepare(`
      UPDATE chat_attachments
      SET ocr_text = COALESCE(ocr_text, @ocrText), analysis_status = 'ready'
      WHERE attachment_id = @attachmentId
    `).run({
      ocrText: attachment.extractPreview ?? null,
      attachmentId,
    });
  }

  private async transcribeAudioBytes(
    bytes: Buffer,
    mimeType?: string,
    language?: string,
  ): Promise<VoiceTranscribeResponse> {
    const started = Date.now();
    const binPath = process.env.GOATCITADEL_WHISPER_CPP_BIN?.trim();
    if (!binPath) {
      const now = new Date().toISOString();
      this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
        state: "error",
        provider: DEFAULT_VOICE_PROVIDER,
        lastError: "GOATCITADEL_WHISPER_CPP_BIN is not configured.",
        updatedAt: now,
      });
      throw new Error("Local STT is not configured. Set GOATCITADEL_WHISPER_CPP_BIN to the whisper.cpp CLI path.");
    }

    const tempBase = path.join(os.tmpdir(), `goatcitadel-whisper-${randomUUID()}`);
    const ext = extFromMimeType(mimeType);
    const inputPath = `${tempBase}${ext}`;
    const outputBase = `${tempBase}-out`;
    const outputPath = `${outputBase}.txt`;

    this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
      state: "running",
      provider: DEFAULT_VOICE_PROVIDER,
      updatedAt: new Date().toISOString(),
    });

    try {
      await fs.writeFile(inputPath, bytes);
      const args = [
        "-f",
        inputPath,
        "-otxt",
        "-of",
        outputBase,
      ];
      if (language?.trim()) {
        args.push("-l", language.trim());
      }
      execFileSync(binPath, args, { stdio: "pipe" });
      const text = (await fs.readFile(outputPath, "utf8")).trim();
      const now = new Date().toISOString();
      this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
        state: "stopped",
        provider: DEFAULT_VOICE_PROVIDER,
        updatedAt: now,
      });
      return {
        text,
        language: language?.trim() || undefined,
        provider: DEFAULT_VOICE_PROVIDER,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      const now = new Date().toISOString();
      this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
        state: "error",
        provider: DEFAULT_VOICE_PROVIDER,
        lastError: (error as Error).message,
        updatedAt: now,
      });
      throw new Error(`Local STT failed: ${(error as Error).message}`);
    } finally {
      await Promise.allSettled([
        fs.rm(inputPath, { force: true }),
        fs.rm(outputPath, { force: true }),
      ]);
    }
  }

  private appendDaemonLog(eventType: string, payload: Record<string, unknown>): void {
    const current = this.storage.systemSettings.get<Array<{ timestamp: string; level: "info" | "warn" | "error"; message: string }>>(
      DAEMON_LOG_TAIL_SETTING_KEY,
    )?.value ?? [];
    const next = [
      ...current,
      {
        timestamp: new Date().toISOString(),
        level: "info" as const,
        message: `${eventType}: ${JSON.stringify(payload)}`,
      },
    ].slice(-400);
    this.storage.systemSettings.set(DAEMON_LOG_TAIL_SETTING_KEY, next);
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

  private async invokeAndUnwrap(
    request: ToolInvokeRequest,
    realtimeType: string,
  ): Promise<ToolInvokeResult | Record<string, unknown>> {
    const result = await this.invokeTool(request);
    if (result.outcome === "executed") {
      this.publishRealtime("system", "tools", {
        type: realtimeType,
        toolName: request.toolName,
        sessionId: request.sessionId,
        agentId: request.agentId,
        taskId: request.taskId,
        outcome: result.outcome,
      });
      return result.result ?? {};
    }
    return result;
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

  private async readTranscriptOrEmpty(sessionId: string) {
    try {
      return await this.storage.transcripts.read(sessionId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private requireChatSession(sessionId: string): ChatSessionRecord {
    const record = this.listChatSessions({ scope: "all", view: "all", limit: 5000 })
      .find((item) => item.sessionId === sessionId);
    if (!record) {
      throw new Error(`Chat session ${sessionId} not found`);
    }
    return record;
  }

  private routeFromSession(session: SessionMeta): {
    channel: string;
    account: string;
    peer?: string;
    room?: string;
    threadId?: string;
  } {
    const parts = session.sessionKey.split(":");
    const third = parts[2];
    const fourth = parts[3];
    if (session.kind === "dm") {
      return {
        channel: session.channel,
        account: session.account,
        peer: third,
      };
    }
    if (session.kind === "group") {
      return {
        channel: session.channel,
        account: session.account,
        room: third,
      };
    }
    return {
      channel: session.channel,
      account: session.account,
      room: third,
      threadId: fourth,
    };
  }

  private async buildLlmMessagesFromTranscript(
    sessionId: string,
    options?: {
      providerId?: string;
      model?: string;
    },
  ): Promise<ChatCompletionRequest["messages"]> {
    const runtime = this.llmService.getRuntimeConfig();
    const providerId = options?.providerId ?? runtime.activeProviderId;
    const providerSummary = runtime.providers.find((item) => item.providerId === providerId);
    const model = options?.model ?? providerSummary?.defaultModel ?? runtime.activeModel;
    const supportsVision = Boolean(providerSummary?.capabilities?.vision || inferModelVisionSupport(model));
    const transcript = await this.readTranscriptOrEmpty(sessionId);
    const mapped = await Promise.all(transcript
      .filter((event) => event.type === "message.user" || event.type === "message.assistant")
      .map(async (event) => {
        const payload = event.payload as {
          message?: {
            role?: string;
            content?: unknown;
            attachments?: unknown;
          };
        };
        const baseContent = typeof payload.message?.content === "string"
          ? payload.message.content
          : this.extractMessagePreview(event.payload);
        const contentParts = event.type === "message.user"
          ? await this.buildAttachmentMessageParts(payload.message?.attachments, baseContent, supportsVision)
          : undefined;
        const attachmentContext = event.type === "message.user"
          ? this.buildAttachmentPromptContext(payload.message?.attachments, supportsVision)
          : undefined;
        if (contentParts) {
          return {
            role: event.type === "message.assistant" ? "assistant" as const : "user" as const,
            content: contentParts,
          };
        }
        const content = attachmentContext
          ? `${baseContent}\n\n${attachmentContext}`
          : baseContent;
        return {
          role: event.type === "message.assistant" ? "assistant" as const : "user" as const,
          content,
        };
      }));
    return mapped.slice(-80);
  }

  private buildAttachmentPromptContext(input: unknown, supportsVision = false): string | undefined {
    if (!Array.isArray(input) || input.length === 0) {
      return undefined;
    }

    const attachmentIds = input
      .map((item) => (item as Record<string, unknown>).attachmentId)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (attachmentIds.length === 0) {
      return undefined;
    }

    const attachments = this.storage.chatAttachments.listByIds(attachmentIds).slice(0, 6);
    if (attachments.length === 0) {
      return undefined;
    }

    const lines = attachments.map((attachment) => {
      const descriptor = `- ${attachment.fileName} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`;
      if (supportsVision && isImageMimeType(attachment.mimeType)) {
        return `${descriptor}\n  Preview: sent directly to a vision-capable model.`;
      }
      if (!attachment.extractPreview?.trim()) {
        return `${descriptor}\n  Preview: unavailable for this file type in current pipeline.`;
      }
      const preview = attachment.extractPreview
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 1600);
      return `${descriptor}\n  Preview:\n${preview}`;
    });

    return [
      "Attached file context (from uploaded attachments):",
      ...lines,
    ].join("\n");
  }

  private async buildAttachmentMessageParts(
    input: unknown,
    prompt: string,
    supportsVision: boolean,
  ): Promise<Array<Record<string, unknown>> | undefined> {
    if (!supportsVision || !Array.isArray(input) || input.length === 0) {
      return undefined;
    }
    const attachmentIds = input
      .map((item) => (item as Record<string, unknown>).attachmentId)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (attachmentIds.length === 0) {
      return undefined;
    }

    const attachments = this.storage.chatAttachments.listByIds(attachmentIds).slice(0, 4);
    const parts: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: prompt,
      },
    ];

    for (const attachment of attachments) {
      if (!isImageMimeType(attachment.mimeType)) {
        continue;
      }
      try {
        const content = await this.readChatAttachmentContent(attachment.attachmentId);
        if (content.bytes.length > 5 * 1024 * 1024) {
          continue;
        }
        const dataUrl = `data:${attachment.mimeType};base64,${content.bytes.toString("base64")}`;
        parts.push({
          type: "image_url",
          image_url: {
            url: dataUrl,
          },
        });
      } catch {
        // keep chat flowing even if one image cannot be loaded
      }
    }

    return parts.length > 1 ? parts : undefined;
  }

  private extractMessagePreview(payload: Record<string, unknown>): string {
    const content = payload.content;
    if (typeof content === "string") {
      return content.slice(0, 240);
    }
    if (Array.isArray(content)) {
      return JSON.stringify(content).slice(0, 240);
    }
    const message = payload.message;
    if (typeof message === "string") {
      return message.slice(0, 240);
    }
    return JSON.stringify(payload).slice(0, 240);
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

  private getBackupDirectory(): string {
    const fromEnv = process.env.GOATCITADEL_BACKUP_DIR?.trim();
    if (fromEnv) {
      return path.resolve(fromEnv);
    }
    return path.join(os.homedir(), ".GoatCitadel", "backups");
  }

  private buildBackupIncludePaths(): string[] {
    const paths = new Set<string>();
    paths.add(path.relative(this.config.rootDir, this.config.dbPath).replaceAll("\\", "/"));
    paths.add(`${path.relative(this.config.rootDir, this.config.dbPath).replaceAll("\\", "/")}-wal`);
    paths.add(`${path.relative(this.config.rootDir, this.config.dbPath).replaceAll("\\", "/")}-shm`);
    paths.add(this.config.assistant.transcriptsDir.replaceAll("\\", "/"));
    paths.add(this.config.assistant.auditDir.replaceAll("\\", "/"));
    paths.add("config");
    return [...paths];
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

function toChatSessionRecord(
  session: SessionMeta,
  meta: {
    title?: string;
    pinned: boolean;
    lifecycleStatus: "active" | "archived";
    archivedAt?: string;
  },
  project?: ChatProjectRecord,
): ChatSessionRecord {
  return {
    sessionId: session.sessionId,
    sessionKey: session.sessionKey,
    scope: session.channel === "mission" ? "mission" : "external",
    title: meta.title ?? session.displayName,
    pinned: meta.pinned,
    lifecycleStatus: meta.lifecycleStatus,
    archivedAt: meta.archivedAt,
    projectId: project?.projectId,
    projectName: project?.name,
    channel: session.channel,
    account: session.account,
    updatedAt: session.updatedAt,
    lastActivityAt: session.lastActivityAt,
    tokenTotal: session.tokenTotal,
    costUsdTotal: session.costUsdTotal,
  };
}

function toChatMessageRecord(event: TranscriptEvent): ChatMessageRecord | undefined {
  const payload = event.payload as {
    message?: {
      role?: string;
      content?: unknown;
      attachments?: unknown;
    };
  };
  const message = payload.message;
  if (!message || typeof message.content !== "string") {
    return undefined;
  }
  const role = message.role === "assistant" ? "assistant" : "user";
  return {
    messageId: event.eventId,
    sessionId: event.sessionId,
    role,
    actorType: event.actorType,
    actorId: event.actorId,
    content: message.content,
    timestamp: event.timestamp,
    tokenInput: event.tokenInput,
    tokenOutput: event.tokenOutput,
    costUsd: event.costUsd,
    attachments: parseMessageAttachments(message.attachments),
  };
}

function parseMessageAttachments(input: unknown): ChatMessageRecord["attachments"] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const attachments = input
    .map((item) => {
      const value = item as Record<string, unknown>;
      const attachmentId = typeof value.attachmentId === "string" ? value.attachmentId : undefined;
      const fileName = typeof value.fileName === "string" ? value.fileName : undefined;
      const mimeType = typeof value.mimeType === "string" ? value.mimeType : undefined;
      const sizeBytes = typeof value.sizeBytes === "number" ? value.sizeBytes : undefined;
      if (!attachmentId || !fileName || !mimeType || sizeBytes === undefined) {
        return undefined;
      }
      return {
        attachmentId,
        fileName,
        mimeType,
        sizeBytes,
      };
    })
    .filter((item): item is NonNullable<ChatMessageRecord["attachments"]>[number] => Boolean(item));
  return attachments.length > 0 ? attachments : undefined;
}

function extractAssistantContent(response: ChatCompletionResponse): string {
  const choice = response.choices?.[0];
  const message = choice?.message;
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        const value = part as Record<string, unknown>;
        return typeof value.text === "string" ? value.text : "";
      })
      .join("")
      .trim();
    return text;
  }
  return "";
}

function parseUsageFromChatResponse(response: ChatCompletionResponse): {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
} {
  const usage = (response.usage ?? {}) as Record<string, unknown>;
  return {
    inputTokens: readNumber(usage.prompt_tokens) ?? readNumber(usage.input_tokens),
    outputTokens: readNumber(usage.completion_tokens) ?? readNumber(usage.output_tokens),
    cachedInputTokens: readNumber(usage.cached_prompt_tokens) ?? readNumber(usage.cached_input_tokens),
    costUsd: readNumber(usage.cost_usd) ?? readNumber(usage.total_cost_usd),
  };
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function splitIntoChunks(input: string, maxChunkLength: number): string[] {
  if (!input) {
    return [];
  }
  const chunks: string[] = [];
  let remaining = input;
  const chunkSize = Math.max(1, maxChunkLength);
  while (remaining.length > chunkSize) {
    chunks.push(remaining.slice(0, chunkSize));
    remaining = remaining.slice(chunkSize);
  }
  chunks.push(remaining);
  return chunks;
}

function sanitizeAttachmentFileName(input: string): string {
  const normalized = input
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[<>:"|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);
  if (!normalized) {
    return "attachment.bin";
  }
  return normalized;
}

function extractAttachmentPreview(
  bytes: Buffer,
  mimeType: string,
  fileName: string,
): { extractStatus: "ready" | "unsupported" | "failed"; extractPreview?: string } {
  const lowerMime = mimeType.toLowerCase();
  const ext = path.extname(fileName).toLowerCase();
  const textLike = lowerMime.startsWith("text/")
    || lowerMime === "application/json"
    || lowerMime === "application/xml"
    || ext === ".md"
    || ext === ".txt"
    || ext === ".log"
    || ext === ".json"
    || ext === ".yaml"
    || ext === ".yml";
  if (textLike) {
    try {
      const preview = bytes.toString("utf8").slice(0, 4000);
      return { extractStatus: "ready", extractPreview: preview };
    } catch {
      return { extractStatus: "failed" };
    }
  }
  return { extractStatus: "unsupported" };
}

interface McpAuthStateRecord {
  accessTokenRef?: string;
  refreshTokenRef?: string;
  tokenExpiresAt?: string;
  oauthState?: string;
  scopes?: string[];
  updatedAt: string;
  lastCodePreview?: string;
}

interface MediaJobRow {
  job_id: string;
  session_id: string | null;
  attachment_id: string | null;
  job_type: MediaJobRecord["type"];
  status: MediaJobRecord["status"];
  input_json: string | null;
  output_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function mapMediaJobRow(row: MediaJobRow): MediaJobRecord {
  return {
    jobId: row.job_id,
    sessionId: row.session_id ?? undefined,
    attachmentId: row.attachment_id ?? undefined,
    type: row.job_type,
    status: row.status,
    inputJson: row.input_json ? safeJsonParse<Record<string, unknown>>(row.input_json, {}) : undefined,
    outputJson: row.output_json ? safeJsonParse<Record<string, unknown>>(row.output_json, {}) : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function detectAttachmentMediaType(mimeType: string): ChatAttachmentMediaType {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (
    normalized.startsWith("text/")
    || normalized === "application/json"
    || normalized === "application/xml"
    || normalized === "application/javascript"
  ) {
    return "text";
  }
  return "binary";
}

function inferAttachmentAnalysisStatus(
  mediaType: ChatAttachmentMediaType,
  extractStatus: "ready" | "unsupported" | "failed",
): "queued" | "ready" | "failed" | "unsupported" {
  if (extractStatus === "failed") {
    return "failed";
  }
  if (mediaType === "text") {
    return extractStatus === "ready" ? "ready" : "unsupported";
  }
  return "queued";
}

function inferModelVisionSupport(model: string): boolean {
  const normalized = model.toLowerCase();
  return (
    normalized.includes("vision")
    || normalized.includes("gpt-4o")
    || normalized.includes("gpt-4.1")
    || normalized.includes("gemini")
    || normalized.includes("claude-3")
    || normalized.includes("kimi")
    || normalized.includes("glm")
  );
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

function normalizeChatInputParts(
  content: string,
  parts: ChatInputPart[] | undefined,
  attachments: ChatAttachmentRecord[],
): ChatInputPart[] {
  const normalizedParts = Array.isArray(parts) ? parts.filter(Boolean) : [];
  if (normalizedParts.length > 0) {
    return normalizedParts;
  }
  const attachmentParts = attachments.map((attachment) => {
    if (attachment.mediaType === "image" || isImageMimeType(attachment.mimeType)) {
      return {
        type: "image_ref" as const,
        attachmentId: attachment.attachmentId,
        mimeType: attachment.mimeType,
      };
    }
    if (attachment.mediaType === "audio") {
      return {
        type: "audio_ref" as const,
        attachmentId: attachment.attachmentId,
        mimeType: attachment.mimeType,
      };
    }
    if (attachment.mediaType === "video") {
      return {
        type: "video_ref" as const,
        attachmentId: attachment.attachmentId,
        mimeType: attachment.mimeType,
      };
    }
    return {
      type: "file_ref" as const,
      attachmentId: attachment.attachmentId,
      mimeType: attachment.mimeType,
    };
  });
  return [
    {
      type: "text",
      text: content,
    },
    ...attachmentParts,
  ];
}

function sanitizePluginId(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!sanitized) {
    return `plugin-${randomUUID().slice(0, 8)}`;
  }
  return sanitized.slice(0, 80);
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extFromMimeType(mimeType?: string): string {
  const normalized = mimeType?.toLowerCase() ?? "";
  if (normalized.includes("wav")) {
    return ".wav";
  }
  if (normalized.includes("mpeg")) {
    return ".mp3";
  }
  if (normalized.includes("ogg")) {
    return ".ogg";
  }
  if (normalized.includes("mp4")) {
    return ".mp4";
  }
  if (normalized.includes("webm")) {
    return ".webm";
  }
  return ".bin";
}

function normalizeRetentionPolicy(input: Partial<RetentionPolicy>): RetentionPolicy {
  return {
    realtimeEventsDays: clampInteger(input.realtimeEventsDays, 1, 365, DEFAULT_RETENTION_POLICY.realtimeEventsDays),
    backupsKeep: clampInteger(input.backupsKeep, 1, 500, DEFAULT_RETENTION_POLICY.backupsKeep),
    transcriptsDays: normalizeOptionalDays(input.transcriptsDays),
    auditDays: normalizeOptionalDays(input.auditDays),
  };
}

function normalizeOptionalDays(value: number | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return clampInteger(value, 1, 3650, 30);
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

async function listFilesSafe(dir: string): Promise<Array<{
  name: string;
  size: number;
  mtimeMs: number;
  isFile: () => boolean;
  isDirectory: () => boolean;
}>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result: Array<{
      name: string;
      size: number;
      mtimeMs: number;
      isFile: () => boolean;
      isDirectory: () => boolean;
    }> = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      let stats: fsSync.Stats | undefined;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }
      result.push({
        name: entry.name,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        isFile: () => entry.isFile(),
        isDirectory: () => entry.isDirectory(),
      });
    }
    return result;
  } catch {
    return [];
  }
}

async function pruneFilesOlderThan(
  dir: string,
  cutoffEpochMs: number,
  dryRun: boolean,
): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const walk = async (current: string): Promise<void> => {
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      let stats: fsSync.Stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (stats.mtimeMs >= cutoffEpochMs) {
        continue;
      }
      files += 1;
      bytes += stats.size;
      if (!dryRun) {
        await fs.rm(fullPath, { force: true });
      }
    }
  };
  await walk(dir);
  return { files, bytes };
}

async function copyPathIfExists(source: string, target: string): Promise<void> {
  let stats: fsSync.Stats;
  try {
    stats = await fs.stat(source);
  } catch {
    return;
  }
  if (stats.isDirectory()) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true, force: true });
    return;
  }
  if (stats.isFile()) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

async function collectBackupFileRecords(payloadDir: string): Promise<BackupManifestFileRecord[]> {
  const files: BackupManifestFileRecord[] = [];
  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const bytes = await fs.readFile(fullPath);
      const relativePath = path.relative(payloadDir, fullPath).replaceAll("\\", "/");
      files.push({
        path: relativePath,
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  };
  await walk(payloadDir);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function formatBackupTimestamp(now: Date): string {
  const parts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

function sanitizeBackupName(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }
  const sanitized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return sanitized || undefined;
}

function readAppVersion(): string {
  const packagePath = path.resolve(process.cwd(), "package.json");
  try {
    const raw = fsSync.readFileSync(packagePath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function readGitRef(rootDir: string): string | undefined {
  try {
    const value = execFileSync("git", ["-C", rootDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function ensurePathWithinRoot(targetPath: string, rootDir: string): void {
  const relative = path.relative(rootDir, targetPath);
  if (
    relative === ""
    || (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    return;
  }
  throw new Error(`Path escapes workspace root: ${targetPath}`);
}

