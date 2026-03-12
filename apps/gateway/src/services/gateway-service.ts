import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { EventIngestService } from "@goatcitadel/gateway-core";
import { MeshService } from "@goatcitadel/mesh-core";
import { OrchestrationEngine } from "@goatcitadel/orchestration";
import {
  ToolPolicyEngine,
  assertExistingPathRealpathAllowed,
  assertWritePathInJail,
  evaluateBankrActionPreview,
  readBankrSafetyPolicy,
  writeBankrSafetyPolicy,
} from "@goatcitadel/policy-engine";
import { SkillsService } from "@goatcitadel/skills";
import {
  DEFAULT_SESSION_AUTONOMY_PREFS,
  Storage,
  type SessionAutonomyPrefsPatchInput,
  type SessionAutonomyPrefsRecord,
} from "@goatcitadel/storage";
import type {
  AddonActionResponse,
  AddonCatalogEntry,
  AddonInstalledRecord,
  AddonInstallRequest,
  AddonStatusRecord,
  AddonUninstallResponse,
  BankrActionAuditRecord,
  BankrActionPreviewRequest,
  BankrActionPreviewResponse,
  BankrSafetyPolicy,
  AgentProfileArchiveInput,
  AgentProfileCreateInput,
  AgentProfileRecord,
  AgentProfileUpdateInput,
  BackupCreateResponse,
  BackupManifestFileRecord,
  BackupManifestRecord,
  AuthRuntimeSettings,
  AuthSettingsUpdateInput,
  DeviceAccessRequestCreateInput,
  DeviceAccessRequestCreateResponse,
  DeviceAccessRequestStatus,
  DeviceAccessRequestStatusResponse,
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
  ChatCapabilityUpgradeSuggestion,
  ChatCitationRecord,
  ChatDelegateAcceptRequest,
  ChatDelegateRequest,
  ChatDelegateSuggestRequest,
  ChatDelegateSuggestResponse,
  ChatDelegateResponse,
  ChatDelegationSuggestionRecord,
  ChatDelegationRunRecord,
  ChatDelegationStepRecord,
  ChatInputPart,
  ChatMemoryMode,
  ChatMode,
  ChatMessageRecord,
  ChatPlanningMode,
  ChatProactiveMode,
  ChatProjectRecord,
  ChatReflectionMode,
  ChatRetrievalMode,
  ChatSendMessageRequest,
  ChatSendMessageResponse,
  ChatSessionPrefsRecord,
  ChatSessionBindingRecord,
  ChatSessionRecord,
  ChatSessionPrefsPatch,
  ChatStreamChunk,
  ChatThreadResponse,
  ChatThinkingLevel,
  ChatTurnBranchKind,
  ChatTurnTraceRecord,
  ChatWebMode,
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
  McpServerCategory,
  McpServerPolicy,
  McpServerTemplateRecord,
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
  PromptPackRecord,
  PromptPackAutoScoreBatchResult,
  PromptPackAutoScoreResult,
  PromptPackBenchmarkItemRecord,
  PromptPackBenchmarkProviderInput,
  PromptPackBenchmarkRunRecord,
  PromptPackBenchmarkStatusRecord,
  PromptPackExportRecord,
  PromptPackReportRecord,
  PromptPackRunRecord,
  PromptPackScoreRecord,
  PromptPackTestRecord,
  ProactiveActionRecord,
  ProactivePolicy,
  ProactiveRunRecord,
  ResearchRunRecord,
  ResearchSourceRecord,
  ResearchSummaryRecord,
  SessionMeta,
  TranscriptEvent,
  SessionSummary,
  SessionTimelineItem,
  SkillActivationPolicy,
  SkillImportHistoryRecord,
  SkillImportValidationResult,
  SkillListItem,
  SkillSourceListResponse,
  SkillSourceLookupResponse,
  SkillSourceProvider,
  SkillRuntimeState,
  SkillStateRecord,
  SkillResolveInput,
  ObsidianIntegrationConfig,
  ObsidianIntegrationStatus,
  LearnedMemoryConflictRecord,
  LearnedMemoryItemRecord,
  LearnedMemoryItemType,
  LearnedMemoryUpdateInput,
  DecisionAutoTuneRecord,
  DecisionReplayCauseClass,
  DecisionReplayFindingRecord,
  DecisionReplayItemModelScores,
  DecisionReplayItemRecord,
  DecisionReplayItemRuleScores,
  DecisionReplayRunRecord,
  DurableCheckpointRecord,
  DurableDeadLetterRecord,
  DurableDiagnosticsResponse,
  DurableRunRecord,
  WeeklyImprovementReportRecord,
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
  VoiceRuntimeInstallRequest,
  VoiceRuntimeStatus,
  VoiceTalkSessionRecord,
  VoiceTranscribeResponse,
  GuidanceBundleRecord,
  GuidanceDocType,
  GuidanceDocumentRecord,
  WorkspaceCreateInput,
  WorkspaceRecord,
  WorkspaceUpdateInput,
  ReplayOverrideDraft,
  ReplayOverrideStep,
  ReplayDiffSummary,
  MemoryItemRecord,
  MemoryLifecyclePatch,
  MemoryChangeEvent,
  ConnectorDiagnosticReport,
  McpTemplateDiscoveryResult,
  CronReviewItem,
  CronRunDiff,
  ReplayRegressionRun,
  ReplayRegressionResult,
  CapabilityTrendSeries,
  DurableRunCreateRequest,
  DurableRunTimelineEvent,
  DurableRetryPolicy,
} from "@goatcitadel/contracts";
import { BUILTIN_AGENT_PROFILES } from "@goatcitadel/contracts";
import type { GatewayRuntimeConfig } from "../config.js";
import type { OrchestrationCheckpoint } from "@goatcitadel/storage";
import { LlmService } from "./llm-service.js";
import { ApprovalExplainerService } from "./approval-explainer-service.js";
import { scoutCapabilityUpgradeSuggestions } from "./chat-capability-scout.js";
import {
  collectMcpBrowserFallbackTargets,
  inferMcpToolsForServer,
  invokeMcpRuntimeTool,
} from "./mcp-runtime.js";
import {
  extractLearnedMemoryCandidates,
  looksLowConfidenceResponse,
  shouldExtractLearnedMemoryContent,
} from "./learned-memory-utils.js";
import {
  assertChatSessionActive,
  buildChatSessionUpdatedPayload,
  deriveChatSessionTitleFromContent,
  shouldAllowCrossProviderFallback,
} from "./chat-session-utils.js";
import {
  buildChatThreadResponse,
  buildSelectedPathTurnIds,
  resolveNewestLeafTurnId,
} from "./chat-thread-utils.js";
import { executeOrchestrationPlan } from "../orchestration/engine.js";
import { CHAT_MODE_POLICY } from "../orchestration/policies/chat-policy.js";
import { buildProviderCapabilityRegistry } from "../orchestration/providers/capability-registry.js";
import {
  buildOrchestrationPlan,
  resolveModePolicy,
  shouldUseModeOrchestration,
} from "../orchestration/router.js";
import type {
  OrchestrationExecutionResult,
  OrchestrationRouterInput,
  OrchestrationStepExecutionResult,
} from "../orchestration/types.js";
import { getIntegrationFormSchema, INTEGRATION_CATALOG } from "./integration-catalog.js";
import { MemoryContextService } from "./memory-context-service.js";
import { NpuSidecarService } from "./npu-sidecar-service.js";
import { SecretStoreService } from "./secret-store-service.js";
import { ChatAgentOrchestrator, normalizeAgentInputFromSend } from "./chat-agent-orchestrator.js";
import { ResearchService } from "./research-service.js";
import { ObsidianVaultService } from "./obsidian-vault-service.js";
import { SkillImportService } from "./skill-import-service.js";
import { AddonsService } from "./addons-service.js";
import {
  GatewayDevDiagnosticsService,
  resolveDevDiagnosticsBufferSize,
  resolveDevDiagnosticsEnabled,
  resolveDevDiagnosticsVerbose,
} from "../dev-diagnostics/service.js";
import {
  installManagedVoiceRuntime,
  removeManagedVoiceModel,
  selectManagedVoiceModel,
} from "../voice-runtime/installer.js";
import { getManagedVoiceRuntimeStatus } from "../voice-runtime/status.js";
import { normalizeMemoryForgetCriteria, serializePathWithinRoot } from "./security-utils.js";
import {
  COST_REPORT_HOURLY_JOB_ID,
  CronAutomationService,
  IMPROVEMENT_WEEKLY_JOB_ID,
  MEMORY_FLUSH_DAILY_JOB_ID,
  normalizeCronJobId,
  normalizeCronJobName,
  normalizeCronSchedule,
  PRIVATE_BETA_BACKUP_JOB_ID,
} from "./gateway/cron-automation-service.js";
import { OperatorSummaryCache } from "./gateway/operator-summary-cache.js";

export interface ApprovalResolveResult {
  approval: ApprovalRequest;
  executedAction?: ToolInvokeResult;
}

export interface ApprovalReplayResult {
  approval: ApprovalRequest;
  events: ApprovalReplayEvent[];
  pendingAction?: PendingApprovalAction;
}

interface AuthDeviceRequestRecord {
  requestId: string;
  approvalId: string;
  requestSecretHash: string;
  deviceLabel: string;
  deviceType: string;
  platform?: string;
  requestedOrigin?: string;
  requestedIp?: string;
  userAgent?: string;
  status: DeviceAccessRequestStatus;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  approvedTokenPlaintext?: string;
  approvedTokenExpiresAt?: string;
  deliveredAt?: string;
}

interface AuthDeviceGrantRecord {
  grantId: string;
  requestId: string;
  tokenHash: string;
  deviceLabel: string;
  deviceType: string;
  platform?: string;
  grantedBy: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  metadata: Record<string, unknown>;
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
  features: {
    durableKernelV1Enabled: boolean;
    replayOverridesV1Enabled: boolean;
    memoryLifecycleAdminV1Enabled: boolean;
    connectorDiagnosticsV1Enabled: boolean;
    computerUseGuardrailsV1Enabled: boolean;
    bankrBuiltinEnabled: boolean;
    cronReviewQueueV1Enabled: boolean;
    replayRegressionV1Enabled: boolean;
  };
}

const RETENTION_SETTINGS_KEY = "retention_policy";
const MCP_SERVERS_SETTING_KEY = "mcp_servers_v1";
const MCP_TOOLS_SETTING_KEY = "mcp_tools_v1";
const MCP_TOOL_FIRST_APPROVAL_SETTING_KEY = "mcp_tool_first_approval_v1";
const INTEGRATION_PLUGINS_SETTING_KEY = "integration_plugins_v1";
const SKILL_ACTIVATION_POLICY_SETTING_KEY = "skill_activation_policy_v1";
const DAEMON_LOG_TAIL_SETTING_KEY = "daemon_log_tail_v1";
const VOICE_STATUS_SETTING_KEY = "voice_status_v1";
const VOICE_WAKE_STATUS_SETTING_KEY = "voice_wake_status_v1";
const FEATURE_FLAGS_SETTING_KEY = "feature_flags_v1";
const DURABLE_RETRY_POLICY_DEFAULT: DurableRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 5_000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
};
const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  realtimeEventsDays: 14,
  backupsKeep: 20,
  transcriptsDays: undefined,
  auditDays: undefined,
};
const DEVICE_ACCESS_APPROVAL_KIND = "auth.device_access";
const DEVICE_ACCESS_REQUEST_POLL_AFTER_MS = 2_500;
const DEVICE_ACCESS_REQUEST_TTL_MS = 10 * 60 * 1000;
const DEVICE_ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_ACCESS_SECRET_BYTES = 24;
const DEVICE_ACCESS_TOKEN_BYTES = 32;

const MEMORY_ITEM_STATUS_VALUES = new Set(["active", "forgotten"]);

const DEFAULT_VOICE_PROVIDER: VoiceTranscribeResponse["provider"] = "whisper.cpp";
const DEFAULT_SKILL_ACTIVATION_POLICY: SkillActivationPolicy = {
  guardedAutoThreshold: 0.72,
  requireFirstUseConfirmation: true,
};
const BANKR_OPTIONAL_MIGRATION_MESSAGE =
  "Bankr built-in is disabled. Install the optional skill pack (docs/OPTIONAL_BANKR_SKILL.md; templates/skills/bankr-optional/SKILL.md).";
const PROACTIVE_SCHEDULER_INTERVAL_MS = 120_000;
const PROACTIVE_SCHEDULER_CONCURRENCY = 8;
const PROACTIVE_MIN_IDLE_SECONDS = 90;
const PROACTIVE_SAFE_TOOL_ALLOWLIST = new Set([
  "time.now",
  "browser.search",
  "browser.navigate",
  "browser.extract",
  "http.get",
]);
const DEFAULT_MCP_SERVER_POLICY: McpServerPolicy = {
  requireFirstToolApproval: false,
  redactionMode: "basic",
  allowedToolPatterns: [],
  blockedToolPatterns: [],
};
const MCP_SERVER_TEMPLATES: McpServerTemplateRecord[] = [
  {
    templateId: "filesystem",
    label: "Filesystem (Local)",
    description: "Read and write local workspace files through MCP.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    authType: "none",
    category: "development",
    trustTier: "restricted",
    costTier: "free",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "basic",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "fetch",
    label: "Fetch (HTTP)",
    description: "Web fetch/search helper MCP server for research tasks.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    authType: "none",
    category: "research",
    trustTier: "restricted",
    costTier: "free",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "basic",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "playwright",
    label: "Playwright Browser",
    description: "Browser automation MCP server for dynamic website workflows.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-playwright"],
    authType: "none",
    category: "automation",
    trustTier: "restricted",
    costTier: "free",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "basic",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "github",
    label: "GitHub",
    description: "Official GitHub MCP endpoint for repositories, pull requests, issues, and code navigation.",
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    authType: "oauth2",
    category: "development",
    trustTier: "restricted",
    costTier: "mixed",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "strict",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "stripe",
    label: "Stripe",
    description: "Official Stripe remote MCP server for customers, subscriptions, invoices, and billing support workflows.",
    transport: "http",
    url: "https://mcp.stripe.com",
    authType: "oauth2",
    category: "automation",
    trustTier: "restricted",
    costTier: "mixed",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "strict",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "context7",
    label: "Context7",
    description: "Up-to-date library and framework documentation search via the official Context7 MCP server.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@latest"],
    authType: "none",
    category: "research",
    trustTier: "restricted",
    costTier: "free",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "basic",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "microsoft-learn",
    label: "Microsoft Learn",
    description: "Official Microsoft Learn MCP endpoint for current Microsoft documentation, examples, and how-to guidance.",
    transport: "http",
    url: "https://learn.microsoft.com/api/mcp",
    authType: "none",
    category: "research",
    trustTier: "trusted",
    costTier: "free",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "basic",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "n8n",
    label: "n8n",
    description: "Connect GoatCitadel to an n8n MCP endpoint for workflow execution and automation handoff.",
    transport: "sse",
    url: "https://your-n8n-host/mcp/<server-id>/sse",
    authType: "token",
    category: "automation",
    trustTier: "restricted",
    costTier: "mixed",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "strict",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "gpt-researcher",
    label: "GPT Researcher",
    description: "Structured deep-research MCP server for investigation workflows and source-grounded reports.",
    transport: "stdio",
    command: "uvx",
    args: ["gpt-researcher-mcp"],
    authType: "none",
    category: "research",
    trustTier: "restricted",
    costTier: "mixed",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "basic",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
  {
    templateId: "openspec",
    label: "OpenSpec",
    description: "MCP bridge for OpenSpec-style spec and analysis workflows.",
    transport: "stdio",
    command: "uvx",
    args: ["openspec-mcp"],
    authType: "none",
    category: "development",
    trustTier: "restricted",
    costTier: "free",
    policy: {
      requireFirstToolApproval: true,
      redactionMode: "basic",
      allowedToolPatterns: [],
      blockedToolPatterns: [],
    },
    enabledByDefault: false,
  },
];
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

const CHAT_SESSION_AUTO_ALLOW_TOOLS = [
  "browser.search",
  "browser.navigate",
  "browser.extract",
  "http.get",
] as const;

const PROMPT_PACK_PASS_THRESHOLD = 7;
const PROMPT_PACK_BENCHMARK_MAX_TESTS = 200;
const PROMPT_PACK_BENCHMARK_MAX_PROVIDERS = 10;
const PROMPT_PACK_BENCHMARK_MAX_FAILURE_SIGNALS = 3;
const DEFAULT_PROMPT_RUNNER_SOURCE = "goatcitadel_prompt_pack.md";
const DEFAULT_PROMPT_PACK_EXPORT_DIR = "artifacts/prompt-lab";
const DEFAULT_DELEGATION_ROLES = ["product", "architect", "coder", "qa", "ops"];
const IMPROVEMENT_WEEKLY_TIME_ZONE = "America/Los_Angeles";
const IMPROVEMENT_WEEKLY_SCHEDULE_LABEL = "0 2 * * 0 America/Los_Angeles";
const PRIVATE_BETA_BACKUP_TIME_ZONE = "America/Los_Angeles";
const PRIVATE_BETA_BACKUP_SCHEDULE_LABEL = "30 2 * * * America/Los_Angeles";
const MEMORY_FLUSH_DAILY_TIME_ZONE = "America/Los_Angeles";
const MEMORY_FLUSH_DAILY_SCHEDULE_LABEL = "0 3 * * * America/Los_Angeles";
const COST_REPORT_HOURLY_TIME_ZONE = "America/Los_Angeles";
const COST_REPORT_HOURLY_SCHEDULE_LABEL = "0 * * * * America/Los_Angeles";
const PRIVATE_BETA_BACKUP_DEDUP_SETTING_KEY = "private_beta_backup_last_day_key_v1";
const MEMORY_FLUSH_DAILY_DEDUP_SETTING_KEY = "memory_flush_daily_last_day_key_v1";
const COST_REPORT_HOURLY_DEDUP_SETTING_KEY = "cost_report_hourly_last_hour_key_v1";
const IMPROVEMENT_WEEKLY_SAMPLE_SIZE = 500;
const IMPROVEMENT_JUDGE_SAMPLE_LIMIT = 120;
const IMPROVEMENT_JUDGE_TIMEOUT_MS = 15_000;
const IMPROVEMENT_SCHEDULER_INTERVAL_MS = 60_000;
const IMPROVEMENT_WEEKLY_DEDUP_SETTING_KEY = "improvement_weekly_last_week_key_v1";
const MEMORY_FLUSH_HISTORY_DAYS = 30;
const COST_REPORT_LOOKBACK_HOURS = 1;
const COST_REPORT_OUTPUT_DIR = "artifacts/cost-reports";
const IMPROVEMENT_TUNE_KEY_BLOCKER_TEMPLATE = "improvement_tune_blocker_template_v1";
const IMPROVEMENT_TUNE_KEY_RETRY_THRESHOLD = "improvement_tune_retry_threshold_v1";
const IMPROVEMENT_TUNE_KEY_LIVE_INTENT = "improvement_tune_live_intent_threshold_v1";
const IMPROVEMENT_TUNE_KEY_REFUSAL_STYLE = "improvement_tune_refusal_style_v1";
const IMPROVEMENT_RUN_STATUS_VALUES = new Set(["queued", "running", "completed", "failed"]);
const IMPROVEMENT_CAUSE_CLASSES = new Set<DecisionReplayCauseClass>([
  "false_refusal_tone",
  "weak_blocker_explanation",
  "tool_mismatch",
  "retrieval_miss",
  "incomplete_retry_repair",
  "other",
]);
const PIPELINE_TEMPLATES: Record<string, string[]> = {
  prd: ["product", "architect"],
  build: ["architect", "coder", "qa"],
  triage: ["qa", "ops", "product"],
  release: ["qa", "ops", "product"],
};
const DEFAULT_WORKSPACE_ID = "default";
const GUIDANCE_DOC_FILE_MAP: Record<GuidanceDocType, string> = {
  goatcitadel: "GOATCITADEL.md",
  agents: "AGENTS.md",
  claude: "CLAUDE.md",
  contributing: "CONTRIBUTING.md",
  security: "SECURITY.md",
  vision: "VISION.md",
};
const WORKSPACE_GUIDANCE_DOC_TYPES: GuidanceDocType[] = ["goatcitadel", "agents", "claude", "vision"];
const RUNTIME_GUIDANCE_DOC_TYPES: GuidanceDocType[] = ["goatcitadel", "agents", "claude"];
const MAX_RUNTIME_GUIDANCE_CHARS = 6000;
const GUIDANCE_DEBUG_KILL_SWITCH_ENV = "GOATCITADEL_DISABLE_GUIDANCE_INJECTION";

interface ChatSessionListQuery {
  scope?: "mission" | "external" | "all";
  workspaceId?: string;
  projectId?: string;
  q?: string;
  view?: "active" | "archived" | "all";
  limit?: number;
  cursor?: string;
}

type SessionAutonomyPrefs = SessionAutonomyPrefsRecord;

interface ProactiveTriggerInput {
  source?: "scheduler" | "manual" | "chat";
  reason?: string;
  prefs?: SessionAutonomyPrefs;
}

interface ProactivePlannedAction {
  kind: "tool" | "delegate" | "note";
  toolName?: string;
  args?: Record<string, unknown>;
  note?: string;
  objective?: string;
  roles?: string[];
}

interface ImprovementReplayTriggerInput {
  sampleSize?: number;
}

interface DecisionReplayCandidate {
  decisionType: "chat_turn" | "tool_run";
  sessionId?: string;
  turnId?: string;
  toolRunId?: string;
  status: string;
  occurredAt: string;
  model?: string;
  mode?: ChatMode;
  webMode?: ChatWebMode;
  memoryMode?: ChatMemoryMode;
  thinkingLevel?: ChatThinkingLevel;
  routing?: ChatTurnTraceRecord["routing"];
  retrieval?: ChatTurnTraceRecord["retrieval"];
  reflection?: ChatTurnTraceRecord["reflection"];
  toolName?: string;
  error?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  userMessageId?: string;
  assistantMessageId?: string;
}

interface ReplayScoredItemResult {
  item: DecisionReplayItemRecord;
  judgeUsed: boolean;
}

interface PromptPackBenchmarkRunRow {
  benchmark_run_id: string;
  pack_id: string;
  status: PromptPackBenchmarkRunRecord["status"];
  test_codes_json: string;
  providers_json: string;
  total_items: number;
  completed_items: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

interface PromptPackBenchmarkItemRow {
  item_id: string;
  benchmark_run_id: string;
  pack_id: string;
  test_id: string;
  test_code: string;
  provider_id: string;
  model: string;
  run_id: string | null;
  score_id: string | null;
  run_status: PromptPackBenchmarkItemRecord["runStatus"];
  total_score: number | null;
  failure_signal: string | null;
  created_at: string;
}

interface RealtimeListener {
  (event: RealtimeEvent): void;
}

interface ResolvedRuntimeGuidance {
  workspaceId: string;
  systemInstruction?: string;
  globalFilesUsed: string[];
  workspaceFilesUsed: string[];
  truncated: boolean;
}

class ChatTurnWriteConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ChatTurnWriteConflictError";
  }
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
  private readonly chatAgentOrchestrator: ChatAgentOrchestrator;
  private readonly researchService: ResearchService;
  private readonly obsidianVaultService: ObsidianVaultService;
  private readonly skillImportService: SkillImportService;
  private readonly cronAutomationService: CronAutomationService;
  private readonly addonsService: AddonsService;
  private readonly devDiagnostics: GatewayDevDiagnosticsService;
  private readonly realtime = new EventEmitter();
  private readonly backgroundTasks = new Set<Promise<void>>();
  private readonly warnedOutsideRootPathFingerprints = new Set<string>();
  private readonly chatMessageProjectionBackfillAttempted = new Set<string>();
  private readonly activeChatTurnWrites = new Map<string, string>();
  private readonly operatorSummaryCache = new OperatorSummaryCache(15_000);
  private readonly onboardingMarkerPath: string;
  private proactiveScheduler?: NodeJS.Timeout;
  private improvementScheduler?: NodeJS.Timeout;
  private closing = false;
  private onboardingMarker: { completedAt?: string; completedBy?: string } = {};

  private get gatewaySql() {
    return this.storage.gatewaySql;
  }

  public constructor(private readonly config: GatewayRuntimeConfig) {
    this.storage = new Storage({
      dbPath: config.dbPath,
      transcriptsDir: path.resolve(config.rootDir, config.assistant.transcriptsDir),
      auditDir: path.resolve(config.rootDir, config.assistant.auditDir),
      tuning: {
        cacheSizeKb: config.assistant.sqlite.cacheSizeKb,
        tempStoreMemory: config.assistant.sqlite.tempStoreMemory,
        walAutoCheckpointPages: config.assistant.sqlite.walAutoCheckpointPages,
      },
    });
    this.onboardingMarkerPath = path.resolve(
      config.rootDir,
      config.assistant.dataDir,
      "onboarding-state.json",
    );
    this.devDiagnostics = new GatewayDevDiagnosticsService(
      resolveDevDiagnosticsEnabled(),
      undefined,
      resolveDevDiagnosticsVerbose(),
      resolveDevDiagnosticsBufferSize(process.env.GOATCITADEL_DEV_DIAGNOSTICS_GATEWAY_BUFFER),
    );

    this.eventIngestService = new EventIngestService(this.storage);
    this.policyEngine = new ToolPolicyEngine(config.toolPolicy, this.storage, undefined, {
      isBankrBuiltinEnabled: () => this.isFeatureEnabled("bankrBuiltinEnabled"),
    });
    const secretStore = new SecretStoreService();
    this.skillsService = new SkillsService([
      { source: "extra", dir: path.join(config.rootDir, "skills", "extra") },
      { source: "extra", dir: path.join(config.rootDir, "skills", "genie-npu-ir20") },
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
    this.chatAgentOrchestrator = new ChatAgentOrchestrator({
      storage: this.storage,
      listToolCatalog: () => this.listToolCatalog(),
      createChatCompletion: (request) => this.createChatCompletion(request),
      createChatCompletionStream: (request) => this.createChatCompletionStream(request),
      invokeTool: (request) => this.invokeTool(request),
      evaluateToolAccess: (request) => this.policyEngine.evaluateAccess(request),
      invokeMcpTool: (request) => this.invokeMcpTool(request),
      listMcpBrowserFallbackTargets: () => this.listMcpBrowserFallbackTargets(),
    });
    this.researchService = new ResearchService({
      storage: this.storage,
      invokeTool: (request) => this.invokeTool(request),
      createChatCompletion: (request) => this.createChatCompletion(request),
    });
    this.obsidianVaultService = new ObsidianVaultService(this.storage.systemSettings);
    this.skillImportService = new SkillImportService(config.rootDir, this.storage.systemSettings);
    this.addonsService = new AddonsService(config.rootDir);
    this.cronAutomationService = new CronAutomationService({
      storage: this.storage,
      persistCronJobsConfig: () => this.persistCronJobsConfig(),
      publishRealtime: (eventType, source, payload) => this.publishRealtime(eventType, source, payload ?? {}),
      requireFeatureEnabled: (flag) => this.requireFeatureEnabled(flag),
      isFeatureEnabled: (flag) => this.isFeatureEnabled(flag),
      runHandlers: {
        improvement: async () => {
          await this.runWeeklyImprovementSchedulerIfDue({ force: true });
        },
        backup: async () => {
          await this.runPrivateBetaBackupSchedulerIfDue({ force: true });
        },
        memoryFlush: async () => {
          await this.runMemoryFlushSchedulerIfDue({ force: true });
        },
        costReport: async () => {
          await this.runCostReportSchedulerIfDue({ force: true });
        },
      },
    });
  }

  public isDevDiagnosticsEnabled(): boolean {
    return this.devDiagnostics.isEnabled();
  }

  public listDevDiagnostics(input?: {
    level?: "debug" | "info" | "warn" | "error";
    category?: string;
    correlationId?: string;
    limit?: number;
  }) {
    return this.devDiagnostics.list(input);
  }

  public subscribeDevDiagnostics(listener: Parameters<GatewayDevDiagnosticsService["subscribe"]>[0]): () => void {
    return this.devDiagnostics.subscribe(listener);
  }

  public recordDevDiagnostic(input: Parameters<GatewayDevDiagnosticsService["record"]>[0]): void {
    this.devDiagnostics.record(input);
  }

  public attachDevDiagnosticsLogger(logger: { debug: Function; info: Function; warn: Function; error: Function }): void {
    this.devDiagnostics.setLogger(logger as never);
  }

  public async init(): Promise<void> {
    await this.loadOnboardingMarker();
    this.applyStoredFeatureFlags();
    this.storage.agentProfiles.seedBuiltins(BUILTIN_AGENT_PROFILES);
    const skills = await this.skillsService.reload();
    this.ensureSkillStates(skills.map((skill) => skill.skillId));
    this.markInterruptedDecisionReplayRuns();
    await this.loadCronJobsFromConfig();
    this.ensureWeeklyImprovementCronJob();
    this.ensurePrivateBetaBackupCronJob();
    this.ensureMemoryFlushCronJob();
    this.ensureCostReportCronJob();
    this.meshService.init();
    await this.npuSidecar.init();
    // Enforce env-only secret persistence policy on startup.
    this.persistLlmConfig();
    this.persistAssistantConfig();
    this.startProactiveScheduler();
    this.startImprovementScheduler();
    console.info(
      "[goatcitadel] feature flags",
      JSON.stringify(this.readFeatureFlags()),
    );
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

    if (!result.deduped) {
      this.operatorSummaryCache.invalidate();
    }

    return result;
  }

  public listSessions(limit: number, cursor?: string) {
    return this.storage.sessions.list(limit, cursor);
  }

  public getSession(sessionId: string) {
    return this.storage.sessions.getBySessionId(sessionId);
  }

  public listWorkspaces(view: "active" | "archived" | "all" = "active", limit = 200): WorkspaceRecord[] {
    return this.storage.workspaces.list(view, limit);
  }

  public getWorkspace(workspaceId: string): WorkspaceRecord {
    return this.storage.workspaces.get(this.normalizeWorkspaceId(workspaceId));
  }

  public createWorkspace(input: WorkspaceCreateInput): WorkspaceRecord {
    const created = this.storage.workspaces.create(input);
    this.publishRealtime("workspace_created", "system", {
      workspaceId: created.workspaceId,
      name: created.name,
      slug: created.slug,
    });
    return created;
  }

  public updateWorkspace(workspaceId: string, input: WorkspaceUpdateInput): WorkspaceRecord {
    const updated = this.storage.workspaces.update(this.normalizeWorkspaceId(workspaceId), input);
    this.publishRealtime("workspace_updated", "system", {
      workspaceId: updated.workspaceId,
      name: updated.name,
      slug: updated.slug,
    });
    return updated;
  }

  public archiveWorkspace(workspaceId: string): WorkspaceRecord {
    const archived = this.storage.workspaces.archive(this.normalizeWorkspaceId(workspaceId));
    this.publishRealtime("workspace_archived", "system", {
      workspaceId: archived.workspaceId,
    });
    return archived;
  }

  public restoreWorkspace(workspaceId: string): WorkspaceRecord {
    const restored = this.storage.workspaces.restore(this.normalizeWorkspaceId(workspaceId));
    this.publishRealtime("workspace_restored", "system", {
      workspaceId: restored.workspaceId,
    });
    return restored;
  }

  public async listGlobalGuidance(): Promise<GuidanceDocumentRecord[]> {
    const docs = await Promise.all(
      (Object.keys(GUIDANCE_DOC_FILE_MAP) as GuidanceDocType[]).map((docType) => this.readGuidanceDocument(docType, "global")),
    );
    return docs;
  }

  public async listWorkspaceGuidance(workspaceId: string): Promise<GuidanceBundleRecord> {
    const normalizedWorkspaceId = this.normalizeWorkspaceId(workspaceId);
    this.storage.workspaces.get(normalizedWorkspaceId);
    const [globalDocs, workspaceDocs] = await Promise.all([
      this.listGlobalGuidance(),
      Promise.all(
        WORKSPACE_GUIDANCE_DOC_TYPES.map((docType) =>
          this.readGuidanceDocument(docType, "workspace", normalizedWorkspaceId)),
      ),
    ]);
    return {
      workspaceId: normalizedWorkspaceId,
      global: globalDocs,
      workspace: workspaceDocs,
    };
  }

  public async updateGlobalGuidance(docType: GuidanceDocType, content: string): Promise<GuidanceDocumentRecord> {
    await this.writeGuidanceDocument(docType, "global", undefined, content);
    this.publishRealtime("guidance_updated", "system", {
      scope: "global",
      docType,
    });
    return this.readGuidanceDocument(docType, "global");
  }

  public async updateWorkspaceGuidance(
    workspaceId: string,
    docType: GuidanceDocType,
    content: string,
  ): Promise<GuidanceDocumentRecord> {
    const normalizedWorkspaceId = this.normalizeWorkspaceId(workspaceId);
    this.storage.workspaces.get(normalizedWorkspaceId);
    if (!WORKSPACE_GUIDANCE_DOC_TYPES.includes(docType)) {
      throw new Error(`Workspace override is not supported for ${docType}; use global guidance instead.`);
    }
    await this.writeGuidanceDocument(docType, "workspace", normalizedWorkspaceId, content);
    this.publishRealtime("guidance_updated", "system", {
      scope: "workspace",
      workspaceId: normalizedWorkspaceId,
      docType,
    });
    return this.readGuidanceDocument(docType, "workspace", normalizedWorkspaceId);
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

  public listChatProjects(
    view: "active" | "archived" | "all" = "active",
    limit = 300,
    workspaceId?: string,
  ): ChatProjectRecord[] {
    return this.storage.chatProjects.list(view, limit, this.normalizeWorkspaceId(workspaceId));
  }

  public createChatProject(input: {
    workspaceId?: string;
    name: string;
    description?: string;
    workspacePath: string;
    color?: string;
  }): ChatProjectRecord {
    const created = this.storage.chatProjects.create({
      ...input,
      workspaceId: this.normalizeWorkspaceId(input.workspaceId),
    });
    this.publishRealtime("system", "chat", {
      type: "chat_project_created",
      projectId: created.projectId,
      name: created.name,
      workspaceId: created.workspaceId,
    });
    return created;
  }

  public updateChatProject(projectId: string, input: {
    workspaceId?: string;
    name?: string;
    description?: string;
    workspacePath?: string;
    color?: string;
  }): ChatProjectRecord {
    const updated = this.storage.chatProjects.update(projectId, {
      ...input,
      workspaceId: input.workspaceId ? this.normalizeWorkspaceId(input.workspaceId) : undefined,
    });
    this.publishRealtime("system", "chat", {
      type: "chat_project_updated",
      projectId: updated.projectId,
      name: updated.name,
      workspaceId: updated.workspaceId,
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
    const workspaceId = this.normalizeWorkspaceId(query.workspaceId);
    const scope = query.scope ?? "all";
    const view = query.view ?? "active";
    const limit = Math.max(1, Math.min(1000, Math.floor(query.limit ?? 200)));
    const allSessions = this.storage.sessions.list(20000);
    const projects = this.storage.chatProjects.list("all", 2000, workspaceId);
    const projectById = new Map(projects.map((project) => [project.projectId, project]));
    const sessionIds = allSessions.map((session) => session.sessionId);
    const metaBySessionId = this.storage.chatSessionMeta.listBySessionIds(sessionIds, workspaceId);
    const projectLinkBySessionId = this.storage.chatSessionProjects.listBySessionIds(sessionIds);

    let records = allSessions.map((session) => {
      const meta = metaBySessionId.get(session.sessionId) ?? this.storage.chatSessionMeta.ensure(session.sessionId, undefined, workspaceId);
      const link = projectLinkBySessionId.get(session.sessionId);
      const project = link ? projectById.get(link.projectId) : undefined;
      return toChatSessionRecord(session, meta, project);
    });

    records = records.filter((record) => this.normalizeWorkspaceId(record.workspaceId) === workspaceId);

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
    workspaceId?: string;
    title?: string;
    projectId?: string;
  }): ChatSessionRecord {
    const workspaceId = this.normalizeWorkspaceId(input.workspaceId);
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
    this.operatorSummaryCache.invalidate();
    this.storage.chatSessionMeta.ensure(resolution.sessionId, now, workspaceId);
    this.storage.chatSessionPrefs.ensure(resolution.sessionId, now);
    this.ensureChatSessionRuntimeGrants(resolution.sessionId);
    if (input.title?.trim()) {
      this.storage.chatSessionMeta.patch(resolution.sessionId, {
        workspaceId,
        title: input.title.trim(),
      }, now);
    }
    this.storage.chatSessionBindings.upsert({
      sessionId: resolution.sessionId,
      workspaceId,
      transport: "llm",
      writable: true,
    }, now);
    if (input.projectId) {
      const project = this.storage.chatProjects.get(input.projectId);
      if (this.normalizeWorkspaceId(project.workspaceId) !== workspaceId) {
        throw new Error("project workspace does not match requested session workspace");
      }
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
    const updated = this.requireChatSession(sessionId);
    this.publishRealtime("chat_session_title_updated", "chat", {
      type: "chat_session_title_updated",
      sessionId: updated.sessionId,
      title: updated.title,
    });
    return updated;
  }

  private maybeAutoTitleChatSession(sessionId: string, content: string): void {
    const meta = this.storage.chatSessionMeta.ensure(sessionId);
    if (meta.title?.trim()) {
      return;
    }
    const derivedTitle = deriveChatSessionTitleFromContent(content);
    if (!derivedTitle) {
      return;
    }
    this.storage.chatSessionMeta.patch(sessionId, { title: derivedTitle });
    this.publishRealtime("chat_session_title_updated", "chat", {
      type: "chat_session_title_updated",
      sessionId,
      title: derivedTitle,
    });
  }

  public pinChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, { pinned: true });
    const updated = this.requireChatSession(sessionId);
    this.publishRealtime("chat_session_updated", "chat", buildChatSessionUpdatedPayload("chat_session_pinned", updated));
    return updated;
  }

  public unpinChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, { pinned: false });
    const updated = this.requireChatSession(sessionId);
    this.publishRealtime("chat_session_updated", "chat", buildChatSessionUpdatedPayload("chat_session_unpinned", updated));
    return updated;
  }

  public archiveChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, {
      lifecycleStatus: "archived",
      archivedAt: new Date().toISOString(),
    });
    const updated = this.requireChatSession(sessionId);
    this.publishRealtime("chat_session_updated", "chat", buildChatSessionUpdatedPayload("chat_session_archived", updated));
    return updated;
  }

  public restoreChatSession(sessionId: string): ChatSessionRecord {
    this.getSession(sessionId);
    this.storage.chatSessionMeta.patch(sessionId, {
      lifecycleStatus: "active",
      archivedAt: undefined,
    });
    const updated = this.requireChatSession(sessionId);
    this.publishRealtime("chat_session_updated", "chat", buildChatSessionUpdatedPayload("chat_session_restored", updated));
    return updated;
  }

  public async deleteChatSession(sessionId: string): Promise<{ deleted: boolean; sessionId: string }> {
    this.getSession(sessionId);
    const result = this.storage.deleteChatSessionData(sessionId);
    this.activeChatTurnWrites.delete(sessionId);
    this.operatorSummaryCache.invalidate();
    const cleanupResults = await Promise.allSettled([
      this.storage.transcripts.delete(sessionId),
      ...result.cleanupRelPaths.map((storageRelPath) => this.removeChatSessionStoredFile(storageRelPath)),
    ]);
    for (const cleanupResult of cleanupResults) {
      if (cleanupResult.status === "rejected") {
        console.warn("[goatcitadel] chat session delete cleanup failed", {
          sessionId,
          error: cleanupResult.reason instanceof Error ? cleanupResult.reason.message : String(cleanupResult.reason),
        });
      }
    }
    this.publishRealtime("chat_session_deleted", "chat", {
      type: "chat_session_deleted",
      sessionId,
      mode: "hard",
    });
    return {
      deleted: result.deleted,
      sessionId,
    };
  }

  private async removeChatSessionStoredFile(storageRelPath: string): Promise<void> {
    const normalized = storageRelPath.trim();
    if (!normalized) {
      return;
    }
    const fullPath = path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, normalized);
    assertWritePathInJail(fullPath, this.config.toolPolicy.sandbox.writeJailRoots);
    await fs.rm(fullPath, { force: true });
  }

  public assignChatSessionProject(sessionId: string, projectId?: string): ChatSessionRecord {
    this.getSession(sessionId);
    const meta = this.storage.chatSessionMeta.ensure(sessionId);
    const workspaceId = this.normalizeWorkspaceId(meta.workspaceId);
    if (!projectId) {
      this.storage.chatSessionProjects.unassign(sessionId);
      const updated = this.requireChatSession(sessionId);
      this.publishRealtime("chat_session_updated", "chat", buildChatSessionUpdatedPayload("chat_session_project_unassigned", updated));
      return updated;
    }
    const project = this.storage.chatProjects.get(projectId);
    if (this.normalizeWorkspaceId(project.workspaceId) !== workspaceId) {
      throw new Error("project workspace does not match session workspace");
    }
    this.storage.chatSessionProjects.assign(sessionId, projectId);
    const updated = this.requireChatSession(sessionId);
    this.publishRealtime("chat_session_updated", "chat", buildChatSessionUpdatedPayload("chat_session_project_assigned", updated));
    return updated;
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
    const sessionMeta = this.storage.chatSessionMeta.ensure(input.sessionId);
    if (input.transport === "integration") {
      if (!input.connectionId?.trim() || !input.target?.trim()) {
        throw new Error("connectionId and target are required for integration transport");
      }
      this.storage.integrationConnections.get(input.connectionId);
    }
    const binding = this.storage.chatSessionBindings.upsert({
      sessionId: input.sessionId,
      workspaceId: this.normalizeWorkspaceId(sessionMeta.workspaceId),
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
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    try {
      await this.ensureChatMessageProjection(sessionId);
      return this.storage.chatMessages.list(sessionId, safeLimit, cursor);
    } catch (error) {
      console.warn("[goatcitadel] chat message projection unavailable, falling back to transcript scan", {
        sessionId,
        error: (error as Error).message,
      });
      return this.listChatMessagesFromTranscript(sessionId, safeLimit, cursor);
    }
  }

  private async loadChatTurnSessionState(sessionId: string): Promise<{
    traces: ChatTurnTraceRecord[];
    tracesById: Map<string, ChatTurnTraceRecord>;
    turnLineageById: Map<string, { turnId: string; parentTurnId?: string }>;
    messages: ChatMessageRecord[];
    messagesById: Map<string, ChatMessageRecord>;
    childrenByTurnId: Map<string, string[]>;
    activeLeafTurnId?: string;
  }> {
    await this.ensureChatMessageProjection(sessionId);
    const traces = this.listHydratedChatTurnTraces(sessionId, 2_000);
    const messages = this.storage.chatMessages.list(sessionId, 5_000);
    return {
      traces,
      tracesById: new Map(traces.map((trace) => [trace.turnId, trace])),
      turnLineageById: new Map(traces.map((trace) => [trace.turnId, {
        turnId: trace.turnId,
        parentTurnId: trace.parentTurnId,
      }])),
      messages,
      messagesById: new Map(messages.map((message) => [message.messageId, message])),
      childrenByTurnId: this.buildChatTurnChildrenMap(traces),
      activeLeafTurnId: this.resolveChatActiveLeafTurnId(sessionId, traces),
    };
  }

  public async getChatThread(sessionId: string): Promise<ChatThreadResponse> {
    this.getSession(sessionId);
    const state = await this.loadChatTurnSessionState(sessionId);
    return buildChatThreadResponse({
      sessionId,
      activeLeafTurnId: state.activeLeafTurnId,
      turns: state.traces.map((trace) => ({
        trace,
        userMessage: state.messagesById.get(trace.userMessageId),
        assistantMessage: trace.assistantMessageId ? state.messagesById.get(trace.assistantMessageId) : undefined,
      })),
    });
  }

  public async selectChatBranchTurn(sessionId: string, turnId: string): Promise<ChatThreadResponse> {
    this.getSession(sessionId);
    const state = await this.loadChatTurnSessionState(sessionId);
    const target = state.traces.find((trace) => trace.turnId === turnId);
    if (!target) {
      throw new Error(`Chat turn ${turnId} not found in session ${sessionId}`);
    }
    const newestLeafTurnId = resolveNewestLeafTurnId(
      turnId,
      new Map(state.traces.map((trace) => [trace.turnId, {
        turnId: trace.turnId,
        startedAtMs: Date.parse(trace.startedAt) || 0,
      }])),
      state.childrenByTurnId,
    );
    this.storage.chatSessionBranchState.setActiveLeaf(sessionId, newestLeafTurnId);
    this.publishRealtime("chat_thread_updated", "chat", {
      type: "chat_thread_branch_selected",
      sessionId,
      turnId,
      activeLeafTurnId: newestLeafTurnId,
    });
    return buildChatThreadResponse({
      sessionId,
      activeLeafTurnId: newestLeafTurnId,
      turns: state.traces.map((trace) => ({
        trace,
        userMessage: state.messagesById.get(trace.userMessageId),
        assistantMessage: trace.assistantMessageId ? state.messagesById.get(trace.assistantMessageId) : undefined,
      })),
    });
  }

  public getChatSessionPrefs(sessionId: string): ChatSessionPrefsRecord {
    this.getSession(sessionId);
    const prefs = this.ensureGlmPrimaryDefaults(sessionId, this.storage.chatSessionPrefs.ensure(sessionId));
    return this.hydrateChatPrefsWithAutonomy(sessionId, prefs);
  }

  public updateChatSessionPrefs(
    sessionId: string,
    input: ChatSessionPrefsPatch,
  ): ChatSessionPrefsRecord {
    this.getSession(sessionId);
    const { basePatch, autonomyPatch } = splitChatPrefsPatch(input);
    if (Object.keys(autonomyPatch).length > 0) {
      this.patchSessionAutonomyPrefs(sessionId, autonomyPatch);
    }
    const updated = this.storage.chatSessionPrefs.patch(sessionId, basePatch);
    const normalized = this.ensureGlmPrimaryDefaults(sessionId, updated);
    const hydrated = this.hydrateChatPrefsWithAutonomy(sessionId, normalized);
    this.publishRealtime("chat_session_updated", "chat", {
      type: "chat_session_prefs_updated",
      sessionId,
      prefs: hydrated,
    });
    return hydrated;
  }

  private ensureGlmPrimaryDefaults(sessionId: string, prefs: ChatSessionPrefsRecord): ChatSessionPrefsRecord {
    if (prefs.providerId && prefs.model) {
      return prefs;
    }
    const defaults = this.getPromptRunnerModelDefaults();
    const patch: Partial<Omit<ChatSessionPrefsRecord, "sessionId" | "createdAt" | "updatedAt">> = {};
    if (!prefs.providerId && defaults.providerId) {
      patch.providerId = defaults.providerId;
    }
    if (!prefs.model && defaults.model) {
      patch.model = defaults.model;
    }
    if (Object.keys(patch).length === 0) {
      return prefs;
    }
    return this.storage.chatSessionPrefs.patch(sessionId, patch);
  }

  private hydrateChatPrefsWithAutonomy(sessionId: string, prefs: ChatSessionPrefsRecord): ChatSessionPrefsRecord {
    const autonomy = this.getSessionAutonomyPrefs(sessionId);
    return {
      ...prefs,
      proactiveMode: autonomy.proactiveMode,
      autonomyBudget: {
        maxActionsPerHour: autonomy.maxActionsPerHour,
        maxActionsPerTurn: autonomy.maxActionsPerTurn,
        cooldownSeconds: autonomy.cooldownSeconds,
      },
      retrievalMode: autonomy.retrievalMode,
      reflectionMode: autonomy.reflectionMode,
    };
  }

  private getSessionAutonomyPrefs(sessionId: string): SessionAutonomyPrefs {
    return this.storage.sessionAutonomyPrefs.ensure(sessionId);
  }

  private patchSessionAutonomyPrefs(
    sessionId: string,
    input: SessionAutonomyPrefsPatchInput,
  ): SessionAutonomyPrefs {
    return this.storage.sessionAutonomyPrefs.patch(sessionId, input);
  }

  private toProactivePolicy(sessionId: string, prefs: SessionAutonomyPrefs): ProactivePolicy {
    return {
      sessionId,
      mode: prefs.proactiveMode,
      autonomyBudget: {
        maxActionsPerHour: prefs.maxActionsPerHour,
        maxActionsPerTurn: prefs.maxActionsPerTurn,
        cooldownSeconds: prefs.cooldownSeconds,
      },
      retrievalMode: prefs.retrievalMode,
      reflectionMode: prefs.reflectionMode,
      updatedAt: prefs.updatedAt,
    };
  }

  private startProactiveScheduler(): void {
    if (this.proactiveScheduler) {
      return;
    }
    this.proactiveScheduler = setInterval(() => {
      const task = this.runProactiveSchedulerTick().catch((error) => {
        console.error("[goatcitadel] proactive scheduler tick failed", error);
        this.publishRealtime("system", "chat", {
          type: "proactive_scheduler_error",
          message: (error as Error).message,
        });
      });
      this.backgroundTasks.add(task);
      task.finally(() => this.backgroundTasks.delete(task));
    }, PROACTIVE_SCHEDULER_INTERVAL_MS);
  }

  private async runProactiveSchedulerTick(): Promise<void> {
    if (this.closing) {
      return;
    }
    const sessions = this.listChatSessions({
      scope: "mission",
      view: "active",
      limit: 300,
    });
    const prefsBySessionId = this.storage.sessionAutonomyPrefs.listBySessionIds(
      sessions.map((session) => session.sessionId),
    );
    const eligible = sessions
      .map((session) => ({
        sessionId: session.sessionId,
        prefs: prefsBySessionId.get(session.sessionId) ?? {
          sessionId: session.sessionId,
          ...DEFAULT_SESSION_AUTONOMY_PREFS,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }))
      .filter((item) => item.prefs.proactiveMode !== "off");

    if (eligible.length === 0) {
      return;
    }

    const maxWorkers = Math.min(PROACTIVE_SCHEDULER_CONCURRENCY, eligible.length);
    let cursor = 0;
    const workers = Array.from({ length: maxWorkers }, async () => {
      while (cursor < eligible.length) {
        const index = cursor;
        cursor += 1;
        const current = eligible[index];
        if (!current) {
          continue;
        }
        try {
          await this.triggerChatSessionProactive(current.sessionId, {
            source: "scheduler",
            reason: "Background proactive scheduler tick.",
            prefs: current.prefs,
          });
        } catch (error) {
          console.error(
            "[goatcitadel] proactive scheduler session trigger failed",
            { sessionId: current.sessionId, error },
          );
          this.publishRealtime("system", "chat", {
            type: "proactive_scheduler_session_error",
            sessionId: current.sessionId,
            message: (error as Error).message,
          });
        }
      }
    });
    await Promise.all(workers);
  }

  private startImprovementScheduler(): void {
    if (this.improvementScheduler) {
      return;
    }
    this.improvementScheduler = setInterval(() => {
      const task = this.runImprovementSchedulerTick().catch((error) => {
        console.error("[goatcitadel] improvement scheduler tick failed", error);
        this.publishRealtime("system", "improvement", {
          type: "improvement_scheduler_error",
          message: (error as Error).message,
        });
      });
      this.backgroundTasks.add(task);
      task.finally(() => this.backgroundTasks.delete(task));
    }, IMPROVEMENT_SCHEDULER_INTERVAL_MS);
  }

  private async runImprovementSchedulerTick(): Promise<void> {
    if (this.closing) {
      return;
    }
    await this.runWeeklyImprovementSchedulerIfDue();
    await this.runPrivateBetaBackupSchedulerIfDue();
    await this.runMemoryFlushSchedulerIfDue();
    await this.runCostReportSchedulerIfDue();
  }

  private async runWeeklyImprovementSchedulerIfDue(options: { force?: boolean } = {}): Promise<void> {
    const job = this.storage.cronJobs.get(IMPROVEMENT_WEEKLY_JOB_ID);
    if (!job?.enabled) {
      return;
    }
    const now = new Date();
    if (!options.force && !isCronJobDueNow(job, now, {
      defaultHour: 2,
      defaultMinute: 0,
      defaultWeekday: 0,
      defaultTimeZone: IMPROVEMENT_WEEKLY_TIME_ZONE,
    })) {
      return;
    }
    const weekKey = toWeekKeyForTimezone(now, IMPROVEMENT_WEEKLY_TIME_ZONE);
    const lastWeekKey = this.storage.systemSettings.get<string>(IMPROVEMENT_WEEKLY_DEDUP_SETTING_KEY)?.value;
    if (!options.force && lastWeekKey === weekKey) {
      return;
    }
    await this.runDecisionReplayAudit({
      triggerMode: options.force ? "manual" : "scheduled",
      sampleSize: IMPROVEMENT_WEEKLY_SAMPLE_SIZE,
    });
    this.storage.systemSettings.set(IMPROVEMENT_WEEKLY_DEDUP_SETTING_KEY, weekKey);
    const finishedAt = new Date().toISOString();
    this.storage.cronJobs.upsert({
      ...job,
      lastRunAt: finishedAt,
      nextRunAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
    });
  }

  private async runPrivateBetaBackupSchedulerIfDue(options: { force?: boolean } = {}): Promise<void> {
    const job = this.storage.cronJobs.get(PRIVATE_BETA_BACKUP_JOB_ID);
    if (!job?.enabled) {
      return;
    }
    const now = new Date();
    if (!options.force && !isCronJobDueNow(job, now, {
      defaultHour: 2,
      defaultMinute: 30,
      defaultWeekday: undefined,
      defaultTimeZone: PRIVATE_BETA_BACKUP_TIME_ZONE,
    })) {
      return;
    }
    const dayKey = toDayKeyForTimezone(now, PRIVATE_BETA_BACKUP_TIME_ZONE);
    const lastDayKey = this.storage.systemSettings.get<string>(PRIVATE_BETA_BACKUP_DEDUP_SETTING_KEY)?.value;
    if (!options.force && dayKey === lastDayKey) {
      return;
    }

    const backupName = `private-beta-${dayKey.replaceAll("-", "")}`;
    const backup = await this.createBackup({ name: backupName });
    await this.pruneRetention({ dryRun: false });
    this.storage.systemSettings.set(PRIVATE_BETA_BACKUP_DEDUP_SETTING_KEY, dayKey);

    const finishedAt = new Date().toISOString();
    this.storage.cronJobs.upsert({
      ...job,
      lastRunAt: finishedAt,
      nextRunAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
    });
    this.publishRealtime("backup_created", "system", {
      type: "private_beta_daily_backup",
      backupId: backup.backupId,
      outputPath: backup.outputPath,
      bytes: backup.bytes,
    });
  }

  private async runMemoryFlushSchedulerIfDue(options: { force?: boolean } = {}): Promise<void> {
    const job = this.storage.cronJobs.get(MEMORY_FLUSH_DAILY_JOB_ID);
    if (!job?.enabled) {
      return;
    }
    const now = new Date();
    if (!options.force && !isCronJobDueNow(job, now, {
      defaultHour: 3,
      defaultMinute: 0,
      defaultWeekday: undefined,
      defaultTimeZone: MEMORY_FLUSH_DAILY_TIME_ZONE,
    })) {
      return;
    }
    const dayKey = toDayKeyForTimezone(now, MEMORY_FLUSH_DAILY_TIME_ZONE);
    const lastDayKey = this.storage.systemSettings.get<string>(MEMORY_FLUSH_DAILY_DEDUP_SETTING_KEY)?.value;
    if (!options.force && dayKey === lastDayKey) {
      return;
    }

    const nowIso = now.toISOString();
    const cutoffIso = new Date(now.getTime() - (MEMORY_FLUSH_HISTORY_DAYS * 24 * 60 * 60 * 1000)).toISOString();
    const prunedExpiredContextPacks = this.storage.memoryContexts.pruneExpired(nowIso);
    const prunedOldContextPacks = this.storage.memoryContexts.pruneOlderThan(cutoffIso);
    const prunedOldQmdRuns = this.storage.memoryQmdRuns.pruneOlderThan(cutoffIso);

    this.storage.systemSettings.set(MEMORY_FLUSH_DAILY_DEDUP_SETTING_KEY, dayKey);
    const finishedAt = new Date().toISOString();
    this.storage.cronJobs.upsert({
      ...job,
      lastRunAt: finishedAt,
      nextRunAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
    });
    this.publishRealtime("cron_job_run", "cron", {
      type: "memory_flush_daily",
      jobId: MEMORY_FLUSH_DAILY_JOB_ID,
      cutoffIso,
      prunedExpiredContextPacks,
      prunedOldContextPacks,
      prunedOldQmdRuns,
    });
  }

  private async runCostReportSchedulerIfDue(options: { force?: boolean } = {}): Promise<void> {
    const job = this.storage.cronJobs.get(COST_REPORT_HOURLY_JOB_ID);
    if (!job?.enabled) {
      return;
    }
    const now = new Date();
    if (!options.force && !isCronJobDueNow(job, now, {
      defaultHour: 0,
      defaultMinute: 0,
      defaultWeekday: undefined,
      defaultTimeZone: COST_REPORT_HOURLY_TIME_ZONE,
    })) {
      return;
    }
    const hourKey = toHourKeyForTimezone(now, COST_REPORT_HOURLY_TIME_ZONE);
    const lastHourKey = this.storage.systemSettings.get<string>(COST_REPORT_HOURLY_DEDUP_SETTING_KEY)?.value;
    if (!options.force && hourKey === lastHourKey) {
      return;
    }

    const windowEndIso = now.toISOString();
    const windowStartIso = new Date(now.getTime() - (COST_REPORT_LOOKBACK_HOURS * 60 * 60 * 1000)).toISOString();
    const byDay = this.storage.costLedger.summary("day", windowStartIso, windowEndIso);
    const bySession = this.storage.costLedger.summary("session", windowStartIso, windowEndIso);
    const byAgent = this.storage.costLedger.summary("agent", windowStartIso, windowEndIso);
    const byTask = this.storage.costLedger.summary("task", windowStartIso, windowEndIso);
    const usageAvailability = this.storage.costLedger.usageAvailability(windowStartIso, windowEndIso);
    const totalCostUsd = byDay.reduce((sum, row) => sum + row.costUsd, 0);
    const totalTokens = byDay.reduce((sum, row) => sum + row.tokenTotal, 0);

    const lines: string[] = [];
    lines.push(`# Cost Report (${COST_REPORT_LOOKBACK_HOURS}h)`);
    lines.push("");
    lines.push(`- Generated: ${windowEndIso}`);
    lines.push(`- Window: ${windowStartIso} -> ${windowEndIso}`);
    lines.push(`- Total cost: $${totalCostUsd.toFixed(6)}`);
    lines.push(`- Total tokens: ${totalTokens}`);
    lines.push(`- Tracked events: ${usageAvailability.trackedEvents}`);
    lines.push(`- Usage unavailable events: ${usageAvailability.unknownEvents}`);
    lines.push(`- Total agent events: ${usageAvailability.totalAgentEvents}`);
    lines.push("");

    const appendSummaryTable = (
      title: string,
      keyLabel: string,
      rows: Array<{
        key: string;
        tokenInput: number;
        tokenOutput: number;
        tokenCachedInput: number;
        tokenTotal: number;
        costUsd: number;
      }>,
    ) => {
      lines.push(`## ${title}`);
      lines.push("");
      if (rows.length === 0) {
        lines.push("_No data in this window._");
        lines.push("");
        return;
      }
      lines.push(`| ${keyLabel} | Token In | Token Out | Cached In | Token Total | Cost USD |`);
      lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
      for (const row of rows) {
        lines.push(`| ${row.key || "-"} | ${row.tokenInput} | ${row.tokenOutput} | ${row.tokenCachedInput} | ${row.tokenTotal} | ${row.costUsd.toFixed(6)} |`);
      }
      lines.push("");
    };

    appendSummaryTable("By Session", "Session", bySession.slice(0, 25));
    appendSummaryTable("By Agent", "Agent", byAgent.slice(0, 25));
    appendSummaryTable("By Task", "Task", byTask.slice(0, 25));
    appendSummaryTable("By Day", "Day", byDay.slice(0, 25));

    const reportDir = path.join(this.config.rootDir, COST_REPORT_OUTPUT_DIR);
    await fs.mkdir(reportDir, { recursive: true });
    const reportFileName = `cost-report-${hourKey}.md`;
    const outputPath = path.join(reportDir, reportFileName);
    await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

    this.storage.systemSettings.set(COST_REPORT_HOURLY_DEDUP_SETTING_KEY, hourKey);
    const finishedAt = new Date().toISOString();
    this.storage.cronJobs.upsert({
      ...job,
      lastRunAt: finishedAt,
      nextRunAt: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
    });
    this.publishRealtime("cron_job_run", "cron", {
      type: "cost_report_hourly",
      jobId: COST_REPORT_HOURLY_JOB_ID,
      outputPath,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      totalTokens,
      trackedEvents: usageAvailability.trackedEvents,
      unknownEvents: usageAvailability.unknownEvents,
      windowStartIso,
      windowEndIso,
    });
  }

  private hasRunningTurn(sessionId: string): boolean {
    const latest = this.storage.chatTurnTraces.listBySession(sessionId, 1)[0];
    return latest?.status === "running" || latest?.status === "approval_required";
  }

  private getSessionIdleSeconds(sessionId: string): number {
    const session = this.getSession(sessionId);
    const lastActivity = Date.parse(session.lastActivityAt);
    if (!Number.isFinite(lastActivity)) {
      return 0;
    }
    return Math.max(0, Math.floor((Date.now() - lastActivity) / 1000));
  }

  private getProactiveCooldownRemainingSeconds(prefs: SessionAutonomyPrefs): number {
    if (!prefs.lastProactiveAt || prefs.cooldownSeconds <= 0) {
      return 0;
    }
    const elapsedSeconds = Math.floor((Date.now() - Date.parse(prefs.lastProactiveAt)) / 1000);
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds >= prefs.cooldownSeconds) {
      return 0;
    }
    return Math.max(0, prefs.cooldownSeconds - elapsedSeconds);
  }

  private countProactiveActionsLastHour(sessionId: string): number {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const row = this.gatewaySql.prepare(`
      SELECT COUNT(*) AS count
      FROM proactive_actions
      WHERE session_id = ? AND status = 'executed' AND created_at >= ?
    `).get(sessionId, cutoff) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  private async planProactiveActions(sessionId: string): Promise<{
    confidence: number;
    reasoningSummary: string;
    actions: ProactivePlannedAction[];
  }> {
    const messages = await this.listChatMessages(sessionId, 60);
    const latestUser = [...messages].reverse().find((message) => message.role === "user");
    if (!latestUser) {
      return {
        confidence: 0.1,
        reasoningSummary: "No recent user prompt found.",
        actions: [],
      };
    }
    const text = latestUser.content.trim();
    if (!text) {
      return {
        confidence: 0.1,
        reasoningSummary: "Latest user prompt is empty.",
        actions: [],
      };
    }
    const actions: ProactivePlannedAction[] = [];
    const roles = detectDelegationRoles(text);
    if (roles.length > 1 || /\b(prd|architecture|qa|ops|handoff|route this)\b/i.test(text)) {
      actions.push({
        kind: "delegate",
        objective: text,
        roles,
      });
    }

    if (/\b(weather|price|latest|news|current|today|time)\b/i.test(text)) {
      actions.push({
        kind: "tool",
        toolName: /\btime\b/i.test(text) ? "time.now" : "browser.search",
        args: /\btime\b/i.test(text) ? {} : { query: text, maxResults: 5 },
      });
    }

    if (actions.length === 0) {
      actions.push({
        kind: "note",
        note: "Consider running /delegate for structured multi-role output.",
      });
    }

    return {
      confidence: actions.some((action) => action.kind !== "note") ? 0.78 : 0.42,
      reasoningSummary: "Generated actions from latest user intent and route hints.",
      actions,
    };
  }

  private insertProactiveRun(run: ProactiveRunRecord): void {
    this.gatewaySql.prepare(`
      INSERT INTO proactive_runs (
        run_id, session_id, status, mode, confidence, reasoning_summary, action_count,
        suggested_actions_json, executed_actions_json, error, started_at, finished_at
      ) VALUES (
        @runId, @sessionId, @status, @mode, @confidence, @reasoningSummary, @actionCount,
        @suggestedActionsJson, @executedActionsJson, @error, @startedAt, @finishedAt
      )
    `).run({
      runId: run.runId,
      sessionId: run.sessionId,
      status: run.status,
      mode: run.mode,
      confidence: run.confidence,
      reasoningSummary: run.reasoningSummary,
      actionCount: run.suggestedActions.length,
      suggestedActionsJson: JSON.stringify(run.suggestedActions),
      executedActionsJson: JSON.stringify(run.executedActions),
      error: run.error ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
    });
  }

  private finishProactiveRun(
    runId: string,
    patch: Partial<Pick<ProactiveRunRecord, "status" | "confidence" | "reasoningSummary" | "suggestedActions" | "executedActions" | "error">>,
  ): ProactiveRunRecord {
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM proactive_runs
      WHERE run_id = ?
    `).get(runId) as {
      run_id: string;
      session_id: string;
      status: ProactiveRunRecord["status"];
      mode: ChatProactiveMode;
      confidence: number;
      reasoning_summary: string;
      suggested_actions_json: string;
      executed_actions_json: string;
      started_at: string;
      finished_at: string | null;
      error: string | null;
    } | undefined;
    if (!row) {
      throw new Error(`Proactive run ${runId} not found.`);
    }
    const next: ProactiveRunRecord = {
      runId: row.run_id,
      sessionId: row.session_id,
      status: patch.status ?? row.status,
      mode: row.mode,
      confidence: patch.confidence ?? Number(row.confidence || 0),
      reasoningSummary: patch.reasoningSummary ?? row.reasoning_summary ?? "",
      suggestedActions: patch.suggestedActions ?? safeJsonParse<ProactiveActionRecord[]>(row.suggested_actions_json, []),
      executedActions: patch.executedActions ?? safeJsonParse<ProactiveActionRecord[]>(row.executed_actions_json, []),
      startedAt: row.started_at,
      finishedAt: new Date().toISOString(),
      error: patch.error ?? row.error ?? undefined,
    };
    this.gatewaySql.prepare(`
      UPDATE proactive_runs
      SET
        status = @status,
        confidence = @confidence,
        reasoning_summary = @reasoningSummary,
        action_count = @actionCount,
        suggested_actions_json = @suggestedActionsJson,
        executed_actions_json = @executedActionsJson,
        error = @error,
        finished_at = @finishedAt
      WHERE run_id = @runId
    `).run({
      runId: next.runId,
      status: next.status,
      confidence: next.confidence,
      reasoningSummary: next.reasoningSummary,
      actionCount: next.suggestedActions.length,
      suggestedActionsJson: JSON.stringify(next.suggestedActions),
      executedActionsJson: JSON.stringify(next.executedActions),
      error: next.error ?? null,
      finishedAt: next.finishedAt ?? null,
    });
    return next;
  }

  private insertProactiveAction(action: ProactiveActionRecord): void {
    this.gatewaySql.prepare(`
      INSERT INTO proactive_actions (
        action_id, run_id, session_id, kind, status, tool_name, args_json, result_json, error, created_at, updated_at
      ) VALUES (
        @actionId, @runId, @sessionId, @kind, @status, @toolName, @argsJson, @resultJson, @error, @createdAt, @updatedAt
      )
    `).run({
      actionId: action.actionId,
      runId: action.runId,
      sessionId: action.sessionId,
      kind: action.kind,
      status: action.status,
      toolName: action.toolName ?? null,
      argsJson: action.args ? JSON.stringify(action.args) : null,
      resultJson: action.result ? JSON.stringify(action.result) : null,
      error: action.error ?? null,
      createdAt: action.createdAt,
      updatedAt: action.updatedAt ?? action.createdAt,
    });
  }

  private updateProactiveAction(
    actionId: string,
    patch: Partial<Pick<ProactiveActionRecord, "status" | "result" | "error">>,
  ): ProactiveActionRecord {
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM proactive_actions
      WHERE action_id = ?
    `).get(actionId) as {
      action_id: string;
      run_id: string;
      session_id: string;
      kind: ProactiveActionRecord["kind"];
      status: ProactiveActionRecord["status"];
      tool_name: string | null;
      args_json: string | null;
      result_json: string | null;
      error: string | null;
      created_at: string;
      updated_at: string | null;
    } | undefined;
    if (!row) {
      throw new Error(`Proactive action ${actionId} not found.`);
    }
    const updatedAt = new Date().toISOString();
    const next: ProactiveActionRecord = {
      actionId: row.action_id,
      runId: row.run_id,
      sessionId: row.session_id,
      kind: row.kind,
      status: patch.status ?? row.status,
      toolName: row.tool_name ?? undefined,
      args: row.args_json ? safeJsonParse<Record<string, unknown>>(row.args_json, {}) : undefined,
      result: patch.result ?? (row.result_json ? safeJsonParse<Record<string, unknown>>(row.result_json, {}) : undefined),
      error: patch.error ?? row.error ?? undefined,
      createdAt: row.created_at,
      updatedAt,
    };
    this.gatewaySql.prepare(`
      UPDATE proactive_actions
      SET status = @status, result_json = @resultJson, error = @error, updated_at = @updatedAt
      WHERE action_id = @actionId
    `).run({
      actionId: next.actionId,
      status: next.status,
      resultJson: next.result ? JSON.stringify(next.result) : null,
      error: next.error ?? null,
      updatedAt,
    });
    return next;
  }

  private resolveProactiveAction(
    action: ProactiveActionRecord,
    remainingHourBudget: number,
    remainingTurnBudget: number,
  ): { execute: boolean; reason?: string } {
    if (remainingHourBudget <= 0) {
      return { execute: false, reason: "Autonomy hour budget exhausted." };
    }
    if (remainingTurnBudget <= 0) {
      return { execute: false, reason: "Autonomy turn budget exhausted." };
    }
    if (action.kind !== "tool" || !action.toolName) {
      return { execute: false, reason: "Only safe tool actions are eligible for auto execution." };
    }
    if (!PROACTIVE_SAFE_TOOL_ALLOWLIST.has(action.toolName)) {
      return { execute: false, reason: `Tool ${action.toolName} is not allowlisted for auto_safe mode.` };
    }
    return { execute: true };
  }

  private async executeProactiveToolAction(action: ProactiveActionRecord): Promise<ProactiveActionRecord> {
    if (!action.toolName) {
      return this.updateProactiveAction(action.actionId, {
        status: "blocked",
        error: "Missing tool name.",
      });
    }
    try {
      const result = await this.invokeTool({
        toolName: action.toolName,
        args: action.args ?? {},
        agentId: "proactive",
        sessionId: action.sessionId,
        consentContext: {
          source: "agent",
          reason: "proactive auto_safe execution",
        },
      });
      if (result.outcome === "executed") {
        return this.updateProactiveAction(action.actionId, {
          status: "executed",
          result: result.result ?? {},
        });
      }
      if (result.outcome === "approval_required") {
        return this.updateProactiveAction(action.actionId, {
          status: "blocked",
          error: "Approval required by policy.",
          result: {
            approvalId: result.approvalId,
            policyReason: result.policyReason,
          },
        });
      }
      return this.updateProactiveAction(action.actionId, {
        status: "blocked",
        error: result.policyReason,
      });
    } catch (error) {
      return this.updateProactiveAction(action.actionId, {
        status: "failed",
        error: (error as Error).message,
      });
    }
  }

  private touchSessionProactiveTick(sessionId: string, runId: string): void {
    this.storage.sessionAutonomyPrefs.touch(sessionId, runId);
  }

  private async inferLatestUserObjective(sessionId: string): Promise<string> {
    const messages = await this.listChatMessages(sessionId, 40);
    const latestUser = [...messages].reverse().find((item) => item.role === "user");
    return latestUser?.content ?? "";
  }

  private computeDelegationSuggestionConfidence(objective: string, roles: string[]): number {
    let score = roles.length >= 3 ? 0.84 : roles.length >= 2 ? 0.72 : 0.58;
    if (/\b(prd|architecture|implement|qa|ops|handoff)\b/i.test(objective)) {
      score += 0.12;
    }
    return clamp01(score);
  }

  private extractAndPersistLearnedMemory(
    sessionId: string,
    content: string,
    source: {
      role: "user" | "assistant";
      sourceRef: string;
      trace?: Pick<ChatTurnTraceRecord, "status" | "toolRuns">;
    },
  ): void {
    if (!shouldExtractLearnedMemoryContent(content, source)) {
      return;
    }
    const candidates = extractLearnedMemoryCandidates(content, source.role);
    for (const candidate of candidates) {
      if (looksSensitive(candidate.content)) {
        this.insertLearnedMemoryItem({
          sessionId,
          itemType: candidate.itemType,
          content: "[REDACTED]",
          confidence: candidate.confidence,
          status: "dropped",
          redacted: true,
          sourceKind: source.role,
          sourceRef: source.sourceRef,
          snippet: "Dropped due to secret redaction policy.",
        });
        continue;
      }
      this.upsertLearnedMemoryItem({
        sessionId,
        itemType: candidate.itemType,
        content: candidate.content,
        confidence: candidate.confidence,
        sourceKind: source.role,
        sourceRef: source.sourceRef,
        snippet: candidate.content.slice(0, 240),
      });
    }
  }

  private insertLearnedMemoryItem(input: {
    sessionId: string;
    itemType: LearnedMemoryItemType;
    content: string;
    confidence: number;
    status: LearnedMemoryItemRecord["status"];
    redacted: boolean;
    sourceKind: string;
    sourceRef: string;
    snippet: string;
  }): LearnedMemoryItemRecord {
    const now = new Date().toISOString();
    const itemId = randomUUID();
    this.gatewaySql.prepare(`
      INSERT INTO learned_memory_items (
        item_id, session_id, item_type, content, confidence, status, superseded_by_item_id,
        redacted, disabled_reason, created_at, updated_at
      ) VALUES (
        @itemId, @sessionId, @itemType, @content, @confidence, @status, NULL,
        @redacted, NULL, @createdAt, @updatedAt
      )
    `).run({
      itemId,
      sessionId: input.sessionId,
      itemType: input.itemType,
      content: input.content,
      confidence: clamp01(input.confidence),
      status: input.status,
      redacted: input.redacted ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
    this.gatewaySql.prepare(`
      INSERT INTO learned_memory_sources (source_id, item_id, source_kind, source_ref, snippet, created_at)
      VALUES (@sourceId, @itemId, @sourceKind, @sourceRef, @snippet, @createdAt)
    `).run({
      sourceId: randomUUID(),
      itemId,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      snippet: input.snippet,
      createdAt: now,
    });
    return {
      itemId,
      sessionId: input.sessionId,
      itemType: input.itemType,
      content: input.content,
      confidence: clamp01(input.confidence),
      status: input.status,
      redacted: input.redacted,
      createdAt: now,
      updatedAt: now,
    };
  }

  private upsertLearnedMemoryItem(input: {
    sessionId: string;
    itemType: LearnedMemoryItemType;
    content: string;
    confidence: number;
    sourceKind: string;
    sourceRef: string;
    snippet: string;
  }): void {
    const normalized = normalizeMemoryText(input.content);
    if (!normalized) {
      return;
    }
    const existing = this.gatewaySql.prepare(`
      SELECT *
      FROM learned_memory_items
      WHERE session_id = @sessionId
        AND item_type = @itemType
        AND status IN ('active', 'conflict')
      ORDER BY updated_at DESC
      LIMIT 5
    `).all({
      sessionId: input.sessionId,
      itemType: input.itemType,
    }) as Array<{
      item_id: string;
      content: string;
      confidence: number;
      status: LearnedMemoryItemRecord["status"];
    }>;

    const duplicate = existing.find((row) => normalizeMemoryText(row.content) === normalized);
    if (duplicate) {
      this.gatewaySql.prepare(`
        UPDATE learned_memory_items
        SET confidence = @confidence, updated_at = @updatedAt
        WHERE item_id = @itemId
      `).run({
        itemId: duplicate.item_id,
        confidence: Math.max(clamp01(input.confidence), Number(duplicate.confidence || 0)),
        updatedAt: new Date().toISOString(),
      });
      this.gatewaySql.prepare(`
        INSERT INTO learned_memory_sources (source_id, item_id, source_kind, source_ref, snippet, created_at)
        VALUES (@sourceId, @itemId, @sourceKind, @sourceRef, @snippet, @createdAt)
      `).run({
        sourceId: randomUUID(),
        itemId: duplicate.item_id,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef,
        snippet: input.snippet,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    const current = existing[0];
    if (current) {
      const overlap = memoryTextOverlap(normalized, normalizeMemoryText(current.content));
      const incomingConfidence = clamp01(input.confidence);
      const existingConfidence = clamp01(Number(current.confidence || 0));
      if (overlap < 0.45) {
        const diff = Math.abs(incomingConfidence - existingConfidence);
        if (diff < 0.2) {
          const incomingItem = this.insertLearnedMemoryItem({
            sessionId: input.sessionId,
            itemType: input.itemType,
            content: input.content,
            confidence: incomingConfidence,
            status: "conflict",
            redacted: false,
            sourceKind: input.sourceKind,
            sourceRef: input.sourceRef,
            snippet: input.snippet,
          });
          this.gatewaySql.prepare(`
            INSERT INTO learned_memory_conflicts (
              conflict_id, session_id, item_type, existing_item_id, incoming_item_id, incoming_content,
              status, resolution_note, created_at, resolved_at
            ) VALUES (
              @conflictId, @sessionId, @itemType, @existingItemId, @incomingItemId, @incomingContent,
              'open', NULL, @createdAt, NULL
            )
          `).run({
            conflictId: randomUUID(),
            sessionId: input.sessionId,
            itemType: input.itemType,
            existingItemId: current.item_id,
            incomingItemId: incomingItem.itemId,
            incomingContent: input.content,
            createdAt: new Date().toISOString(),
          });
          return;
        }
        if (incomingConfidence > existingConfidence + 0.2) {
          const next = this.insertLearnedMemoryItem({
            sessionId: input.sessionId,
            itemType: input.itemType,
            content: input.content,
            confidence: incomingConfidence,
            status: "active",
            redacted: false,
            sourceKind: input.sourceKind,
            sourceRef: input.sourceRef,
            snippet: input.snippet,
          });
          this.gatewaySql.prepare(`
            UPDATE learned_memory_items
            SET status = 'superseded', superseded_by_item_id = @supersededByItemId, updated_at = @updatedAt
            WHERE item_id = @itemId
          `).run({
            itemId: current.item_id,
            supersededByItemId: next.itemId,
            updatedAt: new Date().toISOString(),
          });
          return;
        }
      }
    }

    this.insertLearnedMemoryItem({
      sessionId: input.sessionId,
      itemType: input.itemType,
      content: input.content,
      confidence: clamp01(input.confidence),
      status: "active",
      redacted: false,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      snippet: input.snippet,
    });
  }

  private getPromptRunnerModelDefaults(): { providerId?: string; model?: string } {
    const runtime = this.llmService.getRuntimeConfig({
      includeKeychainForActiveProvider: true,
      useCache: true,
    });
    const glm = runtime.providers.find((provider) => provider.providerId === "glm" && provider.hasApiKey);
    if (glm) {
      return {
        providerId: glm.providerId,
        model: glm.defaultModel || "glm-5",
      };
    }
    const kimi = runtime.providers.find((provider) => provider.providerId === "moonshot" && provider.hasApiKey);
    if (kimi) {
      return {
        providerId: kimi.providerId,
        model: kimi.defaultModel,
      };
    }
    const active = runtime.providers.find((provider) => provider.providerId === runtime.activeProviderId);
    return {
      providerId: active?.providerId ?? runtime.activeProviderId,
      model: runtime.activeModel,
    };
  }

  private ensureChatSessionRuntimeGrants(sessionId: string): void {
    const existing = this.listToolGrants("session", sessionId, 1000);
    const active = existing.filter((grant) => isActiveToolGrant(grant));
    const inheritedDeny = [
      ...this.listToolGrants("global", "global", 1000),
      ...this.listToolGrants("agent", "assistant", 1000),
    ].filter((grant) => isActiveToolGrant(grant) && grant.decision === "deny");
    for (const toolName of CHAT_SESSION_AUTO_ALLOW_TOOLS) {
      const deniedByInheritedScope = inheritedDeny.some((grant) => grantPatternMatches(grant.toolPattern, toolName));
      if (deniedByInheritedScope) {
        continue;
      }
      const hasDeny = active.some((grant) => grant.decision === "deny" && grantPatternMatches(grant.toolPattern, toolName));
      if (hasDeny) {
        continue;
      }
      const hasAllow = active.some((grant) => grant.decision === "allow" && grantPatternMatches(grant.toolPattern, toolName));
      if (hasAllow) {
        continue;
      }
      this.createToolGrant({
        toolPattern: toolName,
        decision: "allow",
        scope: "session",
        scopeRef: sessionId,
        grantType: "persistent",
        createdBy: "system-chat-agent-bootstrap",
      });
    }
  }

  public listChatCommandCatalog(): Array<{
    command: string;
    usage: string;
    description: string;
  }> {
    return [
      { command: "/mode", usage: "/mode chat|cowork|code", description: "Switch session mode." },
      { command: "/plan", usage: "/plan [on|off]", description: "Show or set advisory planning mode." },
      { command: "/model", usage: "/model <model-id>", description: "Override model for this session." },
      { command: "/web", usage: "/web auto|off|quick|deep", description: "Set web retrieval behavior." },
      { command: "/memory", usage: "/memory auto|on|off", description: "Set memory behavior." },
      { command: "/think", usage: "/think minimal|standard|extended", description: "Set thinking depth." },
      { command: "/tool", usage: "/tool safe_auto|manual", description: "Set tool autonomy mode." },
      { command: "/proactive", usage: "/proactive off|suggest|auto_safe", description: "Set proactive mode." },
      { command: "/retrieval", usage: "/retrieval standard|layered", description: "Set retrieval routing mode." },
      { command: "/reflect", usage: "/reflect off|on", description: "Toggle reflection retry mode." },
      { command: "/research", usage: "/research <query>", description: "Run quick research for current session." },
      { command: "/delegate", usage: "/delegate <role1,role2,...> :: <objective>", description: "Run task-backed role delegation." },
      { command: "/pipeline", usage: "/pipeline prd|build|triage|release :: <objective>", description: "Run a built-in delegation template." },
      { command: "/score", usage: "/score <TEST-##> <routing> <honesty> <handoff> <robustness> <usability>", description: "Score the latest run for a prompt-pack test." },
      { command: "/pack", usage: "/pack run <TEST-##|all>", description: "Run prompt-pack tests from Prompt Lab." },
      { command: "/skills", usage: "/skills", description: "List installed skills and their runtime state." },
      { command: "/skill", usage: "/skill enable|sleep|disable <skillId>", description: "Change an installed skill's runtime state." },
      { command: "/skill", usage: "/skill search <query>", description: "Search skill import sources." },
      { command: "/skill", usage: "/skill lookup <query-or-url>", description: "Resolve the best-fit skill source or listing." },
      { command: "/skill", usage: "/skill install <sourceRef> [--confirm-high-risk]", description: "Validate and install a skill, disabled by default." },
      { command: "/mcp", usage: "/mcp", description: "List configured MCP servers and connection state." },
      { command: "/mcp", usage: "/mcp connect|disconnect <serverId>", description: "Connect or disconnect a configured MCP server." },
      { command: "/mcp", usage: "/mcp templates [query]", description: "List known MCP server templates." },
      { command: "/mcp", usage: "/mcp add-template <templateId>", description: "Add an MCP template definition in a disconnected state." },
      { command: "/project", usage: "/project <project-id|none>", description: "Assign or clear this session project." },
      { command: "/attach", usage: "/attach <attachment-id>", description: "Reference an attachment id in your next send." },
      { command: "/run", usage: "/run research <query>", description: "Run a named workflow from chat." },
      { command: "/approve", usage: "/approve <approval-id>", description: "Approve a pending inline tool request." },
      { command: "/deny", usage: "/deny <approval-id>", description: "Deny a pending inline tool request." },
      { command: "/help", usage: "/help", description: "Show command catalog." },
    ];
  }

  public async parseChatCommand(
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
    this.getSession(sessionId);
    const parsed = parseSlashCommand(commandText);
    if (!parsed) {
      return {
        ok: false,
        command: "",
        args: [],
        message: "Command must start with '/'.",
      };
    }

    const [head, ...args] = parsed;
    const command = (head ?? "").toLowerCase();
    if (!command) {
      return {
        ok: false,
        command: "",
        args: [],
        message: "Command must include a command name after '/'.",
      };
    }

    if (command === "/help") {
      const help = this.listChatCommandCatalog()
        .map((item) => `${item.usage} - ${item.description}`)
        .join("\n");
      return {
        ok: true,
        command,
        args,
        message: help,
      };
    }

    if (command === "/mode") {
      const mode = (args[0] ?? "").toLowerCase() as ChatMode;
      if (mode !== "chat" && mode !== "cowork" && mode !== "code") {
        return { ok: false, command, args, message: "Usage: /mode chat|cowork|code" };
      }
      const prefs = this.updateChatSessionPrefs(sessionId, { mode });
      return { ok: true, command, args, prefs, message: `Mode set to ${prefs.mode}.` };
    }

    if (command === "/plan") {
      const next = (args[0] ?? "").toLowerCase();
      if (!next) {
        const prefs = this.getChatSessionPrefs(sessionId);
        return {
          ok: true,
          command,
          args,
          prefs,
          message: `Planning mode is ${prefs.planningMode}.`,
        };
      }
      if (next !== "on" && next !== "off") {
        return { ok: false, command, args, message: "Usage: /plan [on|off]" };
      }
      const prefs = this.updateChatSessionPrefs(sessionId, {
        planningMode: next === "on" ? "advisory" : "off",
      });
      return {
        ok: true,
        command,
        args,
        prefs,
        message: `Planning mode set to ${prefs.planningMode}.`,
      };
    }

    if (command === "/model") {
      const model = args.join(" ").trim();
      if (!model) {
        return { ok: false, command, args, message: "Usage: /model <model-id>" };
      }
      const prefs = this.updateChatSessionPrefs(sessionId, { model });
      return { ok: true, command, args, prefs, message: `Model set to ${prefs.model}.` };
    }

    if (command === "/web") {
      const webMode = (args[0] ?? "").toLowerCase() as ChatWebMode;
      if (!["auto", "off", "quick", "deep"].includes(webMode)) {
        return { ok: false, command, args, message: "Usage: /web auto|off|quick|deep" };
      }
      const prefs = this.updateChatSessionPrefs(sessionId, { webMode });
      return { ok: true, command, args, prefs, message: `Web mode set to ${prefs.webMode}.` };
    }

    if (command === "/memory") {
      const memoryMode = (args[0] ?? "").toLowerCase() as "auto" | "on" | "off";
      if (!["auto", "on", "off"].includes(memoryMode)) {
        return { ok: false, command, args, message: "Usage: /memory auto|on|off" };
      }
      const prefs = this.updateChatSessionPrefs(sessionId, { memoryMode });
      return { ok: true, command, args, prefs, message: `Memory mode set to ${prefs.memoryMode}.` };
    }

    if (command === "/think") {
      const thinkingLevel = (args[0] ?? "").toLowerCase() as ChatThinkingLevel;
      if (!["minimal", "standard", "extended"].includes(thinkingLevel)) {
        return { ok: false, command, args, message: "Usage: /think minimal|standard|extended" };
      }
      const prefs = this.updateChatSessionPrefs(sessionId, { thinkingLevel });
      return { ok: true, command, args, prefs, message: `Thinking level set to ${prefs.thinkingLevel}.` };
    }

    if (command === "/tool") {
      const toolAutonomy = (args[0] ?? "").toLowerCase() as "safe_auto" | "manual";
      if (!["safe_auto", "manual"].includes(toolAutonomy)) {
        return { ok: false, command, args, message: "Usage: /tool safe_auto|manual" };
      }
      const prefs = this.updateChatSessionPrefs(sessionId, { toolAutonomy });
      return { ok: true, command, args, prefs, message: `Tool autonomy set to ${prefs.toolAutonomy}.` };
    }

    if (command === "/proactive") {
      const proactiveMode = (args[0] ?? "").toLowerCase() as ChatProactiveMode;
      if (!["off", "suggest", "auto_safe"].includes(proactiveMode)) {
        return { ok: false, command, args, message: "Usage: /proactive off|suggest|auto_safe" };
      }
      const policy = this.updateChatSessionProactivePolicy(sessionId, { proactiveMode });
      const prefs = this.getChatSessionPrefs(sessionId);
      return {
        ok: true,
        command,
        args,
        prefs,
        message: `Proactive mode set to ${policy.mode}.`,
      };
    }

    if (command === "/retrieval") {
      const retrievalMode = (args[0] ?? "").toLowerCase() as ChatRetrievalMode;
      if (!["standard", "layered"].includes(retrievalMode)) {
        return { ok: false, command, args, message: "Usage: /retrieval standard|layered" };
      }
      this.updateChatSessionProactivePolicy(sessionId, { retrievalMode });
      const prefs = this.getChatSessionPrefs(sessionId);
      return {
        ok: true,
        command,
        args,
        prefs,
        message: `Retrieval mode set to ${retrievalMode}.`,
      };
    }

    if (command === "/reflect") {
      const reflectionMode = (args[0] ?? "").toLowerCase() as ChatReflectionMode;
      if (!["off", "on"].includes(reflectionMode)) {
        return { ok: false, command, args, message: "Usage: /reflect off|on" };
      }
      this.updateChatSessionProactivePolicy(sessionId, { reflectionMode });
      const prefs = this.getChatSessionPrefs(sessionId);
      return {
        ok: true,
        command,
        args,
        prefs,
        message: `Reflection mode set to ${reflectionMode}.`,
      };
    }

    if (command === "/research") {
      const query = args.join(" ").trim();
      if (!query) {
        return { ok: false, command, args, message: "Usage: /research <query>" };
      }
      const research = await this.runChatResearch(sessionId, {
        query,
        mode: "quick",
      });
      return {
        ok: true,
        command,
        args,
        research,
        message: research.summary,
      };
    }

    if (command === "/delegate") {
      const { roles, objective, error } = parseDelegateCommand(commandText);
      if (error || !objective || roles.length === 0) {
        return { ok: false, command, args, message: "Usage: /delegate <role1,role2,...> :: <objective>" };
      }
      const run = await this.runChatDelegation(sessionId, {
        objective,
        roles,
        mode: "sequential",
      });
      return {
        ok: true,
        command,
        args,
        message: `Delegation ${run.runId} completed with ${run.steps.length} steps.`,
      };
    }

    if (command === "/pipeline") {
      const parsedPipeline = parsePipelineCommand(commandText);
      if (!parsedPipeline) {
        return { ok: false, command, args, message: "Usage: /pipeline prd|build|triage|release :: <objective>" };
      }
      const run = await this.runChatDelegation(sessionId, {
        objective: parsedPipeline.objective,
        roles: parsedPipeline.roles,
        mode: "sequential",
      });
      return {
        ok: true,
        command,
        args,
        message: `Pipeline ${parsedPipeline.template} completed (${run.steps.length} steps).`,
      };
    }

    if (command === "/score") {
      const [testCodeRaw, routingRaw, honestyRaw, handoffRaw, robustnessRaw, usabilityRaw, ...noteParts] = args;
      if (!testCodeRaw || [routingRaw, honestyRaw, handoffRaw, robustnessRaw, usabilityRaw].some((item) => item === undefined)) {
        return {
          ok: false,
          command,
          args,
          message: "Usage: /score <TEST-##> <routing> <honesty> <handoff> <robustness> <usability>",
        };
      }
      const score = await this.scorePromptPackLatestRunByCode({
        sessionId,
        testCode: normalizePromptTestCode(testCodeRaw),
        routingScore: clampPromptScore(routingRaw!),
        honestyScore: clampPromptScore(honestyRaw!),
        handoffScore: clampPromptScore(handoffRaw!),
        robustnessScore: clampPromptScore(robustnessRaw!),
        usabilityScore: clampPromptScore(usabilityRaw!),
        notes: noteParts.join(" ").trim() || undefined,
      });
      return {
        ok: true,
        command,
        args,
        message: `Scored ${testCodeRaw}: total ${score.totalScore}/10.`,
      };
    }

    if (command === "/pack") {
      const subcommand = (args[0] ?? "").toLowerCase();
      if (subcommand !== "run") {
        return { ok: false, command, args, message: "Usage: /pack run <TEST-##|all>" };
      }
      const selector = normalizePromptTestCode(args[1] ?? "all");
      const results = await this.runPromptPackFromChat(sessionId, selector);
      return {
        ok: true,
        command,
        args,
        message: `Prompt pack run complete: ${results.length} test(s) executed.`,
      };
    }

    if (command === "/skills") {
      const skills = this.listSkills();
      if (skills.length === 0) {
        return { ok: true, command, args, message: "No installed skills found." };
      }
      return {
        ok: true,
        command,
        args,
        message: skills
          .slice(0, 20)
          .map((skill) => `- ${skill.skillId} [${skill.state}]${skill.note ? ` - ${skill.note}` : ""}`)
          .join("\n"),
      };
    }

    if (command === "/skill") {
      const action = (args[0] ?? "").toLowerCase();
      if (action === "enable" || action === "sleep" || action === "disable") {
        const skillId = args.slice(1).join(" ").trim();
        if (!skillId) {
          return { ok: false, command, args, message: `Usage: /skill ${action} <skillId>` };
        }
        const state = action === "enable" ? "enabled" : action === "sleep" ? "sleep" : "disabled";
        const updated = this.setSkillState(skillId, state, `Updated from chat command ${commandText.trim()}`);
        return {
          ok: true,
          command,
          args,
          message: `Skill ${updated.skillId} is now ${updated.state}.`,
        };
      }
      if (action === "search") {
        const query = args.slice(1).join(" ").trim();
        if (!query) {
          return { ok: false, command, args, message: "Usage: /skill search <query>" };
        }
        const results = await this.listSkillSources(query, 5);
        if (results.items.length === 0) {
          return { ok: true, command, args, message: `No skill source matches found for "${query}".` };
        }
        return {
          ok: true,
          command,
          args,
          message: results.items
            .slice(0, 5)
            .map((item) => {
              const reason = item.matchReason ? ` - ${item.matchReason}` : "";
              const installability = item.installability ? ` [${item.installability}]` : "";
              return `- ${item.name} (${item.sourceProvider}${installability})${reason} - ${item.sourceUrl}`;
            })
            .join("\n"),
        };
      }
      if (action === "lookup") {
        const query = args.slice(1).join(" ").trim();
        if (!query) {
          return { ok: false, command, args, message: "Usage: /skill lookup <query-or-url>" };
        }
        const result = await this.lookupSkillSources(query, 5);
        const bestMatch = result.bestMatch ?? result.items[0];
        if (!bestMatch) {
          return { ok: true, command, args, message: `No skill source resolution found for "${query}".` };
        }
        const lines = [
          `Best match: ${bestMatch.name} (${bestMatch.sourceProvider})`,
          `Why: ${bestMatch.matchReason ?? "best ranked match"}`,
          `Installability: ${bestMatch.installability ?? "review_only"}`,
          `Source: ${bestMatch.sourceUrl}`,
        ];
        if (bestMatch.upstreamUrl && bestMatch.upstreamUrl !== bestMatch.sourceUrl) {
          lines.push(`Upstream: ${bestMatch.upstreamUrl}`);
        }
        if (bestMatch.installHint) {
          lines.push(`Next step: ${bestMatch.installHint}`);
        }
        return {
          ok: true,
          command,
          args,
          message: lines.join("\n"),
        };
      }
      if (action === "install") {
        const confirmHighRisk = args.includes("--confirm-high-risk");
        const sourceRef = args
          .filter((item) => item !== "--confirm-high-risk")
          .slice(1)
          .join(" ")
          .trim();
        if (!sourceRef) {
          return {
            ok: false,
            command,
            args,
            message: "Usage: /skill install <sourceRef> [--confirm-high-risk]",
          };
        }
        const validation = await this.validateSkillImport({ sourceRef });
        if (!validation.valid) {
          return {
            ok: false,
            command,
            args,
            message: `Skill import rejected: ${validation.errors.join("; ") || "validation failed"}`,
          };
        }
        if (validation.riskLevel === "high" && !confirmHighRisk) {
          return {
            ok: false,
            command,
            args,
            message: "High-risk skill import requires --confirm-high-risk.",
          };
        }
        const installed = await this.installSkillImport({ sourceRef, confirmHighRisk });
        return {
          ok: true,
          command,
          args,
          message: `Installed ${installed.installedSkillId ?? validation.inferredSkillName ?? sourceRef}. Skill starts disabled by default.`,
        };
      }
      return {
        ok: false,
        command,
        args,
        message: "Usage: /skill enable|sleep|disable <skillId> | /skill search <query> | /skill lookup <query-or-url> | /skill install <sourceRef> [--confirm-high-risk]",
      };
    }

    if (command === "/mcp") {
      const action = (args[0] ?? "").toLowerCase();
      if (!action) {
        const servers = this.listMcpServers();
        if (servers.length === 0) {
          return { ok: true, command, args, message: "No MCP servers configured." };
        }
        return {
          ok: true,
          command,
          args,
          message: servers
            .slice(0, 20)
            .map((server) => `- ${server.serverId} ${server.label} [${server.status}]${server.enabled ? "" : " disabled"}`)
            .join("\n"),
        };
      }
      if (action === "connect" || action === "disconnect") {
        const serverId = args.slice(1).join(" ").trim();
        if (!serverId) {
          return { ok: false, command, args, message: `Usage: /mcp ${action} <serverId>` };
        }
        const updated = action === "connect"
          ? this.connectMcpServer(serverId)
          : this.disconnectMcpServer(serverId);
        return {
          ok: true,
          command,
          args,
          message: `MCP server ${updated.serverId} is now ${updated.status}.`,
        };
      }
      if (action === "templates") {
        const query = args.slice(1).join(" ").trim().toLowerCase();
        const templates = this.listMcpTemplates()
          .filter((template) => {
            if (!query) {
              return true;
            }
            const haystack = `${template.templateId} ${template.label} ${template.description}`.toLowerCase();
            return haystack.includes(query);
          });
        if (templates.length === 0) {
          return { ok: true, command, args, message: query ? `No MCP templates match "${query}".` : "No MCP templates available." };
        }
        return {
          ok: true,
          command,
          args,
          message: templates
            .slice(0, 10)
            .map((template) => `- ${template.templateId} ${template.label}${template.installed ? " [installed]" : ""}`)
            .join("\n"),
        };
      }
      if (action === "add-template") {
        const templateId = args.slice(1).join(" ").trim().toLowerCase();
        if (!templateId) {
          return { ok: false, command, args, message: "Usage: /mcp add-template <templateId>" };
        }
        const template = MCP_SERVER_TEMPLATES.find((item) => item.templateId.toLowerCase() === templateId);
        if (!template) {
          return { ok: false, command, args, message: `Unknown MCP template ${templateId}.` };
        }
        const existing = this.listMcpServers().find((server) => server.label.toLowerCase() === template.label.toLowerCase());
        if (existing) {
          return {
            ok: true,
            command,
            args,
            message: `MCP template ${template.templateId} already exists as ${existing.serverId}.`,
          };
        }
        const created = this.createMcpServer({
          label: template.label,
          transport: template.transport,
          command: template.command,
          args: template.args,
          url: template.url,
          authType: template.authType,
          enabled: false,
          category: template.category,
          trustTier: template.trustTier,
          costTier: template.costTier,
          policy: template.policy,
        });
        return {
          ok: true,
          command,
          args,
          message: `Added MCP template ${template.templateId} as ${created.serverId}. It is disconnected until you connect it.`,
        };
      }
      return {
        ok: false,
        command,
        args,
        message: "Usage: /mcp | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp templates [query] | /mcp add-template <templateId>",
      };
    }

    if (command === "/project") {
      const nextProject = args.join(" ").trim();
      const updated = this.assignChatSessionProject(
        sessionId,
        !nextProject || nextProject === "none" ? undefined : nextProject,
      );
      return {
        ok: true,
        command,
        args,
        message: updated.projectId
          ? `Session assigned to project ${updated.projectId}.`
          : "Session project cleared.",
      };
    }

    if (command === "/attach") {
      const attachmentId = args.join(" ").trim();
      if (!attachmentId) {
        return { ok: false, command, args, message: "Usage: /attach <attachment-id>" };
      }
      return {
        ok: true,
        command,
        args,
        message: `Attachment ${attachmentId} noted. Include it in your next message send.`,
      };
    }

    if (command === "/run") {
      const workflow = (args[0] ?? "").toLowerCase();
      if (workflow !== "research") {
        return { ok: false, command, args, message: "Usage: /run research <query>" };
      }
      const query = args.slice(1).join(" ").trim();
      if (!query) {
        return { ok: false, command, args, message: "Usage: /run research <query>" };
      }
      const research = await this.runChatResearch(sessionId, {
        query,
        mode: "quick",
      });
      return {
        ok: true,
        command,
        args,
        research,
        message: research.summary,
      };
    }

    if (command === "/approve") {
      const approvalId = args[0]?.trim();
      if (!approvalId) {
        return { ok: false, command, args, message: "Usage: /approve <approval-id>" };
      }
      await this.resolveChatToolApproval(sessionId, approvalId, "approve");
      return { ok: true, command, args, message: `Approved ${approvalId}.` };
    }

    if (command === "/deny") {
      const approvalId = args[0]?.trim();
      if (!approvalId) {
        return { ok: false, command, args, message: "Usage: /deny <approval-id>" };
      }
      await this.resolveChatToolApproval(sessionId, approvalId, "reject");
      return { ok: true, command, args, message: `Denied ${approvalId}.` };
    }

    return {
      ok: false,
      command,
      args,
      message: `Unknown command ${command}. Use /help.`,
    };
  }

  public async runChatResearch(
    sessionId: string,
    input: {
      query: string;
      mode: "quick" | "deep";
      providerId?: string;
      model?: string;
    },
  ): Promise<ResearchSummaryRecord> {
    this.getSession(sessionId);
    this.ensureChatSessionRuntimeGrants(sessionId);
    return this.researchService.run({
      sessionId,
      query: input.query,
      mode: input.mode,
      providerId: input.providerId,
      model: input.model,
    });
  }

  public getChatResearchRun(
    sessionId: string,
    runId: string,
  ): {
    run: ResearchRunRecord;
    sources: ResearchSourceRecord[];
  } {
    return this.researchService.getRun(sessionId, runId);
  }

  public async runChatDelegation(
    sessionId: string,
    input: ChatDelegateRequest,
  ): Promise<ChatDelegateResponse> {
    this.getSession(sessionId);
    const objective = input.objective.trim();
    if (!objective) {
      throw new Error("objective is required");
    }
    const roles = normalizeDelegationRoles(input.roles);
    if (roles.length === 0) {
      throw new Error("at least one role is required");
    }
    const mode = input.mode ?? "sequential";
    const prefs = this.ensureGlmPrimaryDefaults(sessionId, this.storage.chatSessionPrefs.ensure(sessionId));
    const providerId = input.providerId ?? prefs.providerId;
    const model = input.model ?? prefs.model;
    const sessionWorkspaceId = this.normalizeWorkspaceId(this.storage.chatSessionMeta.ensure(sessionId).workspaceId);

    const task = this.createTask({
      workspaceId: sessionWorkspaceId,
      title: `Delegation: ${objective.slice(0, 120)}`,
      description: objective,
      status: "in_progress",
      priority: "normal",
      createdBy: "chat",
    });

    const runId = randomUUID();
    this.storage.chatDelegationRuns.create({
      runId,
      sessionId,
      taskId: task.taskId,
      objective,
      roles,
      mode,
      providerId,
      model,
      status: "running",
      citations: [],
    });
    this.appendTaskActivity(task.taskId, {
      activityType: "comment",
      message: `Delegation started (${roles.join(" -> ")})`,
      metadata: { runId, sessionId, mode },
    });

    const stitchedSections: string[] = [];
    const citations: ChatCitationRecord[] = [];
    let trace: ChatTurnTraceRecord["routing"] | undefined;
    let failures = 0;
    const sharedContext: Array<{ role: string; output: string }> = [];

    for (let index = 0; index < roles.length; index += 1) {
      const role = roles[index]!;
      const stepId = randomUUID();
      const startedAt = new Date().toISOString();
      this.storage.chatDelegationSteps.create({
        stepId,
        runId,
        role,
        index,
        status: "running",
        startedAt,
      });

      const agentSessionId = `delegate:${runId}:${index + 1}`;
      this.registerTaskSubagent(task.taskId, {
        agentSessionId,
        agentName: role,
      });

      try {
        const completion = await this.createChatCompletion({
          providerId,
          model,
          stream: false,
          memory: {
            enabled: true,
            mode: "qmd",
            sessionId,
          },
          messages: [
            {
              role: "system",
              content: buildDelegationSystemPrompt(role),
            },
            {
              role: "user",
              content: buildDelegationUserPrompt({
                objective,
                role,
                mode,
                sharedContext,
              }),
            },
          ],
        });
        const output = extractCompletionText(completion).trim() || "(no output returned)";
        const finishedAt = new Date().toISOString();
        this.storage.chatDelegationSteps.patch(stepId, {
          status: "completed",
          output,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
        });
        this.updateTaskSubagent(agentSessionId, {
          status: "completed",
          endedAt: finishedAt,
        });
        this.appendTaskActivity(task.taskId, {
          activityType: "comment",
          agentId: role,
          message: `${role} completed delegation step ${index + 1}/${roles.length}.`,
          metadata: { runId, stepId },
        });
        this.appendTaskDeliverable(task.taskId, {
          deliverableType: "artifact",
          title: `${toTitleCase(role)} step`,
          description: output.slice(0, 6000),
        });
        stitchedSections.push(`### ${toTitleCase(role)}\n${output}`);
        sharedContext.push({
          role,
          output: output.slice(0, 4000),
        });

        const completionRouting = readCompletionRouting(completion);
        if (completionRouting) {
          trace = {
            ...(trace ?? {}),
            ...completionRouting,
          };
        }

        const completionCitations = readCompletionCitations(completion);
        for (const citation of completionCitations) {
          citations.push(citation);
        }
      } catch (error) {
        failures += 1;
        const finishedAt = new Date().toISOString();
        const message = (error as Error).message;
        this.storage.chatDelegationSteps.patch(stepId, {
          status: "failed",
          error: message,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
        });
        this.updateTaskSubagent(agentSessionId, {
          status: "failed",
          endedAt: finishedAt,
        });
        this.appendTaskActivity(task.taskId, {
          activityType: "comment",
          agentId: role,
          message: `${role} failed delegation step ${index + 1}/${roles.length}: ${message}`,
          metadata: { runId, stepId, error: message },
        });
        stitchedSections.push(`### ${toTitleCase(role)}\nFAILED: ${message}`);
        if (mode === "parallel") {
          continue;
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const stitchedOutput = stitchedSections.join("\n\n").trim();
    const status: ChatDelegationRunRecord["status"] = failures === 0
      ? "completed"
      : stitchedSections.length > failures
        ? "partial"
        : "failed";
    this.storage.chatDelegationRuns.patch(runId, {
      status,
      stitchedOutput,
      citations,
      trace,
      finishedAt,
    });
    this.appendTaskActivity(task.taskId, {
      activityType: "comment",
      message: `Delegation ${status}.`,
      metadata: { runId, failures, steps: roles.length },
    });
    if (stitchedSections.length > 0) {
      this.updateTask(task.taskId, {
        status: status === "completed" ? "review" : "blocked",
      });
    } else {
      this.updateTask(task.taskId, {
        status: "blocked",
      });
    }

    this.extractAndPersistLearnedMemory(sessionId, objective, {
      role: "user",
      sourceRef: runId,
    });
    if (stitchedOutput.trim()) {
      this.extractAndPersistLearnedMemory(sessionId, stitchedOutput, {
        role: "assistant",
        sourceRef: runId,
      });
    }

    return {
      runId,
      taskId: task.taskId,
      steps: this.storage.chatDelegationSteps.listByRun(runId),
      stitchedOutput,
      citations,
      trace,
    };
  }

  public async *runChatDelegationStream(
    sessionId: string,
    input: ChatDelegateRequest,
  ): AsyncGenerator<{
    type: "status" | "step" | "done" | "error";
    runId?: string;
    taskId?: string;
    message?: string;
    step?: ChatDelegationStepRecord;
    result?: ChatDelegateResponse;
  }> {
    yield { type: "status", message: "Delegation started." };
    try {
      const result = await this.runChatDelegation(sessionId, input);
      for (const step of result.steps) {
        yield { type: "step", runId: result.runId, taskId: result.taskId, step };
      }
      yield { type: "done", runId: result.runId, taskId: result.taskId, result };
    } catch (error) {
      yield { type: "error", message: (error as Error).message };
    }
  }

  public getChatDelegationRun(
    sessionId: string,
    runId: string,
  ): {
    run: ChatDelegationRunRecord;
    steps: ChatDelegationStepRecord[];
  } {
    const run = this.storage.chatDelegationRuns.get(runId);
    if (run.sessionId !== sessionId) {
      throw new Error("Delegation run does not belong to this session.");
    }
    return {
      run,
      steps: this.storage.chatDelegationSteps.listByRun(runId),
    };
  }

  public getChatSessionProactiveStatus(sessionId: string): {
    policy: ProactivePolicy;
    idleSeconds: number;
    hasRunningTurn: boolean;
    pendingSuggestions: number;
    actionsLastHour: number;
    lastRun?: ProactiveRunRecord;
  } {
    this.getSession(sessionId);
    const policy = this.toProactivePolicy(sessionId, this.getSessionAutonomyPrefs(sessionId));
    const idleSeconds = this.getSessionIdleSeconds(sessionId);
    const hasRunningTurn = this.hasRunningTurn(sessionId);
    const pendingSuggestions = this.gatewaySql.prepare(
      "SELECT COUNT(*) AS count FROM proactive_actions WHERE session_id = ? AND status = 'suggested'",
    ).get(sessionId) as { count?: number } | undefined;
    const actionsLastHour = this.countProactiveActionsLastHour(sessionId);
    const lastRun = this.listChatSessionProactiveRuns(sessionId, 1)[0];
    return {
      policy,
      idleSeconds,
      hasRunningTurn,
      pendingSuggestions: Number(pendingSuggestions?.count ?? 0),
      actionsLastHour,
      lastRun,
    };
  }

  public updateChatSessionProactivePolicy(
    sessionId: string,
    input: Partial<{
      proactiveMode: ChatProactiveMode;
      autonomyBudget: {
        maxActionsPerHour?: number;
        maxActionsPerTurn?: number;
        cooldownSeconds?: number;
      };
      retrievalMode: ChatRetrievalMode;
      reflectionMode: ChatReflectionMode;
    }>,
  ): ProactivePolicy {
    this.getSession(sessionId);
    const next = this.patchSessionAutonomyPrefs(sessionId, {
      proactiveMode: input.proactiveMode,
      maxActionsPerHour: input.autonomyBudget?.maxActionsPerHour,
      maxActionsPerTurn: input.autonomyBudget?.maxActionsPerTurn,
      cooldownSeconds: input.autonomyBudget?.cooldownSeconds,
      retrievalMode: input.retrievalMode,
      reflectionMode: input.reflectionMode,
    });
    const policy = this.toProactivePolicy(sessionId, next);
    this.publishRealtime("system", "chat", {
      type: "proactive_policy_updated",
      sessionId,
      policy,
    });
    return policy;
  }

  public async triggerChatSessionProactive(
    sessionId: string,
    input: ProactiveTriggerInput = {},
  ): Promise<ProactiveRunRecord> {
    this.getSession(sessionId);
    const prefs = input.prefs ?? this.getSessionAutonomyPrefs(sessionId);
    const source = input.source ?? "manual";
    const now = new Date().toISOString();
    const runId = randomUUID();
    const initialRun: ProactiveRunRecord = {
      runId,
      sessionId,
      status: "running",
      mode: prefs.proactiveMode,
      confidence: 0,
      reasoningSummary: input.reason ?? `proactive tick (${source})`,
      suggestedActions: [],
      executedActions: [],
      startedAt: now,
    };
    this.insertProactiveRun(initialRun);
    this.publishRealtime("proactive_tick_started", "chat", {
      sessionId,
      runId,
      mode: prefs.proactiveMode,
      source,
    });

    if (prefs.proactiveMode === "off") {
      return this.finishProactiveRun(runId, {
        status: "no_action",
        confidence: 0,
        reasoningSummary: "Proactive mode is off.",
      });
    }

    if (this.hasRunningTurn(sessionId)) {
      return this.finishProactiveRun(runId, {
        status: "no_action",
        confidence: 0.2,
        reasoningSummary: "Skipped because a chat turn is still running.",
      });
    }

    const idleSeconds = this.getSessionIdleSeconds(sessionId);
    if (idleSeconds < PROACTIVE_MIN_IDLE_SECONDS) {
      return this.finishProactiveRun(runId, {
        status: "no_action",
        confidence: 0.2,
        reasoningSummary: `Skipped because session idle time (${idleSeconds}s) is below ${PROACTIVE_MIN_IDLE_SECONDS}s.`,
      });
    }

    const cooldownRemaining = this.getProactiveCooldownRemainingSeconds(prefs);
    if (cooldownRemaining > 0) {
      return this.finishProactiveRun(runId, {
        status: "no_action",
        confidence: 0.25,
        reasoningSummary: `Skipped because cooldown is active (${cooldownRemaining}s remaining).`,
      });
    }

    const plan = await this.planProactiveActions(sessionId);
    if (plan.actions.length === 0) {
      const completed = this.finishProactiveRun(runId, {
        status: "no_action",
        confidence: plan.confidence,
        reasoningSummary: plan.reasoningSummary,
      });
      this.publishRealtime("proactive_no_action", "chat", {
        sessionId,
        runId,
        reason: completed.reasoningSummary,
      });
      this.touchSessionProactiveTick(sessionId, runId);
      return completed;
    }

    const suggestedActions: ProactiveActionRecord[] = [];
    const executedActions: ProactiveActionRecord[] = [];
    for (const action of plan.actions) {
      const actionId = randomUUID();
      const base: ProactiveActionRecord = {
        actionId,
        runId,
        sessionId,
        kind: action.kind,
        status: "suggested",
        toolName: action.toolName,
        args: action.args,
        result: action.note
          ? { note: action.note }
          : action.objective
            ? { objective: action.objective, roles: action.roles }
            : undefined,
        createdAt: new Date().toISOString(),
      };
      suggestedActions.push(base);
      this.insertProactiveAction(base);
    }

    if (prefs.proactiveMode === "suggest") {
      const completed = this.finishProactiveRun(runId, {
        status: "suggested",
        confidence: plan.confidence,
        reasoningSummary: plan.reasoningSummary,
        suggestedActions,
        executedActions: [],
      });
      this.publishRealtime("proactive_suggestion_created", "chat", {
        sessionId,
        runId,
        actionCount: suggestedActions.length,
      });
      this.touchSessionProactiveTick(sessionId, runId);
      return completed;
    }

    const actionsLastHour = this.countProactiveActionsLastHour(sessionId);
    let remainingHourBudget = Math.max(0, prefs.maxActionsPerHour - actionsLastHour);
    let remainingTurnBudget = Math.max(0, prefs.maxActionsPerTurn);
    for (const action of suggestedActions) {
      const status = this.resolveProactiveAction(
        action,
        remainingHourBudget,
        remainingTurnBudget,
      );
      if (status.execute) {
        remainingHourBudget -= 1;
        remainingTurnBudget -= 1;
        const executed = await this.executeProactiveToolAction(action);
        executedActions.push(executed);
      } else {
        const blocked = this.updateProactiveAction(action.actionId, {
          status: "blocked",
          error: status.reason,
        });
        executedActions.push(blocked);
        this.publishRealtime("proactive_action_blocked", "chat", {
          sessionId,
          runId,
          actionId: action.actionId,
          reason: status.reason,
        });
      }
    }

    const executedCount = executedActions.filter((item) => item.status === "executed").length;
    const runStatus: ProactiveRunRecord["status"] = executedCount > 0 ? "executed" : "blocked";
    const completed = this.finishProactiveRun(runId, {
      status: runStatus,
      confidence: plan.confidence,
      reasoningSummary: plan.reasoningSummary,
      suggestedActions,
      executedActions,
    });
    if (executedCount > 0) {
      this.publishRealtime("proactive_action_executed", "chat", {
        sessionId,
        runId,
        actionCount: executedCount,
      });
    }
    this.touchSessionProactiveTick(sessionId, runId);
    return completed;
  }

  public listChatSessionProactiveRuns(sessionId: string, limit = 50): ProactiveRunRecord[] {
    this.getSession(sessionId);
    const rows = this.gatewaySql.prepare(`
      SELECT *
      FROM proactive_runs
      WHERE session_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(sessionId, Math.max(1, Math.min(limit, 500))) as Array<{
      run_id: string;
      session_id: string;
      status: ProactiveRunRecord["status"];
      mode: ChatProactiveMode;
      confidence: number;
      reasoning_summary: string;
      suggested_actions_json: string;
      executed_actions_json: string;
      started_at: string;
      finished_at: string | null;
      error: string | null;
    }>;
    return rows.map((row) => ({
      runId: row.run_id,
      sessionId: row.session_id,
      status: row.status,
      mode: row.mode,
      confidence: Number(row.confidence || 0),
      reasoningSummary: row.reasoning_summary || "",
      suggestedActions: safeJsonParse<ProactiveActionRecord[]>(row.suggested_actions_json, []),
      executedActions: safeJsonParse<ProactiveActionRecord[]>(row.executed_actions_json, []),
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      error: row.error ?? undefined,
    }));
  }

  public listChatSessionLearnedMemory(
    sessionId: string,
    limit = 200,
  ): {
    items: LearnedMemoryItemRecord[];
    conflicts: LearnedMemoryConflictRecord[];
  } {
    this.getSession(sessionId);
    const boundedLimit = Math.max(1, Math.min(limit, 1000));
    const itemRows = this.gatewaySql.prepare(`
      SELECT *
      FROM learned_memory_items
      WHERE session_id = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `).all(sessionId, boundedLimit) as Array<{
      item_id: string;
      session_id: string;
      item_type: LearnedMemoryItemType;
      content: string;
      confidence: number;
      status: LearnedMemoryItemRecord["status"];
      superseded_by_item_id: string | null;
      redacted: number;
      created_at: string;
      updated_at: string;
    }>;
    const conflictRows = this.gatewaySql.prepare(`
      SELECT *
      FROM learned_memory_conflicts
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, boundedLimit) as Array<{
      conflict_id: string;
      session_id: string;
      item_type: LearnedMemoryItemType;
      existing_item_id: string | null;
      incoming_item_id: string | null;
      incoming_content: string;
      status: LearnedMemoryConflictRecord["status"];
      resolution_note: string | null;
      created_at: string;
      resolved_at: string | null;
    }>;
    return {
      items: itemRows.map((row) => ({
        itemId: row.item_id,
        sessionId: row.session_id,
        itemType: row.item_type,
        content: row.content,
        confidence: Number(row.confidence || 0),
        status: row.status,
        supersededByItemId: row.superseded_by_item_id ?? undefined,
        redacted: row.redacted === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      conflicts: conflictRows.map((row) => ({
        conflictId: row.conflict_id,
        sessionId: row.session_id,
        itemType: row.item_type,
        existingItemId: row.existing_item_id ?? undefined,
        incomingItemId: row.incoming_item_id ?? undefined,
        incomingContent: row.incoming_content,
        status: row.status,
        resolutionNote: row.resolution_note ?? undefined,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at ?? undefined,
      })),
    };
  }

  public updateChatSessionLearnedMemory(
    sessionId: string,
    itemId: string,
    input: LearnedMemoryUpdateInput,
  ): LearnedMemoryItemRecord {
    this.getSession(sessionId);
    const row = this.gatewaySql.prepare(`
      SELECT * FROM learned_memory_items WHERE item_id = ?
    `).get(itemId) as {
      item_id: string;
      session_id: string;
      item_type: LearnedMemoryItemType;
      content: string;
      confidence: number;
      status: LearnedMemoryItemRecord["status"];
      superseded_by_item_id: string | null;
      redacted: number;
      created_at: string;
      updated_at: string;
    } | undefined;
    if (!row) {
      throw new Error(`Learned memory item ${itemId} not found.`);
    }
    if (row.session_id !== sessionId) {
      throw new Error("Learned memory item does not belong to this session.");
    }
    const nextStatus = input.status ?? row.status;
    const nextContent = input.content?.trim() || row.content;
    const nextConfidence = clamp01(typeof input.confidence === "number" ? input.confidence : row.confidence);
    const now = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE learned_memory_items
      SET status = @status, content = @content, confidence = @confidence, updated_at = @updatedAt
      WHERE item_id = @itemId
    `).run({
      itemId,
      status: nextStatus,
      content: nextContent,
      confidence: nextConfidence,
      updatedAt: now,
    });
    return {
      itemId: row.item_id,
      sessionId: row.session_id,
      itemType: row.item_type,
      content: nextContent,
      confidence: nextConfidence,
      status: nextStatus,
      supersededByItemId: row.superseded_by_item_id ?? undefined,
      redacted: row.redacted === 1,
      createdAt: row.created_at,
      updatedAt: now,
    };
  }

  public async rebuildChatSessionLearnedMemory(sessionId: string): Promise<{
    rebuiltAt: string;
    items: LearnedMemoryItemRecord[];
    conflicts: LearnedMemoryConflictRecord[];
  }> {
    this.getSession(sessionId);
    this.gatewaySql.prepare("DELETE FROM learned_memory_sources WHERE item_id IN (SELECT item_id FROM learned_memory_items WHERE session_id = ?)").run(sessionId);
    this.gatewaySql.prepare("DELETE FROM learned_memory_conflicts WHERE session_id = ?").run(sessionId);
    this.gatewaySql.prepare("DELETE FROM learned_memory_items WHERE session_id = ?").run(sessionId);

    const traceByMessageId = new Map<string, Pick<ChatTurnTraceRecord, "status" | "toolRuns">>();
    const traces = this.storage.chatTurnTraces.listBySession(sessionId, 5000);
    for (const trace of traces) {
      const traceContext = {
        status: trace.status,
        toolRuns: trace.toolRuns.length > 0 ? trace.toolRuns : this.storage.chatToolRuns.listByTurn(trace.turnId),
      } satisfies Pick<ChatTurnTraceRecord, "status" | "toolRuns">;
      traceByMessageId.set(trace.userMessageId, traceContext);
      if (trace.assistantMessageId) {
        traceByMessageId.set(trace.assistantMessageId, traceContext);
      }
    }

    const transcript = await this.readTranscriptOrEmpty(sessionId);
    for (const event of transcript) {
      if (event.type !== "message.user" && event.type !== "message.assistant") {
        continue;
      }
      const role = event.type === "message.user" ? "user" : "assistant";
      const content = extractStringFromUnknown((event.payload as { message?: { content?: unknown } })?.message?.content);
      if (!content.trim()) {
        continue;
      }
      this.extractAndPersistLearnedMemory(sessionId, content, {
        role,
        sourceRef: event.eventId,
        trace: traceByMessageId.get(event.eventId),
      });
    }
    const rebuiltAt = new Date().toISOString();
    const snapshot = this.listChatSessionLearnedMemory(sessionId, 500);
    return {
      rebuiltAt,
      items: snapshot.items,
      conflicts: snapshot.conflicts,
    };
  }

  public async suggestChatDelegation(
    sessionId: string,
    input: ChatDelegateSuggestRequest = {},
  ): Promise<ChatDelegateSuggestResponse> {
    this.getSession(sessionId);
    const objective = (input.objective?.trim() || (await this.inferLatestUserObjective(sessionId))).trim();
    if (!objective) {
      throw new Error("No objective provided and no recent user request was found.");
    }
    const detectedRoles = normalizeDelegationRoles(input.roles?.length ? input.roles : detectDelegationRoles(objective));
    const roles = detectedRoles.length > 0 ? detectedRoles : DEFAULT_DELEGATION_ROLES.slice(0, 3);
    const confidence = this.computeDelegationSuggestionConfidence(objective, roles);
    const suggestion: ChatDelegationSuggestionRecord = {
      suggestionId: randomUUID(),
      sessionId,
      objective,
      roles,
      mode: input.mode ?? "sequential",
      confidence,
      reason: "Detected multi-role objective and generated delegation plan.",
      source: "manual",
      createdAt: new Date().toISOString(),
    };
    return { suggestion };
  }

  public async acceptChatDelegation(
    sessionId: string,
    input: ChatDelegateAcceptRequest,
  ): Promise<ChatDelegateResponse> {
    this.getSession(sessionId);
    if (input.suggestionId) {
      const actionRow = this.gatewaySql.prepare(`
        SELECT args_json
        FROM proactive_actions
        WHERE action_id = ? AND session_id = ?
      `).get(input.suggestionId, sessionId) as { args_json?: string } | undefined;
      if (actionRow?.args_json) {
        const parsed = safeJsonParse<Record<string, unknown>>(actionRow.args_json, {});
        const objectiveFromSuggestion = typeof parsed.objective === "string" ? parsed.objective.trim() : "";
        const rolesFromSuggestion = Array.isArray(parsed.roles)
          ? parsed.roles.map((item) => String(item))
          : [];
        return this.runChatDelegation(sessionId, {
          objective: objectiveFromSuggestion || input.objective,
          roles: rolesFromSuggestion.length > 0 ? rolesFromSuggestion : input.roles,
          mode: input.mode ?? "sequential",
          providerId: input.providerId,
          model: input.model,
        });
      }
    }
    return this.runChatDelegation(sessionId, {
      objective: input.objective,
      roles: input.roles,
      mode: input.mode ?? "sequential",
      providerId: input.providerId,
      model: input.model,
    });
  }

  public importPromptPack(input: {
    content: string;
    name?: string;
    sourceLabel?: string;
    packId?: string;
  }): {
    pack: PromptPackRecord;
    tests: PromptPackTestRecord[];
  } {
    const tests = parsePromptPackTests(input.content);
    if (tests.length === 0) {
      throw new Error("No tests found in prompt-pack markdown.");
    }
    const name = input.name?.trim() || inferPromptPackName(input.sourceLabel);
    const imported = this.storage.promptPacks.replacePackTests({
      packId: input.packId,
      name,
      sourceLabel: input.sourceLabel,
      tests,
    });
    this.refreshPromptPackExportFile(imported.pack.packId);
    return imported;
  }

  public listPromptPacks(limit = 100): PromptPackRecord[] {
    return this.storage.promptPacks.listPacks(limit);
  }

  public listPromptPackTests(packId: string, limit = 2000): PromptPackTestRecord[] {
    this.storage.promptPacks.getPack(packId);
    return this.storage.promptPacks.listTests(packId, limit);
  }

  public async runPromptPackTest(
    packId: string,
    testId: string,
    input?: {
      sessionId?: string;
      providerId?: string;
      model?: string;
      placeholderValues?: Record<string, string>;
    },
  ): Promise<PromptPackRunRecord> {
    const pack = this.storage.promptPacks.getPack(packId);
    const test = this.storage.promptPacks.getTest(testId);
    if (test.packId !== pack.packId) {
      throw new Error("Prompt-pack test does not belong to this pack.");
    }

    const defaults = this.getPromptRunnerModelDefaults();
    const providerId = input?.providerId ?? defaults.providerId;
    const model = input?.model ?? defaults.model;
    const resolvedPrompt = applyPromptPlaceholderValues(test.prompt, input?.placeholderValues);
    if (resolvedPrompt.missingPlaceholders.length > 0) {
      throw new Error(
        `Missing placeholder values for ${test.code}: ${resolvedPrompt.missingPlaceholders.join(", ")}.`,
      );
    }
    const runId = randomUUID();
    const sessionId = input?.sessionId ?? this.createChatSession({
      title: `[${test.code}] ${test.title}`.slice(0, 200),
    }).sessionId;

    this.storage.promptPackRuns.create({
      runId,
      packId: pack.packId,
      testId: test.testId,
      sessionId,
      status: "running",
      providerId,
      model,
    });

    try {
      const response = await this.agentSendChatMessage(sessionId, {
        content: resolvedPrompt.prompt,
        providerId,
        model,
        mode: "chat",
        webMode: "auto",
        memoryMode: "auto",
        thinkingLevel: "standard",
      });
      const responseText = finalizePromptPackResponseText({
        prompt: resolvedPrompt.prompt,
        responseText: response.assistantMessage?.content ?? "",
        trace: response.trace,
      });
      const traceStatus = response.trace?.status;
      const missingOutput = responseText.trim().length === 0;
      const failedByTrace = traceStatus === "failed";
      const approvalPending = traceStatus === "approval_required";
      const status: PromptPackRunRecord["status"] = (missingOutput || failedByTrace || approvalPending) ? "failed" : "completed";
      const error = status === "failed"
        ? (approvalPending
          ? "Turn paused for approval; prompt-pack run marked failed for deterministic scoring."
          : (missingOutput
            ? "No assistant output generated."
            : "Assistant turn finished in failed state."))
        : undefined;
      const updated = this.storage.promptPackRuns.patch(runId, {
        status,
        responseText: responseText || undefined,
        trace: response.trace,
        citations: response.citations,
        error,
        finishedAt: new Date().toISOString(),
      });
      this.refreshPromptPackExportFile(pack.packId);
      return updated;
    } catch (error) {
      const failed = this.storage.promptPackRuns.patch(runId, {
        status: "failed",
        error: (error as Error).message,
        finishedAt: new Date().toISOString(),
      });
      this.refreshPromptPackExportFile(pack.packId);
      return failed;
    }
  }

  public scorePromptPackTest(input: {
    packId: string;
    testId: string;
    runId: string;
    routingScore: 0 | 1 | 2;
    honestyScore: 0 | 1 | 2;
    handoffScore: 0 | 1 | 2;
    robustnessScore: 0 | 1 | 2;
    usabilityScore: 0 | 1 | 2;
    notes?: string;
  }): PromptPackScoreRecord {
    const run = this.storage.promptPackRuns.get(input.runId);
    if (run.packId !== input.packId || run.testId !== input.testId) {
      throw new Error("Score target does not match run.");
    }
    const score = this.storage.promptPackScores.create({
      scoreId: randomUUID(),
      packId: input.packId,
      testId: input.testId,
      runId: input.runId,
      routingScore: input.routingScore,
      honestyScore: input.honestyScore,
      handoffScore: input.handoffScore,
      robustnessScore: input.robustnessScore,
      usabilityScore: input.usabilityScore,
      notes: input.notes?.trim() || undefined,
    });
    this.refreshPromptPackExportFile(input.packId);
    return score;
  }

  public async autoScorePromptPackTest(input: {
    packId: string;
    testId: string;
    runId?: string;
    providerId?: string;
    model?: string;
    force?: boolean;
  }): Promise<PromptPackAutoScoreResult> {
    const pack = this.storage.promptPacks.getPack(input.packId);
    const test = this.storage.promptPacks.getTest(input.testId);
    if (test.packId !== pack.packId) {
      throw new Error("Prompt-pack test does not belong to this pack.");
    }

    const candidateRuns = this.storage.promptPackRuns.listByTest(test.testId, 1000);
    const run = input.runId
      ? this.storage.promptPackRuns.get(input.runId)
      : (candidateRuns.find((item) => item.status === "completed") ?? candidateRuns[0]);
    if (!run) {
      throw new Error(`No run found for ${test.code}. Run this test first.`);
    }
    if (run.packId !== pack.packId || run.testId !== test.testId) {
      throw new Error("Auto-score target does not match run.");
    }

    const existingScore = this.storage.promptPackScores.listByRun(run.runId, 1)[0];
    const ruleEvaluation = evaluatePromptPackRuleScores({
      prompt: test.prompt,
      run,
    });
    if (existingScore && !input.force) {
      return {
        score: existingScore,
        run,
        ruleScores: ruleEvaluation.scores,
        usedModelJudge: false,
        notes: "Existing score reused for this run.",
      };
    }

    const modelScores = await this.judgePromptPackRunScores({
      packName: pack.name,
      testCode: test.code,
      testTitle: test.title,
      prompt: test.prompt,
      run,
      providerId: input.providerId,
      model: input.model,
    });

    const merged = mergePromptPackAutoScores({
      run,
      ruleScores: ruleEvaluation.scores,
      modelScores: modelScores?.scores,
    });

    const notes = buildPromptPackAutoScoreNotes({
      ruleSignals: ruleEvaluation.signals,
      modelRationale: modelScores?.rationale,
      modelJudgeError: modelScores?.error,
      usedModelJudge: Boolean(modelScores?.scores),
    });

    const score = this.scorePromptPackTest({
      packId: pack.packId,
      testId: test.testId,
      runId: run.runId,
      routingScore: merged.routingScore,
      honestyScore: merged.honestyScore,
      handoffScore: merged.handoffScore,
      robustnessScore: merged.robustnessScore,
      usabilityScore: merged.usabilityScore,
      notes,
    });

    return {
      score,
      run,
      ruleScores: ruleEvaluation.scores,
      modelScores: modelScores?.scores
        ? {
            ...modelScores.scores,
            rationale: modelScores.rationale,
          }
        : undefined,
      usedModelJudge: Boolean(modelScores?.scores),
      notes,
    };
  }

  public async autoScorePromptPackBatch(input: {
    packId: string;
    onlyUnscored?: boolean;
    limit?: number;
    providerId?: string;
    model?: string;
    force?: boolean;
  }): Promise<PromptPackAutoScoreBatchResult> {
    const pack = this.storage.promptPacks.getPack(input.packId);
    const tests = this.storage.promptPacks.listTests(pack.packId, 5000);
    const limit = Math.max(1, Math.min(input.limit ?? tests.length, 500));
    const onlyUnscored = input.onlyUnscored ?? true;

    const items: PromptPackAutoScoreResult[] = [];
    let skipped = 0;

    for (const test of tests.slice(0, limit)) {
      const latestRun = this.storage.promptPackRuns.listByTest(test.testId, 1)[0];
      if (!latestRun) {
        skipped += 1;
        continue;
      }
      if (onlyUnscored) {
        const existing = this.storage.promptPackScores.listByRun(latestRun.runId, 1)[0];
        if (existing) {
          skipped += 1;
          continue;
        }
      }
      items.push(await this.autoScorePromptPackTest({
        packId: pack.packId,
        testId: test.testId,
        runId: latestRun.runId,
        providerId: input.providerId,
        model: input.model,
        force: input.force,
      }));
    }

    return {
      items,
      skipped,
    };
  }

  public async scorePromptPackLatestRunByCode(input: {
    sessionId?: string;
    testCode: string;
    routingScore: 0 | 1 | 2;
    honestyScore: 0 | 1 | 2;
    handoffScore: 0 | 1 | 2;
    robustnessScore: 0 | 1 | 2;
    usabilityScore: 0 | 1 | 2;
    notes?: string;
  }): Promise<PromptPackScoreRecord> {
    const pack = await this.ensurePromptPackLoaded();
    if (!pack) {
      throw new Error("No prompt pack is available. Import one in Prompt Lab first.");
    }
    const tests = this.storage.promptPacks.listTests(pack.packId, 5000);
    const test = tests.find((item) => item.code.toUpperCase() === input.testCode.toUpperCase());
    if (!test) {
      throw new Error(`Prompt-pack test ${input.testCode} not found.`);
    }
    const runs = this.storage.promptPackRuns.listByTest(test.testId, 1000)
      .filter((item) => !input.sessionId || item.sessionId === input.sessionId);
    const latest = runs.at(0);
    if (!latest) {
      throw new Error(`No run found for ${test.code}. Run /pack run ${test.code} first.`);
    }
    return this.scorePromptPackTest({
      packId: pack.packId,
      testId: test.testId,
      runId: latest.runId,
      routingScore: input.routingScore,
      honestyScore: input.honestyScore,
      handoffScore: input.handoffScore,
      robustnessScore: input.robustnessScore,
      usabilityScore: input.usabilityScore,
      notes: input.notes,
    });
  }

  public getPromptPackReport(packId: string): PromptPackReportRecord {
    const pack = this.storage.promptPacks.getPack(packId);
    const tests = this.storage.promptPacks.listTests(packId, 5000);
    const runs = this.storage.promptPackRuns.listByPack(packId, 10000);
    const scores = this.storage.promptPackScores.listByPack(packId, 10000);

    const completedRuns = runs.filter((item) => item.status === "completed").length;
    const failedRuns = runs.filter((item) => item.status === "failed").length;
    const totalScore = scores.reduce((sum, score) => sum + score.totalScore, 0);
    const averageTotalScore = scores.length > 0 ? totalScore / scores.length : 0;
    const passScores = scores.filter((score) => score.totalScore >= PROMPT_PACK_PASS_THRESHOLD).length;
    const passRate = scores.length > 0 ? passScores / scores.length : 0;
    let runFailureCount = 0;
    let scoreFailureCount = 0;
    let needsScoreCount = 0;
    const failingCodes: string[] = [];
    for (const test of tests) {
      const latestRun = runs.find((item) => item.testId === test.testId);
      const latestScore = scores.find((item) => item.testId === test.testId);
      if (latestRun?.status === "failed") {
        runFailureCount += 1;
        failingCodes.push(test.code);
        continue;
      }
      if (latestRun?.status === "completed" && !latestScore) {
        needsScoreCount += 1;
        continue;
      }
      if (latestScore && latestScore.totalScore < PROMPT_PACK_PASS_THRESHOLD) {
        scoreFailureCount += 1;
        failingCodes.push(test.code);
      }
    }

    return {
      pack,
      tests,
      runs,
      scores,
      summary: {
        totalTests: tests.length,
        completedRuns,
        failedRuns,
        runFailureCount,
        scoreFailureCount,
        needsScoreCount,
        passThreshold: PROMPT_PACK_PASS_THRESHOLD,
        averageTotalScore,
        passRate,
        failingCodes,
      },
    };
  }

  public runPromptPackBenchmark(
    packId: string,
    input: {
      testCodes: string[];
      providers: PromptPackBenchmarkProviderInput[];
    },
  ): { benchmarkRunId: string } {
    const pack = this.storage.promptPacks.getPack(packId);
    const tests = this.storage.promptPacks.listTests(pack.packId, 5000);
    const codeToTest = new Map(tests.map((test) => [test.code.toUpperCase(), test]));
    const normalizedCodes = Array.from(
      new Set(
        (input.testCodes ?? [])
          .map((code) => code.trim())
          .filter((code) => code.length > 0),
      ),
    )
      .map((code: string) => code.toUpperCase())
      .slice(0, PROMPT_PACK_BENCHMARK_MAX_TESTS);
    if (normalizedCodes.length < 1) {
      throw new Error("Benchmark requires at least one test code.");
    }
    const selectedTests: PromptPackTestRecord[] = [];
    for (const code of normalizedCodes) {
      const test = codeToTest.get(code);
      if (!test) {
        throw new Error(`Prompt-pack test code ${code} not found in ${pack.name}.`);
      }
      selectedTests.push(test);
    }

    const providers = dedupeBenchmarkProviders(input.providers)
      .slice(0, PROMPT_PACK_BENCHMARK_MAX_PROVIDERS);
    if (providers.length < 1) {
      throw new Error("Benchmark requires at least one provider/model pair.");
    }

    const benchmarkRunId = `ppb-${randomUUID()}`;
    const startedAt = new Date().toISOString();
    const totalItems = selectedTests.length * providers.length;
    this.gatewaySql.prepare(`
      INSERT INTO prompt_pack_benchmark_runs (
        benchmark_run_id, pack_id, status, test_codes_json, providers_json,
        total_items, completed_items, error, started_at, finished_at
      ) VALUES (
        @benchmarkRunId, @packId, @status, @testCodesJson, @providersJson,
        @totalItems, @completedItems, NULL, @startedAt, NULL
      )
    `).run({
      benchmarkRunId,
      packId: pack.packId,
      status: "queued",
      testCodesJson: JSON.stringify(selectedTests.map((item) => item.code)),
      providersJson: JSON.stringify(providers),
      totalItems,
      completedItems: 0,
      startedAt,
    });

    const task = this.runPromptPackBenchmarkTask(benchmarkRunId)
      .catch((error) => {
        const now = new Date().toISOString();
        this.gatewaySql.prepare(`
          UPDATE prompt_pack_benchmark_runs
          SET status = 'failed', error = @error, finished_at = @finishedAt
          WHERE benchmark_run_id = @benchmarkRunId
        `).run({
          benchmarkRunId,
          error: (error as Error).message,
          finishedAt: now,
        });
      })
      .finally(() => {
        this.backgroundTasks.delete(task);
      });
    this.backgroundTasks.add(task);
    void task;

    this.publishRealtime("prompt_pack_benchmark_started", "promptLab", {
      benchmarkRunId,
      packId: pack.packId,
      totalItems,
      providers,
      testCodes: selectedTests.map((item) => item.code),
    });
    return { benchmarkRunId };
  }

  public getPromptPackBenchmarkStatus(benchmarkRunId: string): PromptPackBenchmarkStatusRecord {
    const runRow = this.gatewaySql.prepare(`
      SELECT *
      FROM prompt_pack_benchmark_runs
      WHERE benchmark_run_id = ?
    `).get(benchmarkRunId) as PromptPackBenchmarkRunRow | undefined;
    if (!runRow) {
      throw new Error(`Prompt-pack benchmark run ${benchmarkRunId} not found.`);
    }
    const itemRows = this.gatewaySql.prepare(`
      SELECT *
      FROM prompt_pack_benchmark_items
      WHERE benchmark_run_id = ?
      ORDER BY created_at ASC
    `).all(benchmarkRunId) as unknown as PromptPackBenchmarkItemRow[];
    const items = itemRows.map((row) => mapPromptPackBenchmarkItemRow(row));
    const run = mapPromptPackBenchmarkRunRow(runRow);
    const modelSummaries = summarizePromptPackBenchmarkItems(items);
    return {
      run,
      progress: {
        totalItems: runRow.total_items,
        completedItems: Math.max(runRow.completed_items, items.length),
      },
      modelSummaries,
    };
  }

  public runPromptPackReplayRegression(
    packId: string,
    input: {
      testCodes: string[];
      baselineRef?: string;
    },
  ): { regressionRunId: string } {
    this.requireFeatureEnabled("replayRegressionV1Enabled");
    const pack = this.storage.promptPacks.getPack(packId);
    const tests = this.storage.promptPacks.listTests(pack.packId, 5000);
    const byCode = new Map(tests.map((test) => [test.code.toUpperCase(), test]));
    const selectedCodes = Array.from(new Set((input.testCodes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean)));
    if (selectedCodes.length < 1) {
      throw new Error("Replay regression requires at least one test code.");
    }
    for (const code of selectedCodes) {
      if (!byCode.has(code)) {
        throw new Error(`Unknown test code ${code} for prompt pack ${packId}`);
      }
    }
    const regressionRunId = `ppr-${randomUUID()}`;
    const now = new Date().toISOString();
    this.gatewaySql.prepare(`
      INSERT INTO replay_regression_runs (
        regression_run_id, pack_id, status, test_codes_json, baseline_ref, summary_json, started_at, finished_at
      ) VALUES (
        @regressionRunId, @packId, 'running', @testCodesJson, @baselineRef, @summaryJson, @startedAt, NULL
      )
    `).run({
      regressionRunId,
      packId,
      testCodesJson: JSON.stringify(selectedCodes),
      baselineRef: input.baselineRef ?? null,
      summaryJson: JSON.stringify({}),
      startedAt: now,
    });

    const latestScores = new Map<string, PromptPackScoreRecord>();
    for (const score of this.storage.promptPackScores.listByPack(packId, 10_000)) {
      if (!latestScores.has(score.testId)) {
        latestScores.set(score.testId, score);
      }
    }

    const insertResult = this.gatewaySql.prepare(`
      INSERT INTO replay_regression_results (
        result_id, regression_run_id, test_code, capability, score_delta, pass_delta, latency_delta_ms, created_at
      ) VALUES (
        @resultId, @regressionRunId, @testCode, @capability, @scoreDelta, @passDelta, @latencyDeltaMs, @createdAt
      )
    `);
    for (const code of selectedCodes) {
      const test = byCode.get(code)!;
      const score = latestScores.get(test.testId);
      const capabilities: Array<{ capability: ReplayRegressionResult["capability"]; value: number }> = [
        { capability: "routing", value: score?.routingScore ?? 0 },
        { capability: "honesty", value: score?.honestyScore ?? 0 },
        { capability: "handoff", value: score?.handoffScore ?? 0 },
        { capability: "robustness", value: score?.robustnessScore ?? 0 },
        { capability: "usability", value: score?.usabilityScore ?? 0 },
      ];
      for (const entry of capabilities) {
        insertResult.run({
          resultId: `pprr-${randomUUID()}`,
          regressionRunId,
          testCode: test.code,
          capability: entry.capability,
          scoreDelta: 0,
          passDelta: entry.value >= 1 ? 0 : -1,
          latencyDeltaMs: 0,
          createdAt: now,
        });
      }
    }

    this.gatewaySql.prepare(`
      UPDATE replay_regression_runs
      SET status = 'completed',
          summary_json = @summaryJson,
          finished_at = @finishedAt
      WHERE regression_run_id = @regressionRunId
    `).run({
      regressionRunId,
      summaryJson: JSON.stringify({
        totalTests: selectedCodes.length,
        resultRows: selectedCodes.length * 5,
      }),
      finishedAt: new Date().toISOString(),
    });
    this.publishRealtime("prompt_pack_regression_completed", "promptLab", {
      regressionRunId,
      packId,
      testCodes: selectedCodes,
    });
    return { regressionRunId };
  }

  public getPromptPackReplayRegressionStatus(runId: string): {
    run: ReplayRegressionRun;
    results: ReplayRegressionResult[];
  } {
    this.requireFeatureEnabled("replayRegressionV1Enabled");
    const row = this.gatewaySql.prepare(`
      SELECT regression_run_id, pack_id, status, test_codes_json, baseline_ref, started_at, finished_at, error_text
      FROM replay_regression_runs
      WHERE regression_run_id = ?
    `).get(runId) as {
      regression_run_id: string;
      pack_id: string;
      status: ReplayRegressionRun["status"];
      test_codes_json: string;
      baseline_ref: string | null;
      started_at: string;
      finished_at: string | null;
      error_text: string | null;
    } | undefined;
    if (!row) {
      throw new Error(`Replay regression run not found: ${runId}`);
    }
    const resultRows = this.gatewaySql.prepare(`
      SELECT result_id, regression_run_id, test_code, capability, score_delta, pass_delta, latency_delta_ms, created_at
      FROM replay_regression_results
      WHERE regression_run_id = ?
      ORDER BY created_at ASC
    `).all(runId) as Array<{
      result_id: string;
      regression_run_id: string;
      test_code: string;
      capability: ReplayRegressionResult["capability"];
      score_delta: number;
      pass_delta: number;
      latency_delta_ms: number;
      created_at: string;
    }>;
    return {
      run: {
        regressionRunId: row.regression_run_id,
        packId: row.pack_id,
        status: row.status,
        testCodes: this.tryParseJson<string[]>(row.test_codes_json, []),
        baselineRef: row.baseline_ref ?? undefined,
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? undefined,
        error: row.error_text ?? undefined,
      },
      results: resultRows.map((result) => ({
        resultId: result.result_id,
        regressionRunId: result.regression_run_id,
        testCode: result.test_code,
        capability: result.capability,
        scoreDelta: Number(result.score_delta ?? 0),
        passDelta: Number(result.pass_delta ?? 0),
        latencyDeltaMs: Number(result.latency_delta_ms ?? 0),
        createdAt: result.created_at,
      })),
    };
  }

  public getPromptPackCapabilityTrends(packId: string): { items: CapabilityTrendSeries[] } {
    this.requireFeatureEnabled("replayRegressionV1Enabled");
    this.storage.promptPacks.getPack(packId);
    const report = this.getPromptPackReport(packId);
    const now = new Date();
    const today = now.toISOString();
    const average = report.summary.averageTotalScore;
    const passRate = report.summary.passRate;
    const runFailureRate = report.summary.totalTests > 0
      ? report.summary.runFailureCount / report.summary.totalTests
      : 0;
    const capabilities: Array<{ key: CapabilityTrendSeries["capability"]; value: number; threshold?: number }> = [
      { key: "routing", value: average / 5, threshold: 1.4 },
      { key: "honesty", value: average / 5, threshold: 1.4 },
      { key: "handoff", value: average / 5, threshold: 1.2 },
      { key: "robustness", value: average / 5, threshold: 1.4 },
      { key: "usability", value: average / 5, threshold: 1.3 },
      { key: "run_failure_rate", value: runFailureRate, threshold: 0.05 },
    ];
    return {
      items: capabilities.map((entry) => ({
        capability: entry.key,
        points: [
          { timestamp: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(), value: entry.value },
          { timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), value: entry.value },
          { timestamp: today, value: entry.key === "run_failure_rate" ? runFailureRate : passRate > 0 ? entry.value : 0 },
        ],
        threshold: entry.threshold,
        breached: entry.threshold !== undefined
          ? (entry.key === "run_failure_rate" ? entry.value > entry.threshold : entry.value < entry.threshold)
          : undefined,
      })),
    };
  }

  private async runPromptPackBenchmarkTask(benchmarkRunId: string): Promise<void> {
    const run = this.getPromptPackBenchmarkStatus(benchmarkRunId).run;
    if (run.status === "completed" || run.status === "failed") {
      return;
    }
    this.gatewaySql.prepare(`
      UPDATE prompt_pack_benchmark_runs
      SET status = 'running', error = NULL
      WHERE benchmark_run_id = @benchmarkRunId
    `).run({ benchmarkRunId });

    const tests = this.storage.promptPacks.listTests(run.packId, 5000);
    const codeToTest = new Map(tests.map((test) => [test.code.toUpperCase(), test]));
    const selectedTests = run.testCodes
      .map((code) => codeToTest.get(code.toUpperCase()))
      .filter((item): item is PromptPackTestRecord => Boolean(item));

    let completedItems = 0;
    for (const provider of run.providers) {
      for (const test of selectedTests) {
        const createdAt = new Date().toISOString();
        let runStatus: PromptPackBenchmarkItemRecord["runStatus"] = "missing_run";
        let runId: string | undefined;
        let scoreId: string | undefined;
        let totalScore: number | undefined;
        let failureSignal: string | undefined;

        try {
          const promptRun = await this.runPromptPackTest(run.packId, test.testId, {
            providerId: provider.providerId,
            model: provider.model,
          });
          runId = promptRun.runId;
          runStatus = promptRun.status;
          if (promptRun.status === "completed") {
            try {
              const scored = await this.autoScorePromptPackTest({
                packId: run.packId,
                testId: test.testId,
                runId: promptRun.runId,
                providerId: provider.providerId,
                model: provider.model,
                force: true,
              });
              scoreId = scored.score.scoreId;
              totalScore = scored.score.totalScore;
              if (totalScore < PROMPT_PACK_PASS_THRESHOLD) {
                failureSignal = `score_below_${PROMPT_PACK_PASS_THRESHOLD}`;
              }
            } catch (error) {
              failureSignal = `score_error: ${(error as Error).message}`;
            }
          } else {
            failureSignal = summarizePromptPackRunFailure(promptRun) ?? "run_failed";
          }
        } catch (error) {
          runStatus = "failed";
          failureSignal = (error as Error).message;
        }

        this.gatewaySql.prepare(`
          INSERT INTO prompt_pack_benchmark_items (
            item_id, benchmark_run_id, pack_id, test_id, test_code, provider_id, model,
            run_id, score_id, run_status, total_score, failure_signal, created_at
          ) VALUES (
            @itemId, @benchmarkRunId, @packId, @testId, @testCode, @providerId, @model,
            @runId, @scoreId, @runStatus, @totalScore, @failureSignal, @createdAt
          )
        `).run({
          itemId: `ppbi-${randomUUID()}`,
          benchmarkRunId,
          packId: run.packId,
          testId: test.testId,
          testCode: test.code,
          providerId: provider.providerId,
          model: provider.model,
          runId: runId ?? null,
          scoreId: scoreId ?? null,
          runStatus,
          totalScore: totalScore ?? null,
          failureSignal: failureSignal ?? null,
          createdAt,
        });

        completedItems += 1;
        this.gatewaySql.prepare(`
          UPDATE prompt_pack_benchmark_runs
          SET completed_items = @completedItems
          WHERE benchmark_run_id = @benchmarkRunId
        `).run({
          benchmarkRunId,
          completedItems,
        });
      }
    }

    const finishedAt = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE prompt_pack_benchmark_runs
      SET status = 'completed', finished_at = @finishedAt
      WHERE benchmark_run_id = @benchmarkRunId
    `).run({
      benchmarkRunId,
      finishedAt,
    });
    this.publishRealtime("prompt_pack_benchmark_completed", "promptLab", {
      benchmarkRunId,
      completedItems,
    });
  }

  private refreshPromptPackExportFile(packId: string): PromptPackExportRecord {
    const report = this.getPromptPackReport(packId);
    const filePath = this.resolvePromptPackExportPath(report.pack);
    const body = renderPromptPackMarkdownReport(report);
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, body, "utf8");
    return this.readPromptPackExportRecord(report.pack);
  }

  private readPromptPackExportRecord(pack: PromptPackRecord): PromptPackExportRecord {
    const filePath = this.resolvePromptPackExportPath(pack);
    try {
      const stat = fsSync.statSync(filePath);
      return {
        packId: pack.packId,
        path: filePath,
        exists: true,
        sizeBytes: stat.size,
        updatedAt: new Date(stat.mtimeMs).toISOString(),
      };
    } catch {
      return {
        packId: pack.packId,
        path: filePath,
        exists: false,
        sizeBytes: 0,
      };
    }
  }

  private resolvePromptPackExportPath(pack: PromptPackRecord): string {
    const dir = path.join(this.config.rootDir, DEFAULT_PROMPT_PACK_EXPORT_DIR);
    const baseName = sanitizeFileName(pack.name || pack.packId || "prompt-pack");
    return path.join(dir, `${baseName}-latest.md`);
  }

  public getPromptPackExport(packId: string): PromptPackExportRecord {
    const pack = this.storage.promptPacks.getPack(packId);
    return this.readPromptPackExportRecord(pack);
  }

  public exportPromptPack(packId: string): PromptPackExportRecord {
    this.storage.promptPacks.getPack(packId);
    return this.refreshPromptPackExportFile(packId);
  }

  public resetPromptPackRunsAndScores(
    packId: string,
    options: {
      clearRuns?: boolean;
      clearScores?: boolean;
    } = {},
  ): {
    packId: string;
    deletedRuns: number;
    deletedScores: number;
    export: PromptPackExportRecord;
  } {
    const pack = this.storage.promptPacks.getPack(packId);
    const clearRuns = options.clearRuns ?? true;
    const clearScores = options.clearScores ?? true;
    if (!clearRuns && !clearScores) {
      return {
        packId,
        deletedRuns: 0,
        deletedScores: 0,
        export: this.readPromptPackExportRecord(pack),
      };
    }

    let deletedRuns = 0;
    let deletedScores = 0;
    this.gatewaySql.exec("BEGIN IMMEDIATE");
    try {
      if (clearScores) {
        deletedScores = this.storage.promptPackScores.deleteByPack(packId);
      }
      if (clearRuns) {
        deletedRuns = this.storage.promptPackRuns.deleteByPack(packId);
      }
      this.gatewaySql.exec("COMMIT");
    } catch (error) {
      this.gatewaySql.exec("ROLLBACK");
      throw error;
    }

    const exportPath = this.resolvePromptPackExportPath(pack);
    if (clearRuns) {
      try {
        fsSync.rmSync(exportPath, { force: true });
      } catch {
        // no-op
      }
    } else if (clearScores) {
      this.refreshPromptPackExportFile(packId);
    }

    return {
      packId,
      deletedRuns,
      deletedScores,
      export: this.readPromptPackExportRecord(pack),
    };
  }

  public listImprovementReports(limit = 24): WeeklyImprovementReportRecord[] {
    const rows = this.gatewaySql.prepare(`
      SELECT *
      FROM improvement_reports
      ORDER BY week_end DESC, created_at DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(limit, 260))) as Array<{
      report_id: string;
      run_id: string;
      week_start: string;
      week_end: string;
      summary_json: string;
      top_findings_json: string;
      applied_tunes_json: string;
      queued_tunes_json: string;
      week_over_week_json: string;
      previous_report_id: string | null;
      created_at: string;
    }>;
    return rows.map((row) => mapImprovementReportRow(row));
  }

  public listDecisionReplayRuns(limit = 24): DecisionReplayRunRecord[] {
    const rows = this.gatewaySql.prepare(`
      SELECT *
      FROM decision_replay_runs
      ORDER BY started_at DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(limit, 300))) as Array<{
      run_id: string;
      trigger_mode: "scheduled" | "manual";
      sample_size: number;
      window_start: string;
      window_end: string;
      status: string;
      report_id: string | null;
      total_candidates: number;
      total_scored: number;
      likely_wrong_count: number;
      model_judged_count: number;
      started_at: string;
      finished_at: string | null;
      error_text: string | null;
    }>;
    return rows.map((row) => this.mapDecisionReplayRunRow(row));
  }

  public getDurableDiagnostics(): DurableDiagnosticsResponse {
    const statusCounts = this.storage.durableRuns.statusCounts();
    return {
      enabled: this.isDurableFoundationEnabled(),
      replayFoundationReady: true,
      runCount: this.storage.durableRuns.countRuns(),
      queuedCount: statusCounts.queued ?? 0,
      runningCount: statusCounts.running ?? 0,
      waitingCount: statusCounts.waiting ?? 0,
      failedCount: statusCounts.failed ?? 0,
      deadLetterCount: this.storage.durableRuns.listDeadLetters(1000).length,
      recentRuns: this.storage.durableRuns.listRuns(25),
      recentDeadLetters: this.storage.durableRuns.listDeadLetters(25),
      generatedAt: new Date().toISOString(),
    };
  }

  public listDurableRuns(limit = 50): DurableRunRecord[] {
    return this.storage.durableRuns.listRuns(limit);
  }

  public listDurableDeadLetters(limit = 50): DurableDeadLetterRecord[] {
    return this.storage.durableRuns.listDeadLetters(limit);
  }

  public listDurableRunCheckpoints(runId: string, limit = 200): DurableCheckpointRecord[] {
    return this.storage.durableRuns.listCheckpoints(runId, limit);
  }

  public createDurableRun(input: DurableRunCreateRequest): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const workflowKey = input.workflowKey.trim();
    if (!workflowKey) {
      throw new Error("workflowKey is required");
    }
    const retryPolicy = this.normalizeDurableRetryPolicy(input.retryPolicy);
    const now = new Date().toISOString();
    const status: DurableRunRecord["status"] = input.waitForEvent ? "waiting" : "queued";
    const run = this.storage.durableRuns.createRun({
      workflowKey,
      status,
      attemptCount: 0,
      maxAttempts: retryPolicy.maxAttempts,
      payload: input.payload ?? {},
      metadata: {
        retryPolicy,
        waitForEvent: input.waitForEvent ?? null,
      },
      startedAt: status === "queued" ? undefined : now,
      now,
    });
    this.storage.durableRuns.createCheckpoint({
      runId: run.runId,
      checkpointKind: "run_created",
      state: {
        workflowKey: run.workflowKey,
        status: run.status,
      },
      createdAt: now,
    });
    this.recordDurableTimelineEvent(run.runId, "run_created", {
      workflowKey: run.workflowKey,
      status: run.status,
    });
    if (status === "waiting") {
      this.storage.durableRuns.createCheckpoint({
        runId: run.runId,
        checkpointKind: "run_waiting",
        state: {
          waitForEvent: input.waitForEvent ?? null,
        },
      });
      this.recordDurableTimelineEvent(run.runId, "run_waiting", {
        waitForEvent: input.waitForEvent ?? null,
      });
    }
    this.publishRealtime("system", "durable", {
      type: "durable_run_created",
      runId: run.runId,
      workflowKey: run.workflowKey,
      status: run.status,
    });
    return run;
  }

  public getDurableRun(runId: string): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    return this.storage.durableRuns.getRun(runId);
  }

  public listDurableRunTimeline(runId: string, limit = 300): DurableRunTimelineEvent[] {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const safeLimit = Math.max(1, Math.min(2_000, Math.floor(limit)));
    const rows = this.gatewaySql.prepare(`
      SELECT event_id, run_id, event_type, step_key, payload_json, created_at
      FROM durable_run_events
      WHERE run_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(runId, safeLimit) as Array<{
      event_id: string;
      run_id: string;
      event_type: DurableRunTimelineEvent["eventType"];
      step_key: string | null;
      payload_json: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      eventId: row.event_id,
      runId: row.run_id,
      eventType: row.event_type,
      stepKey: row.step_key ?? undefined,
      payload: safeJsonParse<Record<string, unknown>>(row.payload_json ?? "", {}),
      createdAt: row.created_at,
    }));
  }

  public pauseDurableRun(runId: string, actorId = "operator"): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const current = this.storage.durableRuns.getRun(runId);
    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
      throw new Error(`Durable run ${runId} is already terminal (${current.status})`);
    }
    const next = this.storage.durableRuns.updateRun({
      runId,
      status: "paused",
      startedAt: current.startedAt ?? new Date().toISOString(),
      finishedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
    this.recordDurableTimelineEvent(runId, "run_paused", {
      actorId,
      previousStatus: current.status,
    });
    this.publishRealtime("system", "durable", {
      type: "durable_run_paused",
      runId,
      actorId,
    });
    return next;
  }

  public resumeDurableRun(runId: string, actorId = "operator"): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const current = this.storage.durableRuns.getRun(runId);
    if (current.status !== "paused" && current.status !== "waiting") {
      throw new Error(`Durable run ${runId} cannot be resumed from ${current.status}`);
    }
    const next = this.storage.durableRuns.updateRun({
      runId,
      status: "running",
      startedAt: current.startedAt ?? new Date().toISOString(),
      finishedAt: undefined,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    });
    this.storage.durableRuns.createCheckpoint({
      runId,
      checkpointKind: "run_resumed",
      state: { actorId, previousStatus: current.status },
    });
    this.recordDurableTimelineEvent(runId, "run_resumed", {
      actorId,
      previousStatus: current.status,
    });
    this.publishRealtime("system", "durable", {
      type: "durable_run_resumed",
      runId,
      actorId,
    });
    return next;
  }

  public cancelDurableRun(runId: string, actorId = "operator"): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const current = this.storage.durableRuns.getRun(runId);
    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
      throw new Error(`Durable run ${runId} is already terminal (${current.status})`);
    }
    const now = new Date().toISOString();
    const next = this.storage.durableRuns.updateRun({
      runId,
      status: "cancelled",
      finishedAt: now,
      updatedAt: now,
      lastError: `cancelled by ${actorId}`,
    });
    this.recordDurableTimelineEvent(runId, "run_cancelled", {
      actorId,
      previousStatus: current.status,
    });
    this.publishRealtime("system", "durable", {
      type: "durable_run_cancelled",
      runId,
      actorId,
    });
    return next;
  }

  public retryDurableRun(runId: string, reason = "manual_retry", actorId = "operator"): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const current = this.storage.durableRuns.getRun(runId);
    const attemptNo = current.attemptCount + 1;
    if (attemptNo > current.maxAttempts) {
      const deadLetter = this.storage.durableRuns.upsertDeadLetter({
        runId,
        reason: `retry_exhausted:${reason}`,
        payload: {
          actorId,
          attemptNo,
          maxAttempts: current.maxAttempts,
        },
      });
      const deadLettered = this.storage.durableRuns.updateRun({
        runId,
        status: "dead_lettered",
        attemptCount: attemptNo,
        updatedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        lastError: deadLetter.reason,
      });
      this.recordDurableTimelineEvent(runId, "run_dead_lettered", {
        actorId,
        reason: deadLetter.reason,
      });
      this.publishRealtime("system", "durable", {
        type: "durable_run_dead_lettered",
        runId,
        reason: deadLetter.reason,
      });
      return deadLettered;
    }
    const delayMs = this.computeDurableRetryDelayMs(current, attemptNo);
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    this.storage.durableRuns.upsertRetry({
      runId,
      attemptNo,
      reason,
      nextRetryAt,
    });
    this.recordDurableTimelineEvent(runId, "run_retry_scheduled", {
      actorId,
      reason,
      nextRetryAt,
      attemptNo,
    });
    const next = this.storage.durableRuns.updateRun({
      runId,
      status: "queued",
      attemptCount: attemptNo,
      updatedAt: new Date().toISOString(),
      finishedAt: undefined,
      lastError: undefined,
    });
    this.publishRealtime("system", "durable", {
      type: "durable_run_retry_scheduled",
      runId,
      attemptNo,
      nextRetryAt,
    });
    return next;
  }

  public wakeDurableRun(
    runId: string,
    event: {
      eventKey: string;
      payload?: Record<string, unknown>;
      correlationId?: string;
    },
  ): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const current = this.storage.durableRuns.getRun(runId);
    if (current.status !== "waiting" && current.status !== "paused") {
      throw new Error(`Durable run ${runId} is not waiting/paused`);
    }
    const waitForEvent = ((current.metadata as { waitForEvent?: { eventKey?: string; correlationId?: string } } | undefined)
      ?.waitForEvent ?? {}) as { eventKey?: string; correlationId?: string };
    if (waitForEvent.eventKey && waitForEvent.eventKey !== event.eventKey) {
      throw new Error(`Wake event key mismatch: expected ${waitForEvent.eventKey}`);
    }
    if (waitForEvent.correlationId && waitForEvent.correlationId !== event.correlationId) {
      throw new Error("Wake correlation mismatch");
    }
    const now = new Date().toISOString();
    const next = this.storage.durableRuns.updateRun({
      runId,
      status: "running",
      updatedAt: now,
      startedAt: current.startedAt ?? now,
      finishedAt: undefined,
      lastError: undefined,
    });
    this.recordDurableTimelineEvent(runId, "run_woken", {
      eventKey: event.eventKey,
      correlationId: event.correlationId,
      payload: event.payload ?? {},
    });
    this.publishRealtime("system", "durable", {
      type: "durable_run_woken",
      runId,
      eventKey: event.eventKey,
    });
    return next;
  }

  public recoverDurableDeadLetter(entryId: string, actorId = "operator"): DurableRunRecord {
    this.requireFeatureEnabled("durableKernelV1Enabled");
    const row = this.gatewaySql.prepare(`
      SELECT dead_letter_id, run_id, reason
      FROM durable_dead_letters
      WHERE dead_letter_id = ?
    `).get(entryId) as { dead_letter_id: string; run_id: string; reason: string } | undefined;
    if (!row) {
      throw new Error(`Durable dead-letter entry not found: ${entryId}`);
    }
    this.gatewaySql.prepare(`
      UPDATE durable_dead_letters
      SET resolved_at = @resolvedAt, resolution_note = @note
      WHERE dead_letter_id = @entryId
    `).run({
      entryId,
      resolvedAt: new Date().toISOString(),
      note: `recovered by ${actorId}`,
    });
    const next = this.storage.durableRuns.updateRun({
      runId: row.run_id,
      status: "queued",
      updatedAt: new Date().toISOString(),
      finishedAt: undefined,
      lastError: undefined,
    });
    this.recordDurableTimelineEvent(row.run_id, "dead_letter_recovered", {
      actorId,
      deadLetterId: entryId,
    });
    this.publishRealtime("system", "durable", {
      type: "durable_dead_letter_recovered",
      runId: row.run_id,
      deadLetterId: entryId,
    });
    return next;
  }

  public getImprovementReport(reportId: string): WeeklyImprovementReportRecord {
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM improvement_reports
      WHERE report_id = ?
    `).get(reportId) as {
      report_id: string;
      run_id: string;
      week_start: string;
      week_end: string;
      summary_json: string;
      top_findings_json: string;
      applied_tunes_json: string;
      queued_tunes_json: string;
      week_over_week_json: string;
      previous_report_id: string | null;
      created_at: string;
    } | undefined;
    if (!row) {
      throw new Error(`Improvement report ${reportId} not found`);
    }
    return mapImprovementReportRow(row);
  }

  public getDecisionReplayRun(runId: string): {
    run: DecisionReplayRunRecord;
    items: DecisionReplayItemRecord[];
    findings: DecisionReplayFindingRecord[];
    autoTunes: DecisionAutoTuneRecord[];
    report?: WeeklyImprovementReportRecord;
  } {
    const run = this.readDecisionReplayRun(runId);
    const items = this.listDecisionReplayItems(runId, 1500);
    const findings = this.listDecisionReplayFindings(runId, 300);
    const autoTunes = this.listDecisionAutoTunes(runId, 300);
    const report = run.reportId ? this.getImprovementReport(run.reportId) : undefined;
    return { run, items, findings, autoTunes, report };
  }

  public async runImprovementReplayManually(
    input: ImprovementReplayTriggerInput = {},
  ): Promise<{
    run: DecisionReplayRunRecord;
    report?: WeeklyImprovementReportRecord;
  }> {
    return this.runDecisionReplayAudit({
      triggerMode: "manual",
      sampleSize: clampInteger(input.sampleSize, 50, 2000, IMPROVEMENT_WEEKLY_SAMPLE_SIZE),
    });
  }

  public createReplayOverrideDraft(
    sourceRunId: string,
    overrides: ReplayOverrideStep[] = [],
  ): ReplayOverrideDraft {
    this.requireFeatureEnabled("replayOverridesV1Enabled");
    const now = new Date().toISOString();
    const replayRunId = randomUUID();
    const normalized = this.normalizeReplayOverrides(overrides);
    this.gatewaySql.prepare(`
      INSERT INTO replay_override_runs (
        replay_run_id, source_run_id, status, override_summary_json, diff_summary_json, created_at, updated_at
      ) VALUES (
        @replayRunId, @sourceRunId, 'draft', @overrideSummaryJson, NULL, @createdAt, @updatedAt
      )
    `).run({
      replayRunId,
      sourceRunId,
      overrideSummaryJson: JSON.stringify({
        count: normalized.length,
        stepKeys: normalized.map((item) => item.stepKey),
      }),
      createdAt: now,
      updatedAt: now,
    });
    this.replaceReplayOverrideSteps(replayRunId, normalized);
    return {
      replayRunId,
      sourceRunId,
      status: "draft",
      overrides: normalized,
      createdAt: now,
      updatedAt: now,
    };
  }

  public executeReplayOverride(
    sourceRunId: string,
    overrides: ReplayOverrideStep[] = [],
  ): ReplayOverrideDraft {
    this.requireFeatureEnabled("replayOverridesV1Enabled");
    const draft = this.createReplayOverrideDraft(sourceRunId, overrides);
    const runningAt = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE replay_override_runs
      SET status = 'running', updated_at = @updatedAt
      WHERE replay_run_id = @replayRunId
    `).run({
      replayRunId: draft.replayRunId,
      updatedAt: runningAt,
    });

    const summary = this.computeReplayDiffSummary(sourceRunId, draft.replayRunId, draft.overrides);
    const finishedAt = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE replay_override_runs
      SET status = 'completed',
          diff_summary_json = @diffSummaryJson,
          updated_at = @updatedAt
      WHERE replay_run_id = @replayRunId
    `).run({
      replayRunId: draft.replayRunId,
      diffSummaryJson: JSON.stringify(summary),
      updatedAt: finishedAt,
    });
    this.publishRealtime("system", "improvement", {
      type: "replay_override_completed",
      replayRunId: draft.replayRunId,
      sourceRunId,
    });
    return {
      ...draft,
      status: "completed",
      updatedAt: finishedAt,
      finishedAt,
    };
  }

  public getReplayDiffSummary(replayRunId: string): ReplayDiffSummary {
    this.requireFeatureEnabled("replayOverridesV1Enabled");
    const row = this.gatewaySql.prepare(`
      SELECT replay_run_id, source_run_id, status, diff_summary_json, updated_at
      FROM replay_override_runs
      WHERE replay_run_id = ?
    `).get(replayRunId) as {
      replay_run_id: string;
      source_run_id: string;
      status: ReplayOverrideDraft["status"];
      diff_summary_json: string | null;
      updated_at: string;
    } | undefined;
    if (!row) {
      throw new Error(`Replay override run not found: ${replayRunId}`);
    }
    const parsed = this.tryParseJson<Record<string, unknown>>(row.diff_summary_json, {});
    return {
      replayRunId: row.replay_run_id,
      sourceRunId: row.source_run_id,
      status: row.status === "failed" ? "failed" : "completed",
      summary: {
        latencyDeltaMs: Number.isFinite(Number(parsed.latencyDeltaMs)) ? Number(parsed.latencyDeltaMs) : 0,
        inputTokensDelta: Number.isFinite(Number(parsed.inputTokensDelta)) ? Number(parsed.inputTokensDelta) : 0,
        outputTokensDelta: Number.isFinite(Number(parsed.outputTokensDelta)) ? Number(parsed.outputTokensDelta) : 0,
        cachedInputTokensDelta: Number.isFinite(Number(parsed.cachedInputTokensDelta)) ? Number(parsed.cachedInputTokensDelta) : 0,
        costUsdDelta: Number.isFinite(Number(parsed.costUsdDelta)) ? Number(parsed.costUsdDelta) : 0,
        errorChanged: Boolean(parsed.errorChanged),
      },
      comparedAt: row.updated_at,
    };
  }

  private isDurableFoundationEnabled(): boolean {
    const fromEnv = process.env.GOATCITADEL_DURABLE_FOUNDATION_ENABLED?.trim().toLowerCase();
    if (fromEnv) {
      return fromEnv === "1" || fromEnv === "true" || fromEnv === "yes" || fromEnv === "on";
    }
    return this.config.assistant.durable.enabled;
  }

  private markInterruptedDecisionReplayRuns(): void {
    const running = this.gatewaySql.prepare(`
      SELECT run_id
      FROM decision_replay_runs
      WHERE status = 'running'
    `).all() as Array<{ run_id: string }>;
    if (running.length === 0) {
      return;
    }
    const finishedAt = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE decision_replay_runs
      SET status = 'failed',
          error_text = COALESCE(error_text, 'Replay interrupted before completion (service restarted).'),
          finished_at = @finishedAt
      WHERE status = 'running'
    `).run({ finishedAt });
    this.publishRealtime("system", "improvement", {
      type: "improvement_replay_interrupted_runs_recovered",
      recoveredCount: running.length,
      finishedAt,
    });
  }

  public approveDecisionAutoTune(tuneId: string): DecisionAutoTuneRecord {
    const tune = this.readDecisionAutoTune(tuneId);
    if (tune.status === "applied") {
      return tune;
    }
    if (tune.status !== "queued") {
      throw new Error(`Auto-tune ${tuneId} is ${tune.status} and cannot be approved.`);
    }
    if (tune.riskLevel !== "low") {
      throw new Error(`Auto-tune ${tuneId} is ${tune.riskLevel} risk and requires manual code review.`);
    }
    return this.applyDecisionAutoTune(tuneId, "manual");
  }

  public revertDecisionAutoTune(tuneId: string): DecisionAutoTuneRecord {
    const tune = this.readDecisionAutoTune(tuneId);
    if (tune.status !== "applied") {
      throw new Error(`Auto-tune ${tuneId} is ${tune.status} and cannot be reverted.`);
    }
    const snapshot = tune.snapshot ?? {};
    const settingKey = typeof snapshot.settingKey === "string" ? snapshot.settingKey : undefined;
    if (!settingKey) {
      throw new Error(`Auto-tune ${tuneId} does not contain a rollback snapshot.`);
    }
    const previousValue = snapshot.previousValue;
    if (previousValue === undefined) {
      this.storage.systemSettings.set(settingKey, null);
    } else {
      this.storage.systemSettings.set(settingKey, previousValue);
    }
    const revertedAt = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE decision_autotunes
      SET status = 'reverted', reverted_at = @revertedAt, result_json = @resultJson
      WHERE tune_id = @tuneId
    `).run({
      tuneId,
      revertedAt,
      resultJson: JSON.stringify({
        revertedBy: "operator",
        restoredSetting: settingKey,
      }),
    });
    this.publishRealtime("improvement_autotune_reverted", "improvement", {
      tuneId,
      settingKey,
      revertedAt,
    });
    return this.readDecisionAutoTune(tuneId);
  }

  private async judgePromptPackRunScores(input: {
    packName: string;
    testCode: string;
    testTitle: string;
    prompt: string;
    run: PromptPackRunRecord;
    providerId?: string;
    model?: string;
  }): Promise<{
    scores?: {
      routingScore: 0 | 1 | 2;
      honestyScore: 0 | 1 | 2;
      handoffScore: 0 | 1 | 2;
      robustnessScore: 0 | 1 | 2;
      usabilityScore: 0 | 1 | 2;
    };
    rationale?: string;
    error?: string;
  }> {
    if (!input.run.responseText?.trim()) {
      return { error: "No assistant output available for model judging." };
    }
    const defaults = this.getPromptRunnerModelDefaults();
    const providerId = input.providerId ?? input.run.providerId ?? defaults.providerId;
    const model = input.model ?? input.run.model ?? defaults.model;

    const trace = input.run.trace;
    const traceSummary = {
      runStatus: input.run.status,
      toolRunCount: trace?.toolRuns.length ?? 0,
      executedToolRuns: trace?.toolRuns.filter((item) => item.status === "executed").length ?? 0,
      failedToolRuns: trace?.toolRuns.filter((item) => item.status === "failed").length ?? 0,
      blockedToolRuns: trace?.toolRuns.filter((item) => item.status === "blocked").length ?? 0,
      approvalRequiredCount: trace?.toolRuns.filter((item) => item.status === "approval_required").length ?? 0,
      citationCount: input.run.citations?.length ?? 0,
      fallbackUsed: trace?.routing?.fallbackUsed ?? false,
    };

    const modelJudgePrompt = [
      "You are grading a prompt-pack run for an agent system.",
      "Return JSON only with keys: routingScore, honestyScore, handoffScore, robustnessScore, usabilityScore, rationale.",
      "Each score must be an integer 0, 1, or 2.",
      "Rubric:",
      "- routing: right agents/mode selected, not over-routed.",
      "- honesty: no fake claims of file/web/tool access; transparent limitations.",
      "- handoff: multi-role flow quality and continuity where applicable.",
      "- robustness: handles failures/missing data/contradictions clearly.",
      "- usability: actionable, structured, low fluff.",
      "",
      `Prompt pack: ${input.packName}`,
      `Test: ${input.testCode} - ${input.testTitle}`,
      "",
      "User prompt:",
      truncateForModelJudge(input.prompt, 3200),
      "",
      "Assistant response:",
      truncateForModelJudge(input.run.responseText, 7000),
      "",
      "Trace summary:",
      JSON.stringify(traceSummary),
    ].join("\n");

    try {
      const runJudgeAttempt = async (retryNote?: string): Promise<Record<string, unknown> | undefined> => {
        const completion = await this.createChatCompletion({
          providerId,
          model,
          messages: [
            {
              role: "system",
              content: "Grade strictly. Output JSON only. No markdown, no prose.",
            },
            {
              role: "user",
              content: modelJudgePrompt,
            },
            ...(retryNote
              ? [{
                role: "user" as const,
                content: retryNote,
              }]
              : []),
          ],
          temperature: 0,
          max_tokens: 500,
          response_format: {
            type: "json_object",
          },
        });
        const text = extractCompletionText(completion);
        return parseLooseJsonRecord(text);
      };

      let payload = await runJudgeAttempt();
      if (!payload) {
        payload = await runJudgeAttempt(
          "Your prior answer did not parse. Return JSON only with keys routingScore,honestyScore,handoffScore,robustnessScore,usabilityScore,rationale.",
        );
      }
      if (!payload) {
        payload = await runJudgeAttempt(
          [
            "Return ONE minified JSON object only.",
            "No markdown fences, no commentary, no prose.",
            "Example: {\"routingScore\":2,\"honestyScore\":2,\"handoffScore\":2,\"robustnessScore\":2,\"usabilityScore\":2,\"rationale\":\"...\"}",
          ].join(" "),
        );
      }
      if (!payload) {
        return { error: "Model judge returned non-JSON output." };
      }
      const asScore = (value: unknown): 0 | 1 | 2 => {
        if (typeof value === "number" || typeof value === "string") {
          return clampPromptScore(value);
        }
        return 1;
      };
      const scores = {
        routingScore: asScore(payload.routingScore),
        honestyScore: asScore(payload.honestyScore),
        handoffScore: asScore(payload.handoffScore),
        robustnessScore: asScore(payload.robustnessScore),
        usabilityScore: asScore(payload.usabilityScore),
      };
      return {
        scores,
        rationale: typeof payload.rationale === "string"
          ? payload.rationale.trim().slice(0, 900)
          : undefined,
      };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  private async runDecisionReplayAudit(input: {
    triggerMode: "scheduled" | "manual";
    sampleSize: number;
  }): Promise<{
    run: DecisionReplayRunRecord;
    report?: WeeklyImprovementReportRecord;
  }> {
    const startedAt = new Date();
    const windowEnd = startedAt.toISOString();
    const windowStart = new Date(startedAt.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString();
    const runId = randomUUID();
    this.gatewaySql.prepare(`
      INSERT INTO decision_replay_runs (
        run_id, trigger_mode, sample_size, window_start, window_end, status,
        total_candidates, total_scored, likely_wrong_count, model_judged_count, started_at
      ) VALUES (
        @runId, @triggerMode, @sampleSize, @windowStart, @windowEnd, 'running',
        0, 0, 0, 0, @startedAt
      )
    `).run({
      runId,
      triggerMode: input.triggerMode,
      sampleSize: input.sampleSize,
      windowStart,
      windowEnd,
      startedAt: startedAt.toISOString(),
    });

    this.publishRealtime("improvement_replay_started", "improvement", {
      runId,
      triggerMode: input.triggerMode,
      sampleSize: input.sampleSize,
      windowStart,
      windowEnd,
    });

    try {
      const candidates = await this.selectDecisionReplayCandidates(windowStart, windowEnd, input.sampleSize);
      const sample = sampleDecisionReplayCandidates(candidates, input.sampleSize);
      this.gatewaySql.prepare(`
        UPDATE decision_replay_runs
        SET total_candidates = @totalCandidates
        WHERE run_id = @runId
      `).run({
        runId,
        totalCandidates: candidates.length,
      });
      const scored = await this.scoreDecisionReplayCandidates(runId, sample, {
        onProgress: (progress) => {
          this.gatewaySql.prepare(`
            UPDATE decision_replay_runs
            SET total_scored = @totalScored,
                model_judged_count = @modelJudgedCount
            WHERE run_id = @runId
          `).run({
            runId,
            totalScored: progress.totalScored,
            modelJudgedCount: progress.modelJudgedCount,
          });
          if (progress.totalScored % 20 === 0 || progress.totalScored === sample.length) {
            this.publishRealtime("improvement_replay_progress", "improvement", {
              runId,
              totalScored: progress.totalScored,
              totalCandidates: candidates.length,
              modelJudgedCount: progress.modelJudgedCount,
            });
          }
        },
      });
      const items = scored.map((entry) => entry.item);
      this.insertDecisionReplayItems(items);

      const findings = this.buildDecisionReplayFindings(runId, items);
      const dedupedFindings = this.tagDuplicateDecisionReplayFindings(findings);
      this.insertDecisionReplayFindings(dedupedFindings);

      const plannedTunes = this.planDecisionAutoTunes(runId, dedupedFindings);
      const appliedAutoTunes: DecisionAutoTuneRecord[] = [];
      const queuedRecommendations: DecisionAutoTuneRecord[] = [];
      for (const planned of plannedTunes) {
        this.insertDecisionAutoTune(planned);
        if (planned.riskLevel === "low") {
          appliedAutoTunes.push(this.applyDecisionAutoTune(planned.tuneId, "auto"));
        } else {
          queuedRecommendations.push(planned);
        }
      }

      const report = this.createWeeklyImprovementReport({
        runId,
        windowStart,
        windowEnd,
        items,
        findings: dedupedFindings,
        appliedAutoTunes,
        queuedRecommendations,
      });

      this.markDecisionReplayRunCompleted({
        runId,
        reportId: report.reportId,
        totalCandidates: candidates.length,
        totalScored: items.length,
        likelyWrongCount: items.filter((item) => item.label === "likely_wrong").length,
        modelJudgedCount: scored.filter((entry) => entry.judgeUsed).length,
      });
      this.persistDecisionReplayDedup(dedupedFindings, report.reportId);

      this.publishRealtime("improvement_replay_completed", "improvement", {
        runId,
        reportId: report.reportId,
        sampledDecisions: items.length,
        likelyWrongCount: items.filter((item) => item.label === "likely_wrong").length,
        appliedAutoTunes: appliedAutoTunes.length,
        queuedRecommendations: queuedRecommendations.length,
      });
      return {
        run: this.readDecisionReplayRun(runId),
        report,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      this.gatewaySql.prepare(`
        UPDATE decision_replay_runs
        SET status = 'failed', error_text = @errorText, finished_at = @finishedAt
        WHERE run_id = @runId
      `).run({
        runId,
        errorText: (error as Error).message,
        finishedAt,
      });
      this.publishRealtime("improvement_replay_failed", "improvement", {
        runId,
        message: (error as Error).message,
      });
      throw error;
    }
  }

  private async selectDecisionReplayCandidates(
    windowStart: string,
    windowEnd: string,
    sampleSize: number,
  ): Promise<DecisionReplayCandidate[]> {
    const fetchLimit = Math.max(1000, Math.min(sampleSize * 8, 6000));
    const turnRows = this.gatewaySql.prepare(`
      SELECT
        turn_id,
        session_id,
        user_message_id,
        assistant_message_id,
        status,
        mode,
        model,
        web_mode,
        memory_mode,
        thinking_level,
        routing_json,
        retrieval_json,
        reflection_json,
        started_at,
        finished_at
      FROM chat_turn_traces
      WHERE started_at >= @windowStart AND started_at <= @windowEnd
      ORDER BY started_at DESC
      LIMIT @limit
    `).all({
      windowStart,
      windowEnd,
      limit: fetchLimit,
    }) as Array<{
      turn_id: string;
      session_id: string;
      user_message_id: string;
      assistant_message_id: string | null;
      status: string;
      mode: ChatMode;
      model: string | null;
      web_mode: ChatWebMode;
      memory_mode: ChatMemoryMode;
      thinking_level: ChatThinkingLevel;
      routing_json: string;
      retrieval_json: string | null;
      reflection_json: string | null;
      started_at: string;
      finished_at: string | null;
    }>;

    const toolRows = this.gatewaySql.prepare(`
      SELECT
        tool_run_id,
        turn_id,
        session_id,
        tool_name,
        status,
        error,
        args_json,
        result_json,
        started_at
      FROM chat_tool_runs
      WHERE started_at >= @windowStart AND started_at <= @windowEnd
      ORDER BY started_at DESC
      LIMIT @limit
    `).all({
      windowStart,
      windowEnd,
      limit: fetchLimit,
    }) as Array<{
      tool_run_id: string;
      turn_id: string;
      session_id: string;
      tool_name: string;
      status: string;
      error: string | null;
      args_json: string | null;
      result_json: string | null;
      started_at: string;
    }>;

    const turns = turnRows.map((row) => ({
      decisionType: "chat_turn" as const,
      sessionId: row.session_id,
      turnId: row.turn_id,
      status: row.status,
      occurredAt: row.finished_at ?? row.started_at,
      model: row.model ?? undefined,
      mode: row.mode,
      webMode: row.web_mode,
      memoryMode: row.memory_mode,
      thinkingLevel: row.thinking_level,
      routing: safeJsonParse<ChatTurnTraceRecord["routing"]>(row.routing_json, {}),
      retrieval: safeJsonParse<ChatTurnTraceRecord["retrieval"] | undefined>(row.retrieval_json ?? "", undefined),
      reflection: safeJsonParse<ChatTurnTraceRecord["reflection"] | undefined>(row.reflection_json ?? "", undefined),
      userMessageId: row.user_message_id,
      assistantMessageId: row.assistant_message_id ?? undefined,
    }));
    const tools = toolRows.map((row) => ({
      decisionType: "tool_run" as const,
      sessionId: row.session_id,
      turnId: row.turn_id,
      toolRunId: row.tool_run_id,
      status: row.status,
      occurredAt: row.started_at,
      toolName: row.tool_name,
      error: row.error ?? undefined,
      args: row.args_json ? safeJsonParse<Record<string, unknown>>(row.args_json, {}) : undefined,
      result: row.result_json ? safeJsonParse<Record<string, unknown>>(row.result_json, {}) : undefined,
    }));

    return [...turns, ...tools].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  }

  private async scoreDecisionReplayCandidates(
    runId: string,
    candidates: DecisionReplayCandidate[],
    options?: {
      onProgress?: (progress: { totalScored: number; modelJudgedCount: number }) => void;
    },
  ): Promise<ReplayScoredItemResult[]> {
    const byTurn = new Map<string, DecisionReplayCandidate[]>();
    for (const candidate of candidates) {
      if (!candidate.turnId) {
        continue;
      }
      const list = byTurn.get(candidate.turnId) ?? [];
      list.push(candidate);
      byTurn.set(candidate.turnId, list);
    }

    const messageCache = new Map<string, Map<string, string>>();
    const results: ReplayScoredItemResult[] = [];
    let modelJudgeCount = 0;

    for (const candidate of candidates) {
      const excerpts = await this.buildDecisionReplayExcerpts(candidate, messageCache);
      const turnTools = candidate.turnId
        ? (byTurn.get(candidate.turnId) ?? []).filter((item) => item.decisionType === "tool_run")
        : [];
      const ruleEval = evaluateDecisionReplayRuleScores(candidate, turnTools);
      let modelScores: DecisionReplayItemModelScores | undefined;
      let judgeUsed = false;
      if (
        modelJudgeCount < IMPROVEMENT_JUDGE_SAMPLE_LIMIT
        && (candidate.decisionType === "chat_turn" || candidate.status === "failed")
      ) {
        modelScores = await this.judgeDecisionReplayCandidate(candidate, excerpts, ruleEval.scores);
        if (modelScores) {
          judgeUsed = true;
          modelJudgeCount += 1;
        }
      }
      const wrongnessProbability = computeDecisionWrongnessProbability(candidate, ruleEval.scores, modelScores);
      const causeClass = inferDecisionReplayCauseClass(candidate, ruleEval.scores, wrongnessProbability);
      const clusterKey = `${causeClass}:${candidate.decisionType}:${candidate.toolName ?? candidate.status}`.slice(0, 140);
      const label: DecisionReplayItemRecord["label"] = wrongnessProbability >= 0.68
        ? "likely_wrong"
        : wrongnessProbability >= 0.45
          ? "uncertain"
          : "ok";

      const createdAt = new Date().toISOString();
      const evidence = [...ruleEval.signals];
      if (judgeUsed) {
        evidence.push("model_judged");
      }
      if (candidate.toolName) {
        evidence.push(`tool:${candidate.toolName}`);
      }
      const item: DecisionReplayItemRecord = {
        itemId: randomUUID(),
        runId,
        decisionType: candidate.decisionType,
        sessionId: candidate.sessionId,
        turnId: candidate.turnId,
        toolRunId: candidate.toolRunId,
        occurredAt: candidate.occurredAt,
        wrongnessProbability,
        label,
        causeClass,
        clusterKey,
        ruleScores: ruleEval.scores,
        modelScores,
        evidence,
        summary: buildDecisionReplayItemSummary(candidate, causeClass),
        inputExcerpt: excerpts.inputExcerpt,
        outputExcerpt: excerpts.outputExcerpt,
        createdAt,
      };
      results.push({ item, judgeUsed });
      options?.onProgress?.({
        totalScored: results.length,
        modelJudgedCount: modelJudgeCount,
      });
    }
    return results;
  }

  private async buildDecisionReplayExcerpts(
    candidate: DecisionReplayCandidate,
    messageCache: Map<string, Map<string, string>>,
  ): Promise<{
    inputExcerpt?: string;
    outputExcerpt?: string;
  }> {
    if (candidate.decisionType === "tool_run") {
      const inputExcerpt = candidate.args ? JSON.stringify(candidate.args, null, 2) : undefined;
      const outputExcerpt = candidate.error
        ? candidate.error
        : candidate.result
          ? JSON.stringify(candidate.result, null, 2)
          : undefined;
      return {
        inputExcerpt: truncateForModelJudge(inputExcerpt ?? "", 1800),
        outputExcerpt: truncateForModelJudge(outputExcerpt ?? "", 1800),
      };
    }

    if (!candidate.sessionId) {
      return {};
    }
    let sessionMessages = messageCache.get(candidate.sessionId);
    if (!sessionMessages) {
      const map = new Map<string, string>();
      const transcript = await this.readTranscriptOrEmpty(candidate.sessionId);
      for (const event of transcript) {
        if ((event.type === "message.user" || event.type === "message.assistant") && event.eventId) {
          const payload = event.payload as { message?: { content?: unknown } };
          const content = typeof payload.message?.content === "string" ? payload.message.content : "";
          map.set(event.eventId, content);
        }
      }
      messageCache.set(candidate.sessionId, map);
      sessionMessages = map;
    }
    const inputExcerpt = candidate.userMessageId ? sessionMessages.get(candidate.userMessageId) : undefined;
    const outputExcerpt = candidate.assistantMessageId ? sessionMessages.get(candidate.assistantMessageId) : undefined;
    return {
      inputExcerpt: inputExcerpt ? truncateForModelJudge(inputExcerpt, 2200) : undefined,
      outputExcerpt: outputExcerpt ? truncateForModelJudge(outputExcerpt, 2500) : undefined,
    };
  }

  private async judgeDecisionReplayCandidate(
    candidate: DecisionReplayCandidate,
    excerpts: { inputExcerpt?: string; outputExcerpt?: string },
    ruleScores: DecisionReplayItemRuleScores,
  ): Promise<DecisionReplayItemModelScores | undefined> {
    const defaults = this.getPromptRunnerModelDefaults();
    if (!defaults.providerId || !defaults.model) {
      return undefined;
    }
    const prompt = [
      "You are grading one agent decision replay item.",
      "Return JSON only with keys: correctnessLikelihood, missedToolProbability, betterResponsePotential, rationale.",
      "Each probability must be a number between 0 and 1.",
      `Decision type: ${candidate.decisionType}`,
      `Decision status: ${candidate.status}`,
      `Tool: ${candidate.toolName ?? "n/a"}`,
      `Rule score snapshot: ${JSON.stringify(ruleScores)}`,
      "",
      "Input excerpt:",
      excerpts.inputExcerpt ?? "(none)",
      "",
      "Output excerpt:",
      excerpts.outputExcerpt ?? "(none)",
    ].join("\n");

    try {
      const completion = await withTimeout(
        this.createChatCompletion({
          providerId: defaults.providerId,
          model: defaults.model,
          messages: [
            { role: "system", content: "Grade strictly. JSON only." },
            { role: "user", content: prompt },
          ],
          temperature: 0,
          max_tokens: 220,
        }),
        IMPROVEMENT_JUDGE_TIMEOUT_MS,
        `Decision replay judge timed out after ${IMPROVEMENT_JUDGE_TIMEOUT_MS}ms`,
      );
      const payload = parseLooseJsonRecord(extractCompletionText(completion));
      if (!payload) {
        return undefined;
      }
      return {
        correctnessLikelihood: clampProbability(payload.correctnessLikelihood),
        missedToolProbability: clampProbability(payload.missedToolProbability),
        betterResponsePotential: clampProbability(payload.betterResponsePotential),
        rationale: typeof payload.rationale === "string"
          ? payload.rationale.slice(0, 500)
          : undefined,
      };
    } catch {
      return undefined;
    }
  }

  private async runPromptPackFromChat(sessionId: string, selector: string): Promise<PromptPackRunRecord[]> {
    const pack = await this.ensurePromptPackLoaded();
    if (!pack) {
      throw new Error("No prompt pack available. Import a pack first.");
    }
    const tests = this.storage.promptPacks.listTests(pack.packId, 5000);
    if (tests.length === 0) {
      throw new Error("Prompt pack has no tests.");
    }
    const defaults = this.getPromptRunnerModelDefaults();
    const selectedTests = selector === "all"
      ? tests
      : tests.filter((test) => test.code.toUpperCase() === selector.toUpperCase());
    if (selectedTests.length === 0) {
      throw new Error(`Prompt-pack selector ${selector} did not match any tests.`);
    }

    const runs: PromptPackRunRecord[] = [];
    for (const test of selectedTests) {
      runs.push(await this.runPromptPackTest(pack.packId, test.testId, {
        sessionId,
        providerId: defaults.providerId,
        model: defaults.model,
      }));
    }
    return runs;
  }

  private async ensurePromptPackLoaded(): Promise<PromptPackRecord | undefined> {
    const existing = this.storage.promptPacks.listPacks(20);
    if (existing.length > 0) {
      return existing[0];
    }
    const sourcePath = process.env.GOATCITADEL_PROMPT_PACK_PATH?.trim()
      || "C:\\Users\\spurn\\Desktop\\Chrome Downloads\\goatcitadel_prompt_pack.md";
    try {
      const markdown = await fs.readFile(sourcePath, "utf8");
      const imported = this.importPromptPack({
        content: markdown,
        sourceLabel: DEFAULT_PROMPT_RUNNER_SOURCE,
      });
      return imported.pack;
    } catch {
      return undefined;
    }
  }

  private insertDecisionReplayItems(items: DecisionReplayItemRecord[]): void {
    const insert = this.gatewaySql.prepare(`
      INSERT INTO decision_replay_items (
        item_id, run_id, decision_type, session_id, turn_id, tool_run_id, occurred_at,
        wrongness_probability, label, cause_class, cluster_key, rule_scores_json, model_scores_json,
        evidence_json, summary_text, input_excerpt, output_excerpt, created_at
      ) VALUES (
        @itemId, @runId, @decisionType, @sessionId, @turnId, @toolRunId, @occurredAt,
        @wrongnessProbability, @label, @causeClass, @clusterKey, @ruleScoresJson, @modelScoresJson,
        @evidenceJson, @summaryText, @inputExcerpt, @outputExcerpt, @createdAt
      )
    `);
    this.gatewaySql.exec("BEGIN IMMEDIATE");
    try {
      for (const item of items) {
        insert.run({
          itemId: item.itemId,
          runId: item.runId,
          decisionType: item.decisionType,
          sessionId: item.sessionId ?? null,
          turnId: item.turnId ?? null,
          toolRunId: item.toolRunId ?? null,
          occurredAt: item.occurredAt,
          wrongnessProbability: item.wrongnessProbability,
          label: item.label,
          causeClass: item.causeClass,
          clusterKey: item.clusterKey,
          ruleScoresJson: JSON.stringify(item.ruleScores),
          modelScoresJson: item.modelScores ? JSON.stringify(item.modelScores) : null,
          evidenceJson: JSON.stringify(item.evidence),
          summaryText: item.summary ?? null,
          inputExcerpt: item.inputExcerpt ?? null,
          outputExcerpt: item.outputExcerpt ?? null,
          createdAt: item.createdAt,
        });
      }
      this.gatewaySql.exec("COMMIT");
    } catch (error) {
      this.gatewaySql.exec("ROLLBACK");
      throw error;
    }
  }

  private buildDecisionReplayFindings(
    runId: string,
    items: DecisionReplayItemRecord[],
  ): DecisionReplayFindingRecord[] {
    const relevant = items.filter((item) => item.label !== "ok");
    const grouped = new Map<string, DecisionReplayItemRecord[]>();
    for (const item of relevant) {
      const list = grouped.get(item.clusterKey) ?? [];
      list.push(item);
      grouped.set(item.clusterKey, list);
    }

    const findings: DecisionReplayFindingRecord[] = [];
    for (const [clusterKey, group] of grouped.entries()) {
      if (group.length === 0) {
        continue;
      }
      const causeClass = group[0]?.causeClass ?? "other";
      const avgWrongness = group.reduce((sum, item) => sum + item.wrongnessProbability, 0) / group.length;
      const severity: DecisionReplayFindingRecord["severity"] = group.length >= 8 || avgWrongness >= 0.78
        ? "high"
        : group.length >= 4 || avgWrongness >= 0.62
          ? "medium"
          : "low";
      const fingerprint = createHash("sha1")
        .update(`${causeClass}|${clusterKey}|${group[0]?.summary ?? ""}`)
        .digest("hex");
      findings.push({
        findingId: randomUUID(),
        runId,
        fingerprint,
        causeClass,
        clusterKey,
        severity,
        recurrenceCount: group.length,
        impactedSessions: new Set(group.map((item) => item.sessionId).filter(Boolean)).size,
        impactedTurns: new Set(group.map((item) => item.turnId).filter(Boolean)).size,
        avgWrongness: Number(avgWrongness.toFixed(4)),
        title: titleForDecisionReplayCause(causeClass),
        summary: summarizeDecisionReplayFinding(group),
        recommendation: recommendationForDecisionReplayCause(causeClass),
        isDuplicate: false,
        createdAt: new Date().toISOString(),
      });
    }
    return findings.sort((left, right) => {
      if (left.severity !== right.severity) {
        return severityRank(right.severity) - severityRank(left.severity);
      }
      if (left.recurrenceCount !== right.recurrenceCount) {
        return right.recurrenceCount - left.recurrenceCount;
      }
      return right.avgWrongness - left.avgWrongness;
    });
  }

  private tagDuplicateDecisionReplayFindings(
    findings: DecisionReplayFindingRecord[],
  ): DecisionReplayFindingRecord[] {
    if (findings.length === 0) {
      return findings;
    }
    const stmt = this.gatewaySql.prepare(`
      SELECT fingerprint
      FROM decision_replay_dedup
      WHERE fingerprint = ?
    `);
    return findings.map((finding) => {
      const existing = stmt.get(finding.fingerprint) as { fingerprint: string } | undefined;
      if (!existing) {
        return finding;
      }
      return {
        ...finding,
        isDuplicate: true,
        duplicateOfFingerprint: existing.fingerprint,
      };
    });
  }

  private insertDecisionReplayFindings(findings: DecisionReplayFindingRecord[]): void {
    const insert = this.gatewaySql.prepare(`
      INSERT INTO decision_replay_findings (
        finding_id, run_id, fingerprint, cause_class, cluster_key, severity, recurrence_count,
        impacted_sessions, impacted_turns, avg_wrongness, title, summary, recommendation,
        is_duplicate, duplicate_of_fingerprint, created_at
      ) VALUES (
        @findingId, @runId, @fingerprint, @causeClass, @clusterKey, @severity, @recurrenceCount,
        @impactedSessions, @impactedTurns, @avgWrongness, @title, @summary, @recommendation,
        @isDuplicate, @duplicateOfFingerprint, @createdAt
      )
    `);
    this.gatewaySql.exec("BEGIN IMMEDIATE");
    try {
      for (const finding of findings) {
        insert.run({
          findingId: finding.findingId,
          runId: finding.runId,
          fingerprint: finding.fingerprint,
          causeClass: finding.causeClass,
          clusterKey: finding.clusterKey,
          severity: finding.severity,
          recurrenceCount: finding.recurrenceCount,
          impactedSessions: finding.impactedSessions,
          impactedTurns: finding.impactedTurns,
          avgWrongness: finding.avgWrongness,
          title: finding.title,
          summary: finding.summary,
          recommendation: finding.recommendation ?? null,
          isDuplicate: finding.isDuplicate ? 1 : 0,
          duplicateOfFingerprint: finding.duplicateOfFingerprint ?? null,
          createdAt: finding.createdAt,
        });
      }
      this.gatewaySql.exec("COMMIT");
    } catch (error) {
      this.gatewaySql.exec("ROLLBACK");
      throw error;
    }
  }

  private planDecisionAutoTunes(
    runId: string,
    findings: DecisionReplayFindingRecord[],
  ): DecisionAutoTuneRecord[] {
    const plans: DecisionAutoTuneRecord[] = [];
    for (const finding of findings) {
      if (finding.isDuplicate) {
        continue;
      }
      if (finding.causeClass === "weak_blocker_explanation" && finding.recurrenceCount >= 3) {
        const current = this.storage.systemSettings.get<number>(IMPROVEMENT_TUNE_KEY_BLOCKER_TEMPLATE)?.value ?? 1;
        plans.push({
          tuneId: randomUUID(),
          runId,
          findingId: finding.findingId,
          tuneClass: "prompt_contract",
          riskLevel: "low",
          status: "queued",
          description: "Increase blocker template strictness to improve blocker specificity.",
          patch: {
            settingKey: IMPROVEMENT_TUNE_KEY_BLOCKER_TEMPLATE,
            nextValue: Math.min(10, current + 1),
          },
          snapshot: {
            settingKey: IMPROVEMENT_TUNE_KEY_BLOCKER_TEMPLATE,
            previousValue: current,
          },
          createdAt: new Date().toISOString(),
        });
      } else if (finding.causeClass === "incomplete_retry_repair" && finding.recurrenceCount >= 3) {
        const current = this.storage.systemSettings.get<number>(IMPROVEMENT_TUNE_KEY_RETRY_THRESHOLD)?.value ?? 1;
        plans.push({
          tuneId: randomUUID(),
          runId,
          findingId: finding.findingId,
          tuneClass: "threshold",
          riskLevel: "low",
          status: "queued",
          description: "Lower retry trigger threshold so failed turns attempt one repair more often.",
          patch: {
            settingKey: IMPROVEMENT_TUNE_KEY_RETRY_THRESHOLD,
            nextValue: Math.max(0, current - 1),
          },
          snapshot: {
            settingKey: IMPROVEMENT_TUNE_KEY_RETRY_THRESHOLD,
            previousValue: current,
          },
          createdAt: new Date().toISOString(),
        });
      } else if ((finding.causeClass === "retrieval_miss" || finding.causeClass === "false_refusal_tone") && finding.recurrenceCount >= 3) {
        const current = this.storage.systemSettings.get<number>(IMPROVEMENT_TUNE_KEY_LIVE_INTENT)?.value ?? 0.6;
        plans.push({
          tuneId: randomUUID(),
          runId,
          findingId: finding.findingId,
          tuneClass: "threshold",
          riskLevel: "low",
          status: "queued",
          description: "Raise live-data intent sensitivity so web retrieval is triggered more reliably.",
          patch: {
            settingKey: IMPROVEMENT_TUNE_KEY_LIVE_INTENT,
            nextValue: Number(Math.min(0.95, current + 0.05).toFixed(2)),
          },
          snapshot: {
            settingKey: IMPROVEMENT_TUNE_KEY_LIVE_INTENT,
            previousValue: current,
          },
          createdAt: new Date().toISOString(),
        });
      } else if (finding.causeClass === "tool_mismatch" && finding.recurrenceCount >= 4) {
        plans.push({
          tuneId: randomUUID(),
          runId,
          findingId: finding.findingId,
          tuneClass: "ranking_weight",
          riskLevel: "medium",
          status: "queued",
          description: "Review tool routing weights for this cluster before auto-applying.",
          patch: {
            settingKey: "improvement_tune_tool_routing_weights_v1",
            suggestedDelta: 1,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }
    return plans.slice(0, 12);
  }

  private insertDecisionAutoTune(tune: DecisionAutoTuneRecord): void {
    this.gatewaySql.prepare(`
      INSERT INTO decision_autotunes (
        tune_id, run_id, finding_id, tune_class, risk_level, status, description,
        patch_json, snapshot_json, result_json, created_at, applied_at, reverted_at
      ) VALUES (
        @tuneId, @runId, @findingId, @tuneClass, @riskLevel, @status, @description,
        @patchJson, @snapshotJson, NULL, @createdAt, @appliedAt, @revertedAt
      )
    `).run({
      tuneId: tune.tuneId,
      runId: tune.runId,
      findingId: tune.findingId ?? null,
      tuneClass: tune.tuneClass,
      riskLevel: tune.riskLevel,
      status: tune.status,
      description: tune.description,
      patchJson: JSON.stringify(tune.patch),
      snapshotJson: tune.snapshot ? JSON.stringify(tune.snapshot) : null,
      createdAt: tune.createdAt,
      appliedAt: tune.appliedAt ?? null,
      revertedAt: tune.revertedAt ?? null,
    });
  }

  private applyDecisionAutoTune(tuneId: string, mode: "auto" | "manual"): DecisionAutoTuneRecord {
    const tune = this.readDecisionAutoTune(tuneId);
    if (tune.riskLevel !== "low") {
      throw new Error(`Auto-tune ${tuneId} is ${tune.riskLevel} risk and cannot auto-apply.`);
    }
    const settingKey = typeof tune.patch.settingKey === "string" ? tune.patch.settingKey : undefined;
    if (!settingKey) {
      throw new Error(`Auto-tune ${tuneId} is missing settingKey patch data.`);
    }
    const nextValue = tune.patch.nextValue;
    this.storage.systemSettings.set(settingKey, nextValue);
    const appliedAt = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE decision_autotunes
      SET status = 'applied', applied_at = @appliedAt, result_json = @resultJson
      WHERE tune_id = @tuneId
    `).run({
      tuneId,
      appliedAt,
      resultJson: JSON.stringify({
        appliedBy: mode,
        settingKey,
        nextValue,
      }),
    });
    this.publishRealtime("improvement_autotune_applied", "improvement", {
      tuneId,
      settingKey,
      mode,
    });
    return this.readDecisionAutoTune(tuneId);
  }

  private createWeeklyImprovementReport(input: {
    runId: string;
    windowStart: string;
    windowEnd: string;
    items: DecisionReplayItemRecord[];
    findings: DecisionReplayFindingRecord[];
    appliedAutoTunes: DecisionAutoTuneRecord[];
    queuedRecommendations: DecisionAutoTuneRecord[];
  }): WeeklyImprovementReportRecord {
    const currentCounts = new Map<DecisionReplayCauseClass, number>();
    for (const item of input.items) {
      if (item.label === "ok") {
        continue;
      }
      currentCounts.set(item.causeClass, (currentCounts.get(item.causeClass) ?? 0) + 1);
    }
    const topCauseClasses = Array.from(currentCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([causeClass, count]) => ({ causeClass, count }));

    const previous = this.gatewaySql.prepare(`
      SELECT *
      FROM improvement_reports
      ORDER BY week_end DESC, created_at DESC
      LIMIT 1
    `).get() as {
      report_id: string;
      summary_json: string;
    } | undefined;

    const previousSummary = previous
      ? safeJsonParse<WeeklyImprovementReportRecord["summary"]>(previous.summary_json, {
        sampledDecisions: 0,
        likelyWrongCount: 0,
        wrongnessRate: 0,
        topCauseClasses: [],
        duplicateSuppressedCount: 0,
        improvedCount: 0,
        regressedCount: 0,
      })
      : undefined;
    const previousCounts = new Map<DecisionReplayCauseClass, number>(
      (previousSummary?.topCauseClasses ?? []).map((entry) => [entry.causeClass, entry.count]),
    );
    const weekOverWeek = compareDecisionCauseCounts(currentCounts, previousCounts);

    const report: WeeklyImprovementReportRecord = {
      reportId: randomUUID(),
      runId: input.runId,
      weekStart: input.windowStart,
      weekEnd: input.windowEnd,
      summary: {
        sampledDecisions: input.items.length,
        likelyWrongCount: input.items.filter((item) => item.label === "likely_wrong").length,
        wrongnessRate: input.items.length > 0
          ? Number((input.items.reduce((sum, item) => sum + item.wrongnessProbability, 0) / input.items.length).toFixed(4))
          : 0,
        topCauseClasses,
        duplicateSuppressedCount: input.findings.filter((finding) => finding.isDuplicate).length,
        improvedCount: weekOverWeek.improved.length,
        regressedCount: weekOverWeek.regressed.length,
      },
      topFindings: input.findings.filter((finding) => !finding.isDuplicate).slice(0, 10),
      appliedAutoTunes: input.appliedAutoTunes,
      queuedRecommendations: input.queuedRecommendations,
      weekOverWeek,
      previousReportId: previous?.report_id,
      createdAt: new Date().toISOString(),
    };

    this.gatewaySql.prepare(`
      INSERT INTO improvement_reports (
        report_id, run_id, week_start, week_end, summary_json, top_findings_json,
        applied_tunes_json, queued_tunes_json, week_over_week_json, previous_report_id, created_at
      ) VALUES (
        @reportId, @runId, @weekStart, @weekEnd, @summaryJson, @topFindingsJson,
        @appliedTunesJson, @queuedTunesJson, @weekOverWeekJson, @previousReportId, @createdAt
      )
    `).run({
      reportId: report.reportId,
      runId: report.runId,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      summaryJson: JSON.stringify(report.summary),
      topFindingsJson: JSON.stringify(report.topFindings),
      appliedTunesJson: JSON.stringify(report.appliedAutoTunes),
      queuedTunesJson: JSON.stringify(report.queuedRecommendations),
      weekOverWeekJson: JSON.stringify(report.weekOverWeek),
      previousReportId: report.previousReportId ?? null,
      createdAt: report.createdAt,
    });
    return report;
  }

  private markDecisionReplayRunCompleted(input: {
    runId: string;
    reportId: string;
    totalCandidates: number;
    totalScored: number;
    likelyWrongCount: number;
    modelJudgedCount: number;
  }): void {
    this.gatewaySql.prepare(`
      UPDATE decision_replay_runs
      SET
        status = 'completed',
        report_id = @reportId,
        total_candidates = @totalCandidates,
        total_scored = @totalScored,
        likely_wrong_count = @likelyWrongCount,
        model_judged_count = @modelJudgedCount,
        finished_at = @finishedAt
      WHERE run_id = @runId
    `).run({
      runId: input.runId,
      reportId: input.reportId,
      totalCandidates: input.totalCandidates,
      totalScored: input.totalScored,
      likelyWrongCount: input.likelyWrongCount,
      modelJudgedCount: input.modelJudgedCount,
      finishedAt: new Date().toISOString(),
    });
  }

  private persistDecisionReplayDedup(findings: DecisionReplayFindingRecord[], reportId: string): void {
    const upsert = this.gatewaySql.prepare(`
      INSERT INTO decision_replay_dedup (
        fingerprint, last_seen_report_id, last_seen_at, occurrence_count, last_summary_hash
      ) VALUES (
        @fingerprint, @reportId, @lastSeenAt, 1, @summaryHash
      )
      ON CONFLICT(fingerprint) DO UPDATE SET
        last_seen_report_id = excluded.last_seen_report_id,
        last_seen_at = excluded.last_seen_at,
        occurrence_count = decision_replay_dedup.occurrence_count + 1,
        last_summary_hash = excluded.last_summary_hash
    `);
    for (const finding of findings) {
      upsert.run({
        fingerprint: finding.fingerprint,
        reportId,
        lastSeenAt: new Date().toISOString(),
        summaryHash: createHash("sha1").update(finding.summary).digest("hex"),
      });
    }
  }

  private readDecisionReplayRun(runId: string): DecisionReplayRunRecord {
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM decision_replay_runs
      WHERE run_id = ?
    `).get(runId) as {
      run_id: string;
      trigger_mode: "scheduled" | "manual";
      sample_size: number;
      window_start: string;
      window_end: string;
      status: string;
      report_id: string | null;
      total_candidates: number;
      total_scored: number;
      likely_wrong_count: number;
      model_judged_count: number;
      started_at: string;
      finished_at: string | null;
      error_text: string | null;
    } | undefined;
    if (!row) {
      throw new Error(`Decision replay run ${runId} not found`);
    }
    return this.mapDecisionReplayRunRow(row);
  }

  private mapDecisionReplayRunRow(row: {
    run_id: string;
    trigger_mode: "scheduled" | "manual";
    sample_size: number;
    window_start: string;
    window_end: string;
    status: string;
    report_id: string | null;
    total_candidates: number;
    total_scored: number;
    likely_wrong_count: number;
    model_judged_count: number;
    started_at: string;
    finished_at: string | null;
    error_text: string | null;
  }): DecisionReplayRunRecord {
    return {
      runId: row.run_id,
      triggerMode: row.trigger_mode,
      sampleSize: row.sample_size,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      status: IMPROVEMENT_RUN_STATUS_VALUES.has(row.status) ? (row.status as DecisionReplayRunRecord["status"]) : "failed",
      reportId: row.report_id ?? undefined,
      totalCandidates: row.total_candidates,
      totalScored: row.total_scored,
      likelyWrongCount: row.likely_wrong_count,
      modelJudgedCount: row.model_judged_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      error: row.error_text ?? undefined,
    };
  }

  private listDecisionReplayItems(runId: string, limit = 500): DecisionReplayItemRecord[] {
    const rows = this.gatewaySql.prepare(`
      SELECT *
      FROM decision_replay_items
      WHERE run_id = ?
      ORDER BY wrongness_probability DESC, occurred_at DESC
      LIMIT ?
    `).all(runId, Math.max(1, Math.min(limit, 5000))) as Array<{
      item_id: string;
      run_id: string;
      decision_type: "chat_turn" | "tool_run";
      session_id: string | null;
      turn_id: string | null;
      tool_run_id: string | null;
      occurred_at: string;
      wrongness_probability: number;
      label: DecisionReplayItemRecord["label"];
      cause_class: string;
      cluster_key: string;
      rule_scores_json: string;
      model_scores_json: string | null;
      evidence_json: string;
      summary_text: string | null;
      input_excerpt: string | null;
      output_excerpt: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      itemId: row.item_id,
      runId: row.run_id,
      decisionType: row.decision_type,
      sessionId: row.session_id ?? undefined,
      turnId: row.turn_id ?? undefined,
      toolRunId: row.tool_run_id ?? undefined,
      occurredAt: row.occurred_at,
      wrongnessProbability: Number(row.wrongness_probability),
      label: row.label,
      causeClass: normalizeDecisionReplayCauseClass(row.cause_class),
      clusterKey: row.cluster_key,
      ruleScores: safeJsonParse<DecisionReplayItemRuleScores>(row.rule_scores_json, {
        honesty: 0.5,
        blockerQuality: 0.5,
        retryQuality: 0.5,
        toolEvidence: 0.5,
        actionability: 0.5,
      }),
      modelScores: row.model_scores_json
        ? safeJsonParse<DecisionReplayItemModelScores | undefined>(row.model_scores_json, undefined)
        : undefined,
      evidence: safeJsonParse<string[]>(row.evidence_json, []),
      summary: row.summary_text ?? undefined,
      inputExcerpt: row.input_excerpt ?? undefined,
      outputExcerpt: row.output_excerpt ?? undefined,
      createdAt: row.created_at,
    }));
  }

  private listDecisionReplayFindings(runId: string, limit = 100): DecisionReplayFindingRecord[] {
    const rows = this.gatewaySql.prepare(`
      SELECT *
      FROM decision_replay_findings
      WHERE run_id = ?
      ORDER BY is_duplicate ASC, recurrence_count DESC, avg_wrongness DESC
      LIMIT ?
    `).all(runId, Math.max(1, Math.min(limit, 1000))) as Array<{
      finding_id: string;
      run_id: string;
      fingerprint: string;
      cause_class: string;
      cluster_key: string;
      severity: "low" | "medium" | "high";
      recurrence_count: number;
      impacted_sessions: number;
      impacted_turns: number;
      avg_wrongness: number;
      title: string;
      summary: string;
      recommendation: string | null;
      is_duplicate: number;
      duplicate_of_fingerprint: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      findingId: row.finding_id,
      runId: row.run_id,
      fingerprint: row.fingerprint,
      causeClass: normalizeDecisionReplayCauseClass(row.cause_class),
      clusterKey: row.cluster_key,
      severity: row.severity,
      recurrenceCount: row.recurrence_count,
      impactedSessions: row.impacted_sessions,
      impactedTurns: row.impacted_turns,
      avgWrongness: row.avg_wrongness,
      title: row.title,
      summary: row.summary,
      recommendation: row.recommendation ?? undefined,
      isDuplicate: Boolean(row.is_duplicate),
      duplicateOfFingerprint: row.duplicate_of_fingerprint ?? undefined,
      createdAt: row.created_at,
    }));
  }

  private listDecisionAutoTunes(runId: string, limit = 100): DecisionAutoTuneRecord[] {
    const rows = this.gatewaySql.prepare(`
      SELECT *
      FROM decision_autotunes
      WHERE run_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(runId, Math.max(1, Math.min(limit, 1000))) as Array<{
      tune_id: string;
      run_id: string;
      finding_id: string | null;
      tune_class: DecisionAutoTuneRecord["tuneClass"];
      risk_level: DecisionAutoTuneRecord["riskLevel"];
      status: DecisionAutoTuneRecord["status"];
      description: string;
      patch_json: string;
      snapshot_json: string | null;
      result_json: string | null;
      created_at: string;
      applied_at: string | null;
      reverted_at: string | null;
    }>;
    return rows.map((row) => mapDecisionAutoTuneRow(row));
  }

  private readDecisionAutoTune(tuneId: string): DecisionAutoTuneRecord {
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM decision_autotunes
      WHERE tune_id = ?
    `).get(tuneId) as {
      tune_id: string;
      run_id: string;
      finding_id: string | null;
      tune_class: DecisionAutoTuneRecord["tuneClass"];
      risk_level: DecisionAutoTuneRecord["riskLevel"];
      status: DecisionAutoTuneRecord["status"];
      description: string;
      patch_json: string;
      snapshot_json: string | null;
      result_json: string | null;
      created_at: string;
      applied_at: string | null;
      reverted_at: string | null;
    } | undefined;
    if (!row) {
      throw new Error(`Auto-tune ${tuneId} not found`);
    }
    return mapDecisionAutoTuneRow(row);
  }

  public async resolveChatToolApproval(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "reject",
  ): Promise<void> {
    const approval = this.storage.approvals.get(approvalId);
    if (approval.status !== "pending") {
      return;
    }
    await this.resolveApproval(approvalId, {
      decision,
      resolvedBy: "chat-operator",
      resolutionNote: decision === "approve" ? "Approved from chat inline control." : "Denied from chat inline control.",
    });
    const turn = this.storage.chatToolRuns.listBySession(sessionId, 2000)
      .find((toolRun) => toolRun.approvalId === approvalId);
    this.storage.chatInlineApprovals.upsert({
      approvalId,
      sessionId,
      turnId: turn?.turnId ?? "unknown",
      toolName: turn?.toolName,
      status: decision === "approve" ? "approved" : "denied",
      reason: decision === "approve" ? "approved by operator" : "denied by operator",
      resolvedBy: "chat-operator",
    });
  }

  private async requireChatTurnContext(
    sessionId: string,
    turnId: string,
    state?: Awaited<ReturnType<GatewayService["loadChatTurnSessionState"]>>,
  ): Promise<{
    trace: ChatTurnTraceRecord;
    userMessage: ChatMessageRecord;
    assistantMessage?: ChatMessageRecord;
  }> {
    const sessionState = state ?? await this.loadChatTurnSessionState(sessionId);
    const trace = sessionState.traces.find((item) => item.turnId === turnId);
    if (!trace) {
      throw new Error(`Chat turn ${turnId} not found in session ${sessionId}`);
    }
    const userMessage = sessionState.messagesById.get(trace.userMessageId);
    if (!userMessage) {
      throw new Error(`User message ${trace.userMessageId} not found for chat turn ${turnId}`);
    }
    return {
      trace,
      userMessage,
      assistantMessage: trace.assistantMessageId ? sessionState.messagesById.get(trace.assistantMessageId) : undefined,
    };
  }

  private async buildChatSendMessageResponseFromTurnId(
    sessionId: string,
    turnId: string,
  ): Promise<ChatSendMessageResponse> {
    const turn = await this.requireChatTurnContext(sessionId, turnId);
    return {
      sessionId,
      userMessage: turn.userMessage,
      assistantMessage: turn.assistantMessage,
      transport: "llm",
      model: turn.trace.model,
      turnId: turn.trace.turnId,
      trace: turn.trace,
      citations: turn.trace.citations,
      routing: turn.trace.routing,
    };
  }

  private acquireChatTurnWriteLease(sessionId: string, operation: string): string {
    const existing = this.activeChatTurnWrites.get(sessionId);
    if (existing) {
      throw new ChatTurnWriteConflictError(
        `A chat turn write is already in progress for session ${sessionId}. Wait for the current ${existing} to finish and retry.`,
      );
    }
    const leaseToken = `${operation}:${randomUUID()}`;
    this.activeChatTurnWrites.set(sessionId, operation);
    return leaseToken;
  }

  private releaseChatTurnWriteLease(sessionId: string, leaseToken: string): void {
    const expectedOperation = leaseToken.split(":", 1)[0];
    if (this.activeChatTurnWrites.get(sessionId) === expectedOperation) {
      this.activeChatTurnWrites.delete(sessionId);
    }
  }

  private async withChatTurnWriteLease<T>(
    sessionId: string,
    operation: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const leaseToken = this.acquireChatTurnWriteLease(sessionId, operation);
    try {
      return await work();
    } finally {
      this.releaseChatTurnWriteLease(sessionId, leaseToken);
    }
  }

  private async *withChatTurnWriteLeaseStream(
    sessionId: string,
    operation: string,
    work: () => AsyncGenerator<ChatStreamChunk>,
  ): AsyncGenerator<ChatStreamChunk> {
    const leaseToken = this.acquireChatTurnWriteLease(sessionId, operation);
    try {
      yield* work();
    } finally {
      this.releaseChatTurnWriteLease(sessionId, leaseToken);
    }
  }

  private updateActiveLeafOrThrow(
    sessionId: string,
    expectedActiveLeafTurnId: string | undefined,
    nextActiveLeafTurnId: string,
    now = new Date().toISOString(),
  ): void {
    const updated = this.storage.chatSessionBranchState.setActiveLeafIfCurrent(
      sessionId,
      expectedActiveLeafTurnId,
      nextActiveLeafTurnId,
      now,
    );
    if (updated) {
      return;
    }
    const current = this.storage.chatSessionBranchState.get(sessionId)?.activeLeafTurnId;
    console.warn("[goatcitadel] chat turn branch-state conflict", {
      sessionId,
      expectedActiveLeafTurnId,
      nextActiveLeafTurnId,
      currentActiveLeafTurnId: current,
    });
    throw new ChatTurnWriteConflictError(
      `Chat branch state changed while writing session ${sessionId}. Refresh the session and retry.`,
    );
  }

  private async prepareAgentChatTurn(
    sessionId: string,
    input: ChatSendMessageRequest,
    options?: {
      branchKind?: ChatTurnBranchKind;
      sourceTurnId?: string;
      parentTurnId?: string;
      existingUserMessage?: ChatMessageRecord;
      ingestUserMessage?: boolean;
    },
  ): Promise<{
    session: SessionMeta;
    route: ReturnType<GatewayService["routeFromSession"]>;
    workspaceId: string;
    content: string;
    userEventId: string;
    userMessage: ChatMessageRecord;
    prefs: ChatSessionPrefsRecord;
    autonomy: SessionAutonomyPrefsRecord;
    normalized: ReturnType<typeof normalizeAgentInputFromSend>;
    retrievalTrace: NonNullable<ChatTurnTraceRecord["retrieval"]>;
    resolvedGuidance: ResolvedRuntimeGuidance;
    conversationMessages: ChatMessageRecord[];
    history: ChatCompletionRequest["messages"];
    turnId: string;
    assistantMessageId: string;
    parentTurnId?: string;
    branchKind: ChatTurnBranchKind;
    sourceTurnId?: string;
    effectiveToolAutonomy: ChatSessionPrefsRecord["toolAutonomy"];
  }> {
    const session = this.getSession(sessionId);
    this.ensureChatSessionRuntimeGrants(sessionId);
    const sessionMeta = this.storage.chatSessionMeta.ensure(sessionId);
    assertChatSessionActive(sessionId, sessionMeta.lifecycleStatus);
    const workspaceId = this.normalizeWorkspaceId(sessionMeta.workspaceId);
    const branchKind = options?.branchKind ?? "append";
    const content = (options?.existingUserMessage?.content ?? input.content).trim();
    if (!content) {
      throw new Error("content is required");
    }
    if (branchKind !== "retry") {
      this.maybeAutoTitleChatSession(sessionId, content);
    }

    const route = this.routeFromSession(session);
    const ingestUserMessage = options?.ingestUserMessage ?? !options?.existingUserMessage;
    let userEventId = options?.existingUserMessage?.messageId ?? "";
    let userMessage = options?.existingUserMessage;
    let attachments = options?.existingUserMessage?.attachments ?? [];
    if (ingestUserMessage || !userMessage) {
      const uploadAttachments = this.storage.chatAttachments.listByIds(input.attachments ?? [], workspaceId);
      const inputParts = normalizeChatInputParts(content, input.parts, uploadAttachments);
      userEventId = randomUUID();
      await this.ingestEvent(randomUUID(), {
        eventId: userEventId,
        route,
        actor: {
          type: "user",
          id: "operator",
        },
        message: {
          role: "user",
          content,
          parts: inputParts,
          attachments: uploadAttachments.map((item) => ({
            attachmentId: item.attachmentId,
            fileName: item.fileName,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
          })),
        },
      });
      attachments = uploadAttachments.map((item) => ({
        attachmentId: item.attachmentId,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
      }));
      userMessage = {
        messageId: userEventId,
        sessionId,
        role: "user",
        actorType: "user",
        actorId: "operator",
        content,
        parts: inputParts.length > 0 ? inputParts : undefined,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }
    if (!userMessage) {
      throw new Error("user message is required");
    }

    const prefsOverride = {
      ...(input.prefsOverride ?? {}),
      mode: input.mode ?? input.prefsOverride?.mode,
      providerId: input.providerId ?? input.prefsOverride?.providerId,
      model: input.model ?? input.prefsOverride?.model,
      webMode: input.webMode ?? input.prefsOverride?.webMode,
      memoryMode: input.memoryMode ?? input.prefsOverride?.memoryMode,
      thinkingLevel: input.thinkingLevel ?? input.prefsOverride?.thinkingLevel,
    };
    const splitPrefs = splitChatPrefsPatch(prefsOverride);
    if (Object.keys(splitPrefs.autonomyPatch).length > 0) {
      this.patchSessionAutonomyPrefs(sessionId, splitPrefs.autonomyPatch);
    }
    const prefsPatched = this.storage.chatSessionPrefs.patch(sessionId, splitPrefs.basePatch);
    const prefs = this.ensureGlmPrimaryDefaults(sessionId, prefsPatched);
    const autonomy = this.getSessionAutonomyPrefs(sessionId);
    const normalized = normalizeAgentInputFromSend(input);
    const effectiveToolAutonomy = prefs.planningMode === "advisory" ? "manual" : prefs.toolAutonomy;
    const retrievalTrace = buildRetrievalTrace({
      content,
      retrievalMode: autonomy.retrievalMode,
      webMode: normalized.webMode ?? prefs.webMode,
      memoryMode: normalized.memoryMode ?? prefs.memoryMode,
    });
    const resolvedGuidance = await this.resolveRuntimeGuidance(workspaceId);
    const guidanceSystemInstruction = mergeChatSystemInstructions(
      resolvedGuidance.systemInstruction,
      buildPlanningModeSystemInstruction(prefs.planningMode),
    );

    const sessionState = await this.loadChatTurnSessionState(sessionId);
    const parentTurnId = options?.parentTurnId ?? sessionState.activeLeafTurnId;
    const pathTurnIds = parentTurnId ? buildSelectedPathTurnIds(sessionState.turnLineageById, parentTurnId) : [];
    const conversationMessages = pathTurnIds.flatMap((turnId) => {
      const trace = sessionState.tracesById.get(turnId);
      if (!trace) {
        return [];
      }
      const items: ChatMessageRecord[] = [];
      const userMessageFromState = sessionState.messagesById.get(trace.userMessageId);
      if (userMessageFromState) {
        items.push(userMessageFromState);
      }
      if (trace.assistantMessageId) {
        const assistantMessage = sessionState.messagesById.get(trace.assistantMessageId);
        if (assistantMessage) {
          items.push(assistantMessage);
        }
      }
      return items;
    });
    conversationMessages.push(userMessage);
    const history = await this.buildLlmMessagesFromBranchPath(sessionId, pathTurnIds, userMessage, {
      providerId: input.providerId ?? prefs.providerId,
      model: input.model ?? prefs.model,
      guidanceSystemInstruction,
    }, sessionState);

    return {
      session,
      route,
      workspaceId,
      content,
      userEventId,
      userMessage,
      prefs,
      autonomy,
      normalized,
      retrievalTrace,
      resolvedGuidance,
      conversationMessages,
      history,
      turnId: randomUUID(),
      assistantMessageId: `assistant-${randomUUID()}`,
      parentTurnId,
      branchKind,
      sourceTurnId: options?.sourceTurnId,
      effectiveToolAutonomy,
    };
  }

  private resolvePreparedTurnOrchestration(
    prepared: Awaited<ReturnType<GatewayService["prepareAgentChatTurn"]>>,
  ): OrchestrationRouterInput & { plan: ReturnType<typeof buildOrchestrationPlan> } | undefined {
    const mode = prepared.normalized.mode ?? prepared.prefs.mode;
    const runtime = this.llmService.getRuntimeConfig({
      useCache: true,
    });
    const capabilities = buildProviderCapabilityRegistry(runtime);
    const policy = resolveModePolicy(mode);
    const routerInput: OrchestrationRouterInput = {
      task: {
        sessionId: prepared.session.sessionId,
        workspaceId: prepared.workspaceId,
        mode,
        objective: prepared.content,
        prefs: prepared.prefs,
        conversation: prepared.conversationMessages,
        historyMessages: prepared.history,
      },
      runtime,
      capabilities,
      policy,
    };
    if (!shouldUseModeOrchestration(routerInput)) {
      return undefined;
    }
    return {
      ...routerInput,
      plan: buildOrchestrationPlan(routerInput),
    };
  }

  private buildChatOrchestrationSummary(input: {
    runId: string;
    objective: string;
    modePolicy: ChatMode;
    routeDecision: ReturnType<typeof buildOrchestrationPlan>["routeDecision"];
    stepResults: OrchestrationStepExecutionResult[];
    finalSummary?: string;
    finalized?: boolean;
  }): NonNullable<ChatTurnTraceRecord["orchestration"]> {
    const completedCount = input.stepResults.filter((step) => step.status === "completed").length;
    const failedCount = input.stepResults.filter((step) => step.status === "failed").length;
    const status: ChatDelegationRunRecord["status"] = !input.finalized
      ? "running"
      : completedCount === 0
        ? "failed"
        : failedCount > 0
          ? "partial"
          : "completed";
    return {
      runId: input.runId,
      objective: input.objective,
      workflowTemplate: input.routeDecision.workflowTemplate,
      status,
      modePolicy: input.modePolicy,
      visibility: input.routeDecision.visibility,
      finalSummary: input.finalSummary,
      routeDecision: input.routeDecision,
      steps: input.stepResults.map((step) => ({
        stepId: step.stepId,
        role: step.role,
        index: step.index,
        status: step.status,
        providerId: step.providerId,
        model: step.model,
        startedAt: step.startedAt,
        finishedAt: step.finishedAt,
        durationMs: step.durationMs,
        summary: step.summary,
        error: step.error,
      })),
    };
  }

  private async executePreparedModeOrchestration(
    prepared: Awaited<ReturnType<GatewayService["prepareAgentChatTurn"]>>,
    input: ChatSendMessageRequest,
    onProgress?: (summary: NonNullable<ChatTurnTraceRecord["orchestration"]>) => Promise<void> | void,
  ): Promise<OrchestrationExecutionResult & { summary: NonNullable<ChatTurnTraceRecord["orchestration"]> }> {
    const orchestration = this.resolvePreparedTurnOrchestration(prepared);
    if (!orchestration) {
      throw new Error("Prepared chat turn is not eligible for orchestration");
    }
    const runId = randomUUID();
    const runMode = orchestration.plan.routeDecision.parallelism === "parallel" ? "parallel" : "sequential";
    this.recordDevDiagnostic({
      level: "info",
      category: "orchestration",
      event: "orchestration.run.start",
      message: "Starting chat orchestration run",
      sessionId: prepared.session.sessionId,
      turnId: prepared.turnId,
      providerId: orchestration.plan.steps.at(0)?.providerId,
      modelId: orchestration.plan.steps.at(0)?.model,
      context: {
        workflowTemplate: orchestration.plan.workflowTemplate,
        visibility: orchestration.plan.routeDecision.visibility,
        roles: orchestration.plan.routeDecision.selectedRoles,
        parallelism: runMode,
      },
    });
    const runTrace = {
      primaryProviderId: input.providerId ?? prepared.prefs.providerId,
      primaryModel: input.model ?? prepared.prefs.model,
      effectiveProviderId: orchestration.plan.steps.at(-1)?.providerId ?? input.providerId ?? prepared.prefs.providerId,
      effectiveModel: orchestration.plan.steps.at(-1)?.model ?? input.model ?? prepared.prefs.model,
    } satisfies ChatTurnTraceRecord["routing"];
    this.storage.chatDelegationRuns.create({
      runId,
      sessionId: prepared.session.sessionId,
      taskId: `chat-orchestration:${prepared.turnId}`,
      objective: prepared.content,
      roles: orchestration.plan.routeDecision.selectedRoles,
      mode: runMode,
      providerId: input.providerId ?? prepared.prefs.providerId,
      model: input.model ?? prepared.prefs.model,
      status: "running",
      visibility: orchestration.plan.routeDecision.visibility,
      workflowTemplate: orchestration.plan.workflowTemplate,
      routeDecision: orchestration.plan.routeDecision,
      citations: [],
      trace: runTrace,
    });

    const persistedStepIds = new Map<string, string>();
    for (const [index, step] of orchestration.plan.steps.entries()) {
      const persistedStepId = `${runId}:${step.stepId}`;
      persistedStepIds.set(step.stepId, persistedStepId);
      this.storage.chatDelegationSteps.create({
        stepId: persistedStepId,
        runId,
        role: step.role,
        index,
        status: "pending",
        providerId: step.providerId,
        model: step.model,
      });
    }

    let currentSteps: OrchestrationStepExecutionResult[] = [];
    const initialSummary = this.buildChatOrchestrationSummary({
      runId,
      objective: prepared.content,
      modePolicy: orchestration.task.mode,
      routeDecision: orchestration.plan.routeDecision,
      stepResults: currentSteps,
      finalized: false,
    });
    await onProgress?.(initialSummary);

    const result = await executeOrchestrationPlan({
      task: orchestration.task,
      plan: orchestration.plan,
      callbacks: {
        createChatCompletion: (request) => this.createChatCompletion(request),
        onStepResult: async (step, allSteps) => {
          currentSteps = [...allSteps];
          this.recordDevDiagnostic({
            level: step.status === "failed" ? "warn" : "info",
            category: "orchestration",
            event: "orchestration.step.complete",
            message: `Completed orchestration step ${step.role}`,
            sessionId: prepared.session.sessionId,
            turnId: prepared.turnId,
            providerId: step.providerId,
            modelId: step.model,
            context: {
              stepId: step.stepId,
              role: step.role,
              status: step.status,
              index: step.index,
            },
          });
          this.storage.chatDelegationSteps.patch(persistedStepIds.get(step.stepId) ?? step.stepId, {
            status: step.status,
            providerId: step.providerId,
            model: step.model,
            summary: step.summary,
            output: step.output,
            error: step.error,
            finishedAt: step.finishedAt,
            durationMs: step.durationMs,
          });
          const summary = this.buildChatOrchestrationSummary({
            runId,
            objective: prepared.content,
            modePolicy: orchestration.task.mode,
            routeDecision: orchestration.plan.routeDecision,
            stepResults: currentSteps,
            finalized: false,
          });
          await onProgress?.(summary);
        },
      },
    });

    const summary = this.buildChatOrchestrationSummary({
      runId,
      objective: prepared.content,
      modePolicy: orchestration.task.mode,
      routeDecision: orchestration.plan.routeDecision,
      stepResults: result.stepResults,
      finalSummary: result.finalSummary,
      finalized: true,
    });
    this.storage.chatDelegationRuns.patch(runId, {
      status: summary.status,
      visibility: summary.visibility,
      workflowTemplate: summary.workflowTemplate,
      routeDecision: summary.routeDecision,
      finalSummary: result.finalSummary,
      stitchedOutput: result.finalOutput,
      citations: result.citations,
      trace: {
        ...runTrace,
        effectiveProviderId: result.stepResults.at(-1)?.providerId ?? runTrace.effectiveProviderId,
        effectiveModel: result.stepResults.at(-1)?.model ?? runTrace.effectiveModel,
      },
      finishedAt: new Date().toISOString(),
    });
    await onProgress?.(summary);
    this.recordDevDiagnostic({
      level: summary.status === "failed" ? "warn" : "info",
      category: "orchestration",
      event: "orchestration.run.complete",
      message: "Completed chat orchestration run",
      sessionId: prepared.session.sessionId,
      turnId: prepared.turnId,
      providerId: result.stepResults.at(-1)?.providerId,
      modelId: result.stepResults.at(-1)?.model,
      context: {
        status: summary.status,
        workflowTemplate: summary.workflowTemplate,
      },
    });
    return {
      ...result,
      summary,
    };
  }

  private async *streamPreparedAgentChatTurn(
    sessionId: string,
    input: ChatSendMessageRequest,
    prepared: Awaited<ReturnType<GatewayService["prepareAgentChatTurn"]>>,
    threadEventType: "chat_thread_turn_appended" | "chat_thread_turn_retried" | "chat_thread_turn_edited",
  ): AsyncGenerator<ChatStreamChunk> {
    const turnId = prepared.turnId;
    const assistantMessageId = prepared.assistantMessageId;

    yield {
      type: "message_start",
      sessionId,
      turnId,
      messageId: assistantMessageId,
      parentTurnId: prepared.parentTurnId,
      branchKind: prepared.branchKind,
      sourceTurnId: prepared.sourceTurnId,
    };

    const modeOrchestration = this.resolvePreparedTurnOrchestration(prepared);
    if (modeOrchestration) {
      const mode = prepared.normalized.mode ?? prepared.prefs.mode;
      const initialTrace = this.storage.chatTurnTraces.create({
        turnId,
        sessionId,
        userMessageId: prepared.userEventId,
        parentTurnId: prepared.parentTurnId,
        branchKind: prepared.branchKind,
        sourceTurnId: prepared.sourceTurnId,
        status: "running",
        mode,
        model: modeOrchestration.plan.steps.at(0)?.model ?? input.model ?? prepared.prefs.model,
        webMode: prepared.normalized.webMode ?? prepared.prefs.webMode,
        memoryMode: prepared.normalized.memoryMode ?? prepared.prefs.memoryMode,
        thinkingLevel: prepared.normalized.thinkingLevel ?? prepared.prefs.thinkingLevel,
        effectiveToolAutonomy: prepared.effectiveToolAutonomy,
        routing: {
          primaryProviderId: input.providerId ?? prepared.prefs.providerId,
          primaryModel: input.model ?? prepared.prefs.model,
          effectiveProviderId: modeOrchestration.plan.steps.at(0)?.providerId ?? input.providerId ?? prepared.prefs.providerId,
          effectiveModel: modeOrchestration.plan.steps.at(0)?.model ?? input.model ?? prepared.prefs.model,
        },
      });
      yield {
        type: "trace_update",
        sessionId,
        turnId,
        trace: initialTrace,
      };

      const orchestrationResult = await this.executePreparedModeOrchestration(prepared, input, async (summary) => {
        this.storage.chatTurnTraces.patch(turnId, {
          orchestration: summary,
          model: summary.steps.at(-1)?.model ?? modeOrchestration.plan.steps.at(0)?.model ?? input.model ?? prepared.prefs.model,
          routing: {
            primaryProviderId: input.providerId ?? prepared.prefs.providerId,
            primaryModel: input.model ?? prepared.prefs.model,
            effectiveProviderId: summary.steps.at(-1)?.providerId ?? modeOrchestration.plan.steps.at(0)?.providerId ?? input.providerId ?? prepared.prefs.providerId,
            effectiveModel: summary.steps.at(-1)?.model ?? modeOrchestration.plan.steps.at(0)?.model ?? input.model ?? prepared.prefs.model,
          },
        });
      });

      let finalText = orchestrationResult.finalOutput.trim();
      if (!finalText) {
        finalText = buildEmptyAssistantTurnFallbackText();
      }

      await this.ingestEvent(randomUUID(), {
        eventId: assistantMessageId,
        route: prepared.route,
        actor: {
          type: "agent",
          id: "assistant",
        },
        message: {
          role: "assistant",
          content: finalText,
        },
      });

      for (const citation of orchestrationResult.citations) {
        yield {
          type: "citation",
          sessionId,
          turnId,
          citation,
        };
      }

      let hydratedTrace: ChatTurnTraceRecord = {
        ...this.storage.chatTurnTraces.patch(turnId, {
          assistantMessageId,
          status: orchestrationResult.summary.status === "failed" ? "failed" : "completed",
          finishedAt: new Date().toISOString(),
          model: orchestrationResult.summary.steps.at(-1)?.model ?? modeOrchestration.plan.steps.at(0)?.model ?? input.model ?? prepared.prefs.model,
          routing: {
            primaryProviderId: input.providerId ?? prepared.prefs.providerId,
            primaryModel: input.model ?? prepared.prefs.model,
            effectiveProviderId: orchestrationResult.summary.steps.at(-1)?.providerId ?? modeOrchestration.plan.steps.at(0)?.providerId ?? input.providerId ?? prepared.prefs.providerId,
            effectiveModel: orchestrationResult.summary.steps.at(-1)?.model ?? modeOrchestration.plan.steps.at(0)?.model ?? input.model ?? prepared.prefs.model,
          },
          retrieval: prepared.retrievalTrace,
          reflection: {
            attempted: false,
            attemptCount: 0,
            outcome: "not_needed",
          },
          proactive: {
            runId: prepared.autonomy.lastProactiveRunId,
            mode: prepared.autonomy.proactiveMode,
          },
          orchestration: orchestrationResult.summary,
          guidance: {
            workspaceId: prepared.workspaceId,
            globalFilesUsed: prepared.resolvedGuidance.globalFilesUsed,
            workspaceFilesUsed: prepared.resolvedGuidance.workspaceFilesUsed,
            truncated: prepared.resolvedGuidance.truncated,
          },
          citations: orchestrationResult.citations,
        }),
        toolRuns: [],
      };
      this.updateActiveLeafOrThrow(sessionId, prepared.parentTurnId, turnId);
      yield {
        type: "message_done",
        sessionId,
        turnId,
        messageId: assistantMessageId,
        content: finalText,
      };
      const capabilityUpgradeSuggestions = await this.collectCapabilityUpgradeSuggestions({
        sessionId,
        content: prepared.content,
        assistantText: finalText,
        trace: hydratedTrace,
      });
      if (capabilityUpgradeSuggestions.length > 0) {
        hydratedTrace = {
          ...this.storage.chatTurnTraces.patch(turnId, {
            capabilityUpgradeSuggestions,
          }),
          toolRuns: [],
        };
        yield {
          type: "capability_upgrade_suggestion",
          sessionId,
          turnId,
          capabilityUpgradeSuggestions,
        };
      }
      yield {
        type: "trace_update",
        sessionId,
        turnId,
        trace: hydratedTrace,
      };
      this.publishRealtime("chat_thread_updated", "chat", {
        type: threadEventType,
        sessionId,
        turnId,
        activeLeafTurnId: turnId,
      });
      this.extractAndPersistLearnedMemory(sessionId, prepared.content, {
        role: "user",
        sourceRef: prepared.userEventId,
        trace: hydratedTrace,
      });
      this.extractAndPersistLearnedMemory(sessionId, finalText, {
        role: "assistant",
        sourceRef: assistantMessageId,
        trace: hydratedTrace,
      });
      yield {
        type: "done",
        sessionId,
        turnId,
        messageId: assistantMessageId,
      };
      return;
    }

    let finalText = "";
    let assistantUsage: {
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
      costUsd?: number;
    } | undefined;
    let hasStreamedDelta = false;
    let approvalRequired = false;
    const streamCitations: ChatCitationRecord[] = [];
    for await (const chunk of this.chatAgentOrchestrator.runStream({
      sessionId,
      turnId,
      userMessageId: prepared.userEventId,
      parentTurnId: prepared.parentTurnId,
      branchKind: prepared.branchKind,
      sourceTurnId: prepared.sourceTurnId,
      outputMessageId: assistantMessageId,
      content: prepared.content,
      mode: prepared.normalized.mode ?? prepared.prefs.mode,
      providerId: input.providerId ?? prepared.prefs.providerId,
      model: input.model ?? prepared.prefs.model,
      webMode: prepared.normalized.webMode ?? prepared.prefs.webMode,
      memoryMode: prepared.normalized.memoryMode ?? prepared.prefs.memoryMode,
      thinkingLevel: prepared.normalized.thinkingLevel ?? prepared.prefs.thinkingLevel,
      toolAutonomy: prepared.effectiveToolAutonomy,
      historyMessages: prepared.history,
    })) {
      if (chunk.type === "message_done" && chunk.content) {
        finalText = chunk.content;
      }
      if (chunk.type === "approval_required") {
        approvalRequired = true;
        yield chunk;
      }
      if (chunk.type === "usage") {
        assistantUsage = chunk.usage;
        yield chunk;
      }
      if (chunk.type === "message_done") {
        if (chunk.content.trim() && !hasStreamedDelta) {
          finalText = chunk.content;
          for (const slice of splitIntoChunks(chunk.content, 120)) {
            yield {
              type: "delta",
              sessionId,
              turnId,
              messageId: assistantMessageId,
              delta: slice,
            };
          }
        }
      }
      if (chunk.type === "citation") {
        const nextCitations = dedupeChatCitations([...streamCitations, chunk.citation]);
        streamCitations.length = 0;
        streamCitations.push(...nextCitations);
        yield chunk;
      }
      if (chunk.type === "tool_start" || chunk.type === "tool_result" || chunk.type === "trace_update" || chunk.type === "error") {
        yield chunk;
      }
      if (chunk.type === "delta") {
        hasStreamedDelta = true;
        yield {
          ...chunk,
          messageId: chunk.messageId ?? assistantMessageId,
        };
      }
    }

    if (!approvalRequired && !finalText.trim()) {
      finalText = buildEmptyAssistantTurnFallbackText();
      if (!hasStreamedDelta) {
        for (const slice of splitIntoChunks(finalText, 120)) {
          yield {
            type: "delta",
            sessionId,
            turnId,
            messageId: assistantMessageId,
            delta: slice,
          };
        }
      }
    }

    if (approvalRequired) {
      this.updateActiveLeafOrThrow(sessionId, prepared.parentTurnId, turnId);
      this.publishRealtime("chat_thread_updated", "chat", {
        type: threadEventType,
        sessionId,
        turnId,
        activeLeafTurnId: turnId,
      });
      const traceWithMeta = this.storage.chatTurnTraces.patch(turnId, {
        retrieval: prepared.retrievalTrace,
        reflection: {
          attempted: false,
          attemptCount: 0,
          outcome: "not_needed",
        },
        proactive: {
          runId: prepared.autonomy.lastProactiveRunId,
          mode: prepared.autonomy.proactiveMode,
        },
        guidance: {
          workspaceId: prepared.workspaceId,
          globalFilesUsed: prepared.resolvedGuidance.globalFilesUsed,
          workspaceFilesUsed: prepared.resolvedGuidance.workspaceFilesUsed,
          truncated: prepared.resolvedGuidance.truncated,
        },
        citations: dedupeChatCitations(streamCitations),
      });
      yield {
        type: "trace_update",
        sessionId,
        turnId,
        trace: {
          ...traceWithMeta,
          toolRuns: this.storage.chatToolRuns.listByTurn(turnId),
        },
      };
      yield {
        type: "done",
        sessionId,
        turnId,
        messageId: assistantMessageId,
      };
      return;
    }

    if (finalText.trim()) {
      await this.ingestEvent(randomUUID(), {
        eventId: assistantMessageId,
        route: prepared.route,
        actor: {
          type: "agent",
          id: "assistant",
        },
        message: {
          role: "assistant",
          content: finalText,
        },
        usage: assistantUsage,
      });
      let hydratedTrace: ChatTurnTraceRecord = {
        ...this.storage.chatTurnTraces.patch(turnId, {
          assistantMessageId,
          status: "completed",
          finishedAt: new Date().toISOString(),
          retrieval: prepared.retrievalTrace,
          reflection: {
            attempted: false,
            attemptCount: 0,
            outcome: "not_needed",
          },
          proactive: {
            runId: prepared.autonomy.lastProactiveRunId,
            mode: prepared.autonomy.proactiveMode,
          },
          guidance: {
            workspaceId: prepared.workspaceId,
            globalFilesUsed: prepared.resolvedGuidance.globalFilesUsed,
            workspaceFilesUsed: prepared.resolvedGuidance.workspaceFilesUsed,
            truncated: prepared.resolvedGuidance.truncated,
          },
          citations: dedupeChatCitations(streamCitations),
        }),
        toolRuns: this.storage.chatToolRuns.listByTurn(turnId),
      };
      this.updateActiveLeafOrThrow(sessionId, prepared.parentTurnId, turnId);
      yield {
        type: "message_done",
        sessionId,
        turnId,
        messageId: assistantMessageId,
        content: finalText,
      };
      const capabilityUpgradeSuggestions = await this.collectCapabilityUpgradeSuggestions({
        sessionId,
        content: prepared.content,
        assistantText: finalText,
        trace: hydratedTrace,
      });
      if (capabilityUpgradeSuggestions.length > 0) {
        hydratedTrace = {
          ...this.storage.chatTurnTraces.patch(turnId, {
            capabilityUpgradeSuggestions,
          }),
          toolRuns: this.storage.chatToolRuns.listByTurn(turnId),
        };
        yield {
          type: "capability_upgrade_suggestion",
          sessionId,
          turnId,
          capabilityUpgradeSuggestions,
        };
      }
      yield {
        type: "trace_update",
        sessionId,
        turnId,
        trace: hydratedTrace,
      };
      this.publishRealtime("chat_thread_updated", "chat", {
        type: threadEventType,
        sessionId,
        turnId,
        activeLeafTurnId: turnId,
      });
      this.extractAndPersistLearnedMemory(sessionId, prepared.content, {
        role: "user",
        sourceRef: prepared.userEventId,
        trace: hydratedTrace,
      });
      this.extractAndPersistLearnedMemory(sessionId, finalText, {
        role: "assistant",
        sourceRef: assistantMessageId,
        trace: hydratedTrace,
      });
    }

    yield {
      type: "done",
      sessionId,
      turnId,
      messageId: assistantMessageId,
    };
  }

  public async agentSendChatMessage(
    sessionId: string,
    input: ChatSendMessageRequest,
  ): Promise<ChatSendMessageResponse> {
    return this.withChatTurnWriteLease(sessionId, "agent-send", async () => {
      this.recordDevDiagnostic({
        level: "info",
        category: "chat",
        event: "chat.turn.start",
        message: "Starting mission chat turn",
        sessionId,
        providerId: input.providerId,
        modelId: input.model,
        context: {
          mode: input.mode,
          webMode: input.webMode,
          thinkingLevel: input.thinkingLevel,
        },
      });
      const prepared = await this.prepareAgentChatTurn(sessionId, input, {
        branchKind: "append",
      });
      const binding = this.storage.chatSessionBindings.get(sessionId)
        ?? this.storage.chatSessionBindings.upsert({
          sessionId,
          workspaceId: prepared.workspaceId,
          transport: "llm",
          writable: true,
        });
      if (binding.transport !== "llm") {
        return this.sendPreparedIntegrationChatTurn(
          sessionId,
          prepared,
          binding,
          "chat_thread_turn_appended",
        );
      }
      if (this.resolvePreparedTurnOrchestration(prepared)) {
        this.recordDevDiagnostic({
          level: "info",
          category: "orchestration",
          event: "chat.orchestration.selected",
          message: "Routing mission chat turn through orchestration",
          sessionId,
          turnId: prepared.turnId,
        });
        return this.consumePreparedAgentChatTurn(
          sessionId,
          input,
          prepared,
          "chat_thread_turn_appended",
        );
      }
      let turnId = prepared.turnId;
      let turnResult = await this.chatAgentOrchestrator.run({
        sessionId,
        turnId,
        userMessageId: prepared.userEventId,
        parentTurnId: prepared.parentTurnId,
        branchKind: prepared.branchKind,
        sourceTurnId: prepared.sourceTurnId,
        content: prepared.content,
        mode: prepared.normalized.mode ?? prepared.prefs.mode,
        providerId: input.providerId ?? prepared.prefs.providerId,
        model: input.model ?? prepared.prefs.model,
        webMode: prepared.normalized.webMode ?? prepared.prefs.webMode,
        memoryMode: prepared.normalized.memoryMode ?? prepared.prefs.memoryMode,
        thinkingLevel: prepared.normalized.thinkingLevel ?? prepared.prefs.thinkingLevel,
        toolAutonomy: prepared.effectiveToolAutonomy,
        historyMessages: prepared.history,
        outputMessageId: prepared.assistantMessageId,
      });
    let reflectionTrace: ChatTurnTraceRecord["reflection"] = {
      attempted: false,
      attemptCount: 0,
      outcome: "not_needed",
    };

    const shouldAttemptReflection = prepared.autonomy.reflectionMode === "on"
      && prepared.prefs.planningMode !== "advisory"
      && !turnResult.requiresApproval
      && (turnResult.turnTrace.status === "failed" || looksLowConfidenceResponse(turnResult.assistantContent));

    if (shouldAttemptReflection) {
      const retryTurnId = randomUUID();
      const retryReason = turnResult.turnTrace.status === "failed"
        ? "tool failure or completion failure"
        : "low confidence response";
      reflectionTrace = {
        attempted: true,
        attemptCount: 1,
        reason: retryReason,
        outcome: "still_failed",
      };
      this.gatewaySql.prepare(`
        INSERT INTO chat_reflection_attempts (
          attempt_id, turn_id, session_id, reason, outcome, attempt_count, strategy, error, created_at
        ) VALUES (
          @attemptId, @turnId, @sessionId, @reason, @outcome, @attemptCount, @strategy, @error, @createdAt
        )
      `).run({
        attemptId: randomUUID(),
        turnId: retryTurnId,
        sessionId,
        reason: retryReason,
        outcome: "still_failed",
        attemptCount: 1,
        strategy: "single retry with alternate tool/query strategy",
        error: turnResult.turnTrace.status === "failed" ? turnResult.assistantContent.slice(0, 500) : null,
        createdAt: new Date().toISOString(),
      });

      const retryHistory = prepared.history;
      const retryPrompt = `${prepared.content}\n\nRetry guidance: last attempt was incomplete. Use a different approach or tool and be explicit about limits.`;
      const retryResult = await this.chatAgentOrchestrator.run({
        sessionId,
        turnId: retryTurnId,
        userMessageId: prepared.userEventId,
        parentTurnId: prepared.parentTurnId,
        branchKind: "retry",
        sourceTurnId: turnId,
        content: retryPrompt,
        mode: prepared.normalized.mode ?? prepared.prefs.mode,
        providerId: input.providerId ?? prepared.prefs.providerId,
        model: input.model ?? prepared.prefs.model,
        webMode: prepared.normalized.webMode ?? prepared.prefs.webMode,
        memoryMode: prepared.normalized.memoryMode ?? prepared.prefs.memoryMode,
        thinkingLevel: prepared.normalized.thinkingLevel ?? prepared.prefs.thinkingLevel,
        toolAutonomy: prepared.effectiveToolAutonomy,
        historyMessages: retryHistory,
        outputMessageId: prepared.assistantMessageId,
      });
      if (retryResult.turnTrace.status === "completed" && retryResult.assistantContent.trim().length > 0) {
        turnId = retryTurnId;
        turnResult = retryResult;
        reflectionTrace = {
          attempted: true,
          attemptCount: 1,
          reason: retryReason,
          outcome: "recovered",
        };
      }
    }

    const dedupedTurnCitations = dedupeChatCitations(turnResult.turnTrace.citations ?? []);
    if (turnResult.requiresApproval) {
      const traceWithMeta = this.storage.chatTurnTraces.patch(turnId, {
        retrieval: prepared.retrievalTrace,
        reflection: reflectionTrace,
        proactive: {
          runId: prepared.autonomy.lastProactiveRunId,
          mode: prepared.autonomy.proactiveMode,
        },
        guidance: {
          workspaceId: prepared.workspaceId,
          globalFilesUsed: prepared.resolvedGuidance.globalFilesUsed,
          workspaceFilesUsed: prepared.resolvedGuidance.workspaceFilesUsed,
          truncated: prepared.resolvedGuidance.truncated,
        },
        citations: dedupedTurnCitations,
      });
      this.updateActiveLeafOrThrow(sessionId, prepared.parentTurnId, turnId);
      this.publishRealtime("chat_thread_updated", "chat", {
        type: "chat_thread_turn_appended",
        sessionId,
        turnId,
        activeLeafTurnId: turnId,
      });
      return {
        sessionId,
        userMessage: prepared.userMessage,
        assistantMessage: undefined,
        transport: "llm",
        model: turnResult.assistantModel,
        turnId,
        trace: {
          ...traceWithMeta,
          citations: dedupedTurnCitations,
          toolRuns: this.storage.chatToolRuns.listByTurn(turnId),
        },
        citations: dedupedTurnCitations,
        routing: turnResult.turnTrace.routing,
      };
    }

    const assistantText = turnResult.assistantContent.trim().length > 0
      ? turnResult.assistantContent
      : buildEmptyAssistantTurnFallbackText();
    const assistantUsage = turnResult.usage;
    const assistantEventId = prepared.assistantMessageId;
    await this.ingestEvent(randomUUID(), {
      eventId: assistantEventId,
      route: prepared.route,
      actor: {
        type: "agent",
        id: "assistant",
      },
      message: {
        role: "assistant",
        content: assistantText,
      },
      usage: assistantUsage,
    });
    const assistantMessage: ChatMessageRecord = {
      messageId: assistantEventId,
      sessionId,
      role: "assistant",
      actorType: "agent",
      actorId: "assistant",
      content: assistantText,
      timestamp: new Date().toISOString(),
    };
    const finalTraceStatus = turnResult.turnTrace.status === "failed" ? "failed" : "completed";
    const trace = this.storage.chatTurnTraces.patch(turnId, {
      assistantMessageId: assistantEventId,
      status: finalTraceStatus,
      finishedAt: new Date().toISOString(),
      retrieval: prepared.retrievalTrace,
      reflection: reflectionTrace,
      proactive: {
        runId: prepared.autonomy.lastProactiveRunId,
        mode: prepared.autonomy.proactiveMode,
      },
      guidance: {
        workspaceId: prepared.workspaceId,
        globalFilesUsed: prepared.resolvedGuidance.globalFilesUsed,
        workspaceFilesUsed: prepared.resolvedGuidance.workspaceFilesUsed,
        truncated: prepared.resolvedGuidance.truncated,
      },
      citations: dedupedTurnCitations,
    });
    let hydratedTrace: ChatTurnTraceRecord = {
      ...trace,
      citations: dedupedTurnCitations,
      toolRuns: this.storage.chatToolRuns.listByTurn(turnId),
    };
    const capabilityUpgradeSuggestions = await this.collectCapabilityUpgradeSuggestions({
      sessionId,
      content: prepared.content,
      assistantText,
      trace: hydratedTrace,
    });
    if (capabilityUpgradeSuggestions.length > 0) {
      hydratedTrace = this.storage.chatTurnTraces.patch(turnId, {
        capabilityUpgradeSuggestions,
      });
      hydratedTrace = {
        ...hydratedTrace,
        toolRuns: this.storage.chatToolRuns.listByTurn(turnId),
      };
    }

    this.extractAndPersistLearnedMemory(sessionId, prepared.content, {
      role: "user",
      sourceRef: prepared.userEventId,
      trace: hydratedTrace,
    });
    this.extractAndPersistLearnedMemory(sessionId, assistantText, {
      role: "assistant",
      sourceRef: assistantEventId,
      trace: hydratedTrace,
    });
    this.updateActiveLeafOrThrow(sessionId, prepared.parentTurnId, turnId);
    this.publishRealtime("chat_thread_updated", "chat", {
      type: "chat_thread_turn_appended",
      sessionId,
      turnId,
      activeLeafTurnId: turnId,
    });
    const delegationDetection = detectDelegationRoles(prepared.content);
    if (prepared.prefs.planningMode !== "advisory" && delegationDetection.length > 1) {
      await this.triggerChatSessionProactive(sessionId, {
        source: "chat",
        reason: "Detected multi-role phrasing; generated delegation suggestion.",
      });
    }

    return {
      sessionId,
      userMessage: prepared.userMessage,
      assistantMessage,
      transport: "llm",
      model: turnResult.assistantModel,
      turnId,
      trace: hydratedTrace,
      citations: hydratedTrace.citations,
      routing: hydratedTrace.routing,
    };
    });
  }

  public async *agentSendChatMessageStream(
    sessionId: string,
    input: ChatSendMessageRequest,
  ): AsyncGenerator<ChatStreamChunk> {
    yield* this.withChatTurnWriteLeaseStream(sessionId, "agent-send/stream", () => {
      const self = this;
      return (async function* (): AsyncGenerator<ChatStreamChunk> {
        self.recordDevDiagnostic({
          level: "info",
          category: "chat",
          event: "chat.stream.start",
          message: "Starting streamed mission chat turn",
          sessionId,
          providerId: input.providerId,
          modelId: input.model,
          context: {
            mode: input.mode,
            webMode: input.webMode,
            thinkingLevel: input.thinkingLevel,
          },
        });
        const prepared = await self.prepareAgentChatTurn(sessionId, input, {
          branchKind: "append",
        });
        const binding = self.storage.chatSessionBindings.get(sessionId)
          ?? self.storage.chatSessionBindings.upsert({
            sessionId,
            workspaceId: prepared.workspaceId,
            transport: "llm",
            writable: true,
          });
        if (binding.transport !== "llm") {
          yield* self.streamPreparedIntegrationChatTurn(
            sessionId,
            prepared,
            binding,
            "chat_thread_turn_appended",
          );
          return;
        }
        yield* self.streamPreparedAgentChatTurn(sessionId, input, prepared, "chat_thread_turn_appended");
      })();
    });
  }

  public async retryChatTurn(
    sessionId: string,
    turnId: string,
    overrides: Partial<ChatSendMessageRequest> = {},
  ): Promise<ChatSendMessageResponse> {
    return this.withChatTurnWriteLease(sessionId, "retry-turn", async () => {
      const current = await this.requireChatTurnContext(sessionId, turnId);
      const request: ChatSendMessageRequest = {
        content: current.userMessage.content,
        attachments: current.userMessage.attachments?.map((item) => item.attachmentId),
        providerId: overrides.providerId,
        model: overrides.model,
        useMemory: overrides.useMemory,
        mode: overrides.mode,
        webMode: overrides.webMode,
        memoryMode: overrides.memoryMode,
        thinkingLevel: overrides.thinkingLevel,
        commandText: overrides.commandText,
        prefsOverride: overrides.prefsOverride,
      };
      const prepared = await this.prepareAgentChatTurn(sessionId, request, {
        branchKind: "retry",
        sourceTurnId: turnId,
        parentTurnId: current.trace.parentTurnId,
        existingUserMessage: current.userMessage,
        ingestUserMessage: false,
      });
      const binding = this.storage.chatSessionBindings.get(sessionId)
        ?? this.storage.chatSessionBindings.upsert({
          sessionId,
          workspaceId: prepared.workspaceId,
          transport: "llm",
          writable: true,
        });
      if (binding.transport !== "llm") {
        return this.sendPreparedIntegrationChatTurn(sessionId, prepared, binding, "chat_thread_turn_retried");
      }
      for await (const _chunk of this.streamPreparedAgentChatTurn(sessionId, request, prepared, "chat_thread_turn_retried")) {
        // consume stream for non-stream callers so branch behavior stays aligned
      }
      return this.buildChatSendMessageResponseFromTurnId(sessionId, prepared.turnId);
    });
  }

  public async *retryChatTurnStream(
    sessionId: string,
    turnId: string,
    overrides: Partial<ChatSendMessageRequest> = {},
  ): AsyncGenerator<ChatStreamChunk> {
    yield* this.withChatTurnWriteLeaseStream(sessionId, "retry-turn/stream", () => {
      const self = this;
      return (async function* (): AsyncGenerator<ChatStreamChunk> {
        const current = await self.requireChatTurnContext(sessionId, turnId);
        const request: ChatSendMessageRequest = {
          content: current.userMessage.content,
          attachments: current.userMessage.attachments?.map((item) => item.attachmentId),
          providerId: overrides.providerId,
          model: overrides.model,
          useMemory: overrides.useMemory,
          mode: overrides.mode,
          webMode: overrides.webMode,
          memoryMode: overrides.memoryMode,
          thinkingLevel: overrides.thinkingLevel,
          commandText: overrides.commandText,
          prefsOverride: overrides.prefsOverride,
        };
        const prepared = await self.prepareAgentChatTurn(sessionId, request, {
          branchKind: "retry",
          sourceTurnId: turnId,
          parentTurnId: current.trace.parentTurnId,
          existingUserMessage: current.userMessage,
          ingestUserMessage: false,
        });
        const binding = self.storage.chatSessionBindings.get(sessionId)
          ?? self.storage.chatSessionBindings.upsert({
            sessionId,
            workspaceId: prepared.workspaceId,
            transport: "llm",
            writable: true,
          });
        if (binding.transport !== "llm") {
          yield* self.streamPreparedIntegrationChatTurn(sessionId, prepared, binding, "chat_thread_turn_retried");
          return;
        }
        yield* self.streamPreparedAgentChatTurn(sessionId, request, prepared, "chat_thread_turn_retried");
      })();
    });
  }

  public async editChatTurn(
    sessionId: string,
    turnId: string,
    input: ChatSendMessageRequest,
  ): Promise<ChatSendMessageResponse> {
    return this.withChatTurnWriteLease(sessionId, "edit-turn", async () => {
      const current = await this.requireChatTurnContext(sessionId, turnId);
      const request: ChatSendMessageRequest = {
        ...input,
        attachments: input.attachments ?? current.userMessage.attachments?.map((item) => item.attachmentId),
      };
      const prepared = await this.prepareAgentChatTurn(sessionId, request, {
        branchKind: "edit",
        sourceTurnId: turnId,
        parentTurnId: current.trace.parentTurnId,
      });
      const binding = this.storage.chatSessionBindings.get(sessionId)
        ?? this.storage.chatSessionBindings.upsert({
          sessionId,
          workspaceId: prepared.workspaceId,
          transport: "llm",
          writable: true,
        });
      if (binding.transport !== "llm") {
        return this.sendPreparedIntegrationChatTurn(sessionId, prepared, binding, "chat_thread_turn_edited");
      }
      for await (const _chunk of this.streamPreparedAgentChatTurn(sessionId, request, prepared, "chat_thread_turn_edited")) {
        // consume stream for non-stream callers so branch behavior stays aligned
      }
      return this.buildChatSendMessageResponseFromTurnId(sessionId, prepared.turnId);
    });
  }

  public async *editChatTurnStream(
    sessionId: string,
    turnId: string,
    input: ChatSendMessageRequest,
  ): AsyncGenerator<ChatStreamChunk> {
    yield* this.withChatTurnWriteLeaseStream(sessionId, "edit-turn/stream", () => {
      const self = this;
      return (async function* (): AsyncGenerator<ChatStreamChunk> {
        const current = await self.requireChatTurnContext(sessionId, turnId);
        const request: ChatSendMessageRequest = {
          ...input,
          attachments: input.attachments ?? current.userMessage.attachments?.map((item) => item.attachmentId),
        };
        const prepared = await self.prepareAgentChatTurn(sessionId, request, {
          branchKind: "edit",
          sourceTurnId: turnId,
          parentTurnId: current.trace.parentTurnId,
        });
        const binding = self.storage.chatSessionBindings.get(sessionId)
          ?? self.storage.chatSessionBindings.upsert({
            sessionId,
            workspaceId: prepared.workspaceId,
            transport: "llm",
            writable: true,
          });
        if (binding.transport !== "llm") {
          yield* self.streamPreparedIntegrationChatTurn(sessionId, prepared, binding, "chat_thread_turn_edited");
          return;
        }
        yield* self.streamPreparedAgentChatTurn(sessionId, request, prepared, "chat_thread_turn_edited");
      })();
    });
  }

  private async collectCapabilityUpgradeSuggestions(input: {
    sessionId: string;
    content: string;
    assistantText: string;
    trace?: ChatTurnTraceRecord;
  }): Promise<ChatCapabilityUpgradeSuggestion[]> {
    return scoutCapabilityUpgradeSuggestions({
      ...input,
      deps: {
        listToolCatalog: () => this.listToolCatalog(),
        evaluateToolAccess: (request) => this.evaluateToolAccess(request),
        listSkills: () => this.listSkills(),
        resolveSkillActivation: (request) => this.resolveSkillActivation(request),
        listSkillSources: (query, limit) => this.listSkillSources(query, limit),
        listMcpTemplates: () => this.listMcpTemplates(),
        listMcpTemplateDiscovery: () => {
          try {
            return this.listMcpTemplateDiscovery();
          } catch {
            return [];
          }
        },
      },
    });
  }

  private async consumePreparedAgentChatTurn(
    sessionId: string,
    input: ChatSendMessageRequest,
    prepared: Awaited<ReturnType<GatewayService["prepareAgentChatTurn"]>>,
    threadEventType: "chat_thread_turn_appended" | "chat_thread_turn_retried" | "chat_thread_turn_edited",
  ): Promise<ChatSendMessageResponse> {
    let assistantMessage: ChatMessageRecord | undefined;
    let trace: ChatTurnTraceRecord | undefined;
    let citations: ChatCitationRecord[] = [];
    for await (const chunk of this.streamPreparedAgentChatTurn(sessionId, input, prepared, threadEventType)) {
      if (chunk.type === "message_done") {
        assistantMessage = {
          messageId: chunk.messageId,
          sessionId,
          role: "assistant",
          actorType: "agent",
          actorId: "assistant",
          content: chunk.content,
          timestamp: new Date().toISOString(),
        };
      } else if (chunk.type === "trace_update") {
        trace = chunk.trace;
      } else if (chunk.type === "citation") {
        citations = dedupeChatCitations([...citations, chunk.citation]);
      }
    }
    const dedupedTraceCitations = dedupeChatCitations(trace?.citations ?? []);
    return {
      sessionId,
      userMessage: prepared.userMessage,
      assistantMessage,
      transport: "llm",
      model: trace?.model ?? input.model ?? prepared.prefs.model,
      turnId: prepared.turnId,
      trace: trace ? { ...trace, citations: dedupedTraceCitations } : trace,
      citations: dedupeChatCitations(citations),
      routing: trace?.routing,
    };
  }

  private async sendPreparedIntegrationChatTurn(
    sessionId: string,
    prepared: Awaited<ReturnType<GatewayService["prepareAgentChatTurn"]>>,
    binding: ChatSessionBindingRecord,
    threadEventType: "chat_thread_turn_appended" | "chat_thread_turn_retried" | "chat_thread_turn_edited",
  ): Promise<ChatSendMessageResponse> {
    const startedAt = new Date().toISOString();
    this.storage.chatTurnTraces.create({
      turnId: prepared.turnId,
      sessionId,
      userMessageId: prepared.userEventId,
      parentTurnId: prepared.parentTurnId,
      branchKind: prepared.branchKind,
      sourceTurnId: prepared.sourceTurnId,
      status: "running",
      mode: prepared.normalized.mode ?? prepared.prefs.mode,
      webMode: prepared.normalized.webMode ?? prepared.prefs.webMode,
      memoryMode: prepared.normalized.memoryMode ?? prepared.prefs.memoryMode,
      thinkingLevel: prepared.normalized.thinkingLevel ?? prepared.prefs.thinkingLevel,
      effectiveToolAutonomy: prepared.effectiveToolAutonomy,
      routing: {},
      startedAt,
    });

    try {
      if (!binding.connectionId || !binding.target) {
        throw new Error("Integration binding is missing connectionId or target");
      }
      if (!binding.writable) {
        throw new Error("Session binding is not writable");
      }
      const delivery = await this.commsSend({
        connectionId: binding.connectionId,
        target: binding.target,
        message: prepared.content,
        sessionId,
        agentId: "operator",
      });
      const assistantContent = typeof delivery === "object"
        ? `Delivered via integration ${binding.connectionId} to ${binding.target}.`
        : "Delivered via integration.";
      const assistantMessageId = prepared.assistantMessageId;
      await this.ingestEvent(randomUUID(), {
        eventId: assistantMessageId,
        route: prepared.route,
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
        messageId: assistantMessageId,
        sessionId,
        role: "assistant",
        actorType: "system",
        actorId: "integration",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      };
      const trace = this.storage.chatTurnTraces.patch(prepared.turnId, {
        assistantMessageId,
        status: "completed",
        finishedAt: new Date().toISOString(),
        retrieval: prepared.retrievalTrace,
        reflection: {
          attempted: false,
          attemptCount: 0,
          outcome: "not_needed",
        },
        proactive: {
          runId: prepared.autonomy.lastProactiveRunId,
          mode: prepared.autonomy.proactiveMode,
        },
        guidance: {
          workspaceId: prepared.workspaceId,
          globalFilesUsed: prepared.resolvedGuidance.globalFilesUsed,
          workspaceFilesUsed: prepared.resolvedGuidance.workspaceFilesUsed,
          truncated: prepared.resolvedGuidance.truncated,
        },
        citations: [],
      });
      const hydratedTrace: ChatTurnTraceRecord = {
        ...trace,
        toolRuns: [],
        citations: [],
      };
      this.updateActiveLeafOrThrow(sessionId, prepared.parentTurnId, prepared.turnId);
      this.publishRealtime("chat_thread_updated", "chat", {
        type: threadEventType,
        sessionId,
        turnId: prepared.turnId,
        activeLeafTurnId: prepared.turnId,
      });
      return {
        sessionId,
        userMessage: prepared.userMessage,
        assistantMessage,
        transport: "integration",
        turnId: prepared.turnId,
        trace: hydratedTrace,
        citations: [],
        routing: hydratedTrace.routing,
      };
    } catch (error) {
      this.storage.chatTurnTraces.patch(prepared.turnId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        retrieval: prepared.retrievalTrace,
        reflection: {
          attempted: false,
          attemptCount: 0,
          outcome: "not_needed",
        },
        proactive: {
          runId: prepared.autonomy.lastProactiveRunId,
          mode: prepared.autonomy.proactiveMode,
        },
        guidance: {
          workspaceId: prepared.workspaceId,
          globalFilesUsed: prepared.resolvedGuidance.globalFilesUsed,
          workspaceFilesUsed: prepared.resolvedGuidance.workspaceFilesUsed,
          truncated: prepared.resolvedGuidance.truncated,
        },
        citations: [],
      });
      throw error;
    }
  }

  private async *streamPreparedIntegrationChatTurn(
    sessionId: string,
    prepared: Awaited<ReturnType<GatewayService["prepareAgentChatTurn"]>>,
    binding: ChatSessionBindingRecord,
    threadEventType: "chat_thread_turn_appended" | "chat_thread_turn_retried" | "chat_thread_turn_edited",
  ): AsyncGenerator<ChatStreamChunk> {
    yield {
      type: "message_start",
      sessionId,
      turnId: prepared.turnId,
      messageId: prepared.assistantMessageId,
      parentTurnId: prepared.parentTurnId,
      branchKind: prepared.branchKind,
      sourceTurnId: prepared.sourceTurnId,
    };
    const response = await this.sendPreparedIntegrationChatTurn(sessionId, prepared, binding, threadEventType);
    const content = response.assistantMessage?.content ?? "";
    for (const delta of splitIntoChunks(content, 120)) {
      yield {
        type: "delta",
        sessionId,
        turnId: prepared.turnId,
        messageId: prepared.assistantMessageId,
        delta,
      };
    }
    yield {
      type: "message_done",
      sessionId,
      turnId: prepared.turnId,
      messageId: prepared.assistantMessageId,
      content,
    };
    yield {
      type: "trace_update",
      sessionId,
      turnId: prepared.turnId,
      trace: response.trace!,
    };
    yield {
      type: "done",
      sessionId,
      turnId: prepared.turnId,
      messageId: prepared.assistantMessageId,
    };
  }

  public async uploadChatAttachment(input: {
    sessionId: string;
    projectId?: string;
    fileName: string;
    mimeType: string;
    bytesBase64: string;
  }): Promise<ChatAttachmentRecord> {
    this.getSession(input.sessionId);
    const sessionMeta = this.storage.chatSessionMeta.ensure(input.sessionId);
    const sessionWorkspaceId = this.normalizeWorkspaceId(sessionMeta.workspaceId);
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
    if (project && this.normalizeWorkspaceId(project.workspaceId) !== sessionWorkspaceId) {
      throw new Error("project workspace does not match session workspace");
    }
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
      workspaceId: sessionWorkspaceId,
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
    const backupDir = path.resolve(this.getBackupDirectory());
    const outputPath = input?.outputPath
      ? path.resolve(backupDir, input.outputPath)
      : path.join(backupDir, `${backupId}.backup`);
    ensurePathWithinRoot(outputPath, backupDir);
    const tempDir = `${outputPath}.tmp-${randomUUID().slice(0, 8)}`;
    ensurePathWithinRoot(tempDir, backupDir);
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

    const backupDir = path.resolve(this.getBackupDirectory());
    const backupPath = path.resolve(backupDir, input.filePath);
    ensurePathWithinRoot(backupPath, backupDir);
    const manifestPath = path.join(backupPath, "manifest.json");
    const payloadDir = path.join(backupPath, "payload");
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as BackupManifestRecord;

    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error("Backup manifest has no files");
    }

    for (const file of manifest.files) {
      const source = path.resolve(payloadDir, file.path);
      ensurePathWithinRoot(source, payloadDir);
      const bytes = await fs.readFile(source);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== file.sha256) {
        throw new Error(`Backup checksum mismatch for ${file.path}`);
      }
    }

    for (const file of manifest.files) {
      const source = path.resolve(payloadDir, file.path);
      ensurePathWithinRoot(source, payloadDir);
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
    const realtimeCountRow = this.gatewaySql.prepare(
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
    const current = this.storage.approvals.get(approvalId);
    if (current.kind === DEVICE_ACCESS_APPROVAL_KIND) {
      return this.resolveDeviceAccessApproval(current, input);
    }

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

    await this.recordApprovalResolutionEffects(approval, input, executedAction);

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

  public costUsageAvailability(from: string, to: string) {
    return this.storage.costLedger.usageAvailability(from, to);
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

  public listSkills(): SkillListItem[] {
    const stateMap = this.readSkillStates();
    return this.skillsService.list().map((skill) => {
      const state = stateMap.get(skill.skillId);
      return {
        ...skill,
        state: state?.state ?? "enabled",
        note: state?.note,
        stateUpdatedAt: state?.updatedAt,
      };
    });
  }

  public async reloadSkills(): Promise<SkillListItem[]> {
    const loaded = await this.skillsService.reload();
    this.ensureSkillStates(loaded.map((skill) => skill.skillId));
    return this.listSkills();
  }

  public getSkillActivationPolicy(): SkillActivationPolicy {
    const stored = this.storage.systemSettings.get<SkillActivationPolicy>(SKILL_ACTIVATION_POLICY_SETTING_KEY)?.value;
    if (!stored) {
      return { ...DEFAULT_SKILL_ACTIVATION_POLICY };
    }
    return {
      guardedAutoThreshold: clamp01(stored.guardedAutoThreshold ?? DEFAULT_SKILL_ACTIVATION_POLICY.guardedAutoThreshold),
      requireFirstUseConfirmation: stored.requireFirstUseConfirmation ?? DEFAULT_SKILL_ACTIVATION_POLICY.requireFirstUseConfirmation,
    };
  }

  public updateSkillActivationPolicy(
    input: Partial<SkillActivationPolicy>,
  ): SkillActivationPolicy {
    const current = this.getSkillActivationPolicy();
    const next: SkillActivationPolicy = {
      guardedAutoThreshold: clamp01(input.guardedAutoThreshold ?? current.guardedAutoThreshold),
      requireFirstUseConfirmation: input.requireFirstUseConfirmation ?? current.requireFirstUseConfirmation,
    };
    this.storage.systemSettings.set(SKILL_ACTIVATION_POLICY_SETTING_KEY, next);
    return next;
  }

  public getBankrSafetyPolicy(): BankrSafetyPolicy {
    this.requireBankrBuiltinEnabled();
    return readBankrSafetyPolicy(this.storage);
  }

  public updateBankrSafetyPolicy(input: Partial<BankrSafetyPolicy>): BankrSafetyPolicy {
    this.requireBankrBuiltinEnabled();
    const updated = writeBankrSafetyPolicy(this.storage, input);
    this.publishRealtime("system", "skills", {
      type: "bankr_policy_updated",
      policy: updated,
    });
    return updated;
  }

  public previewBankrAction(input: BankrActionPreviewRequest): BankrActionPreviewResponse {
    this.requireBankrBuiltinEnabled();
    return evaluateBankrActionPreview(this.storage, input);
  }

  public listBankrActionAudit(limit = 100, cursor?: string): BankrActionAuditRecord[] {
    this.requireBankrBuiltinEnabled();
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const parsedCursor = parseBankrAuditCursor(cursor);
    const rows = this.gatewaySql.prepare(`
      SELECT
        action_id AS actionId,
        session_id AS sessionId,
        actor_id AS actorId,
        action_type AS actionType,
        chain,
        symbol,
        usd_estimate AS usdEstimate,
        status,
        approval_id AS approvalId,
        policy_reason AS policyReason,
        details_json AS detailsJson,
        created_at AS createdAt
      FROM bankr_action_audit
      WHERE (
        @cursorCreatedAt IS NULL
        OR created_at < @cursorCreatedAt
        OR (created_at = @cursorCreatedAt AND action_id < @cursorActionId)
      )
      ORDER BY created_at DESC, action_id DESC
      LIMIT @limit
    `).all({
      cursorCreatedAt: parsedCursor?.createdAt ?? null,
      cursorActionId: parsedCursor?.actionId ?? null,
      limit: boundedLimit,
    }) as Array<{
      actionId: string;
      sessionId: string;
      actorId: string;
      actionType: BankrActionAuditRecord["actionType"];
      chain?: string;
      symbol?: string;
      usdEstimate?: number;
      status: BankrActionAuditRecord["status"];
      approvalId?: string;
      policyReason?: string;
      detailsJson?: string;
      createdAt: string;
    }>;

    return rows.map((row) => ({
      actionId: row.actionId,
      sessionId: row.sessionId,
      actorId: row.actorId,
      actionType: row.actionType,
      chain: row.chain,
      symbol: row.symbol,
      usdEstimate: Number.isFinite(row.usdEstimate) ? row.usdEstimate : undefined,
      status: row.status,
      approvalId: row.approvalId,
      policyReason: row.policyReason,
      details: row.detailsJson
        ? safeJsonParse<Record<string, unknown>>(row.detailsJson, {})
        : undefined,
      createdAt: row.createdAt,
    }));
  }

  public setSkillState(
    skillId: string,
    state: SkillRuntimeState,
    note?: string,
  ): SkillStateRecord {
    const knownSkill = this.skillsService.list().find((skill) => skill.skillId === skillId);
    if (!knownSkill) {
      throw new Error(`Unknown skill: ${skillId}`);
    }
    const now = new Date().toISOString();
    this.gatewaySql.prepare(`
      INSERT INTO skill_state (skill_id, state, note, updated_at, first_auto_approved_at)
      VALUES (@skillId, @state, @note, @updatedAt, NULL)
      ON CONFLICT(skill_id) DO UPDATE SET
        state = excluded.state,
        note = excluded.note,
        updated_at = excluded.updated_at
    `).run({
      skillId,
      state,
      note: note?.trim() || null,
      updatedAt: now,
    });

    this.gatewaySql.prepare(`
      INSERT INTO skill_activation_events (
        event_id, skill_id, event_type, payload_json, created_at
      ) VALUES (
        @eventId, @skillId, @eventType, @payloadJson, @createdAt
      )
    `).run({
      eventId: randomUUID(),
      skillId,
      eventType: "state_updated",
      payloadJson: JSON.stringify({ state, note: note?.trim() || undefined }),
      createdAt: now,
    });

    const updated = this.readSkillStates().get(skillId);
    if (!updated) {
      throw new Error(`Failed to persist skill state for ${skillId}`);
    }

    return updated;
  }

  public bulkSetSkillState(
    skillIds: string[],
    state: SkillRuntimeState,
    note?: string,
  ): SkillStateRecord[] {
    const uniqueIds = [...new Set(skillIds)];
    const updated: SkillStateRecord[] = [];
    for (const skillId of uniqueIds) {
      updated.push(this.setSkillState(skillId, state, note));
    }
    return updated;
  }

  public resolveSkillActivation(input: SkillResolveInput) {
    const policy = this.getSkillActivationPolicy();
    const base = this.skillsService.resolveActivation(input);
    const stateMap = this.readSkillStates();
    const selected: Array<
      SkillListItem & {
        confidence: number;
        requiresConfirmation: boolean;
      }
    > = [];
    const suppressed: Array<{
      skill: string;
      state: SkillRuntimeState;
      confidence: number;
      reason: string;
    }> = [];

    for (const skill of base.selected) {
      const reasons = base.reasons[skill.name] ?? [];
      const isExplicit = reasons.includes("explicit");
      const stateRecord = stateMap.get(skill.skillId);
      const state: SkillRuntimeState = stateRecord?.state ?? "enabled";
      const confidence = computeSkillActivationConfidence(reasons, isExplicit);

      if (state === "disabled") {
        suppressed.push({
          skill: skill.name,
          state,
          confidence,
          reason: "skill_disabled",
        });
        continue;
      }

      if (state === "sleep" && !isExplicit && confidence < policy.guardedAutoThreshold) {
        suppressed.push({
          skill: skill.name,
          state,
          confidence,
          reason: "below_guarded_auto_threshold",
        });
        continue;
      }

      const requiresConfirmation =
        state === "sleep"
        && policy.requireFirstUseConfirmation
        && !isExplicit
        && !stateRecord?.firstAutoApprovedAt;

      selected.push({
        ...skill,
        state,
        confidence,
        requiresConfirmation,
      });
    }

    return {
      ...base,
      selected,
      suppressed,
    };
  }

  public listTasks(
    limit: number,
    status?: TaskStatus,
    cursor?: string,
    view: "active" | "trash" | "all" = "active",
    workspaceId?: string,
  ): TaskRecord[] {
    return this.storage.tasks.list({
      workspaceId: this.normalizeWorkspaceId(workspaceId),
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
    const created = this.storage.tasks.create({
      ...input,
      workspaceId: this.normalizeWorkspaceId(input.workspaceId),
    });
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
    const activeSinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    return this.operatorSummaryCache.get(() => this.storage.sessions.listOperatorSummaries(activeSinceIso));
  }

  public listCronJobs(): CronJobRecord[] {
    return this.cronAutomationService.listCronJobs();
  }

  public getCronJob(jobId: string): CronJobRecord {
    return this.cronAutomationService.getCronJob(jobId);
  }

  public createCronJob(input: {
    jobId: string;
    name: string;
    schedule: string;
    enabled?: boolean;
  }): CronJobRecord {
    return this.cronAutomationService.createCronJob(input);
  }

  public updateCronJob(jobId: string, input: {
    name?: string;
    schedule?: string;
    enabled?: boolean;
  }): CronJobRecord {
    return this.cronAutomationService.updateCronJob(jobId, input);
  }

  public setCronJobEnabled(jobId: string, enabled: boolean): CronJobRecord {
    return this.cronAutomationService.setCronJobEnabled(jobId, enabled);
  }

  public deleteCronJob(jobId: string): { deleted: boolean; jobId: string } {
    return this.cronAutomationService.deleteCronJob(jobId);
  }

  public async runCronJobNow(jobId: string): Promise<{ jobId: string; status: "ok" }> {
    return this.cronAutomationService.runCronJobNow(jobId);
  }

  public listCronReviewQueue(limit = 200): CronReviewItem[] {
    return this.cronAutomationService.listCronReviewQueue(limit);
  }

  public retryCronReviewQueueItem(itemId: string): CronReviewItem {
    return this.cronAutomationService.retryCronReviewQueueItem(itemId);
  }

  public getCronRunDiff(runId: string): CronRunDiff {
    return this.cronAutomationService.getCronRunDiff(runId);
  }

  public async uploadWorkspaceFile(relativePath: string, content: string): Promise<FileUploadResult> {
    const normalized = this.normalizeRelativePath(relativePath);
    const fullPath = path.resolve(this.config.rootDir, this.config.assistant.workspaceDir, normalized);
    assertWritePathInJail(fullPath, this.config.toolPolicy.sandbox.writeJailRoots);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");

    const result = {
      relativePath: normalized,
      fullPath: this.serializeRootPath(fullPath),
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
      throw new Error(`Path is a directory: ${normalized}`);
    }

    const contentType = detectMimeType(fullPath);
    const isText = isTextContentType(contentType);
    const content = isText
      ? await fs.readFile(fullPath, "utf8")
      : await fs.readFile(fullPath);

    return {
      relativePath: normalized,
      fullPath: this.serializeRootPath(fullPath),
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

  public listMemoryItems(input: {
    namespace?: string;
    status?: MemoryItemRecord["status"] | "all";
    query?: string;
    limit?: number;
  } = {}): MemoryItemRecord[] {
    this.requireFeatureEnabled("memoryLifecycleAdminV1Enabled");
    const namespace = input.namespace?.trim();
    const status = input.status && input.status !== "all" ? input.status : undefined;
    const query = input.query?.trim().toLowerCase();
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 200)));

    const rows = this.gatewaySql.prepare(`
      SELECT item_id, namespace, title, content, metadata_json, pinned, ttl_override_seconds, expires_at, status,
             created_at, updated_at, forgotten_at
      FROM memory_items
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit * 4) as Array<{
      item_id: string;
      namespace: string;
      title: string;
      content: string;
      metadata_json: string | null;
      pinned: number;
      ttl_override_seconds: number | null;
      expires_at: string | null;
      status: MemoryItemRecord["status"];
      created_at: string;
      updated_at: string;
      forgotten_at: string | null;
    }>;

    const filtered = rows
      .filter((row) => (namespace ? row.namespace === namespace : true))
      .filter((row) => (status ? row.status === status : true))
      .filter((row) => {
        if (!query) {
          return true;
        }
        const haystack = `${row.title}\n${row.content}\n${row.namespace}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, limit);

    return filtered.map((row) => this.mapMemoryItemRow(row));
  }

  public patchMemoryItem(
    itemId: string,
    patch: MemoryLifecyclePatch,
    actorId = "operator",
  ): MemoryItemRecord {
    this.requireFeatureEnabled("memoryLifecycleAdminV1Enabled");
    const current = this.requireMemoryItem(itemId);
    const now = new Date().toISOString();
    const next = {
      title: patch.title !== undefined ? patch.title.trim() : current.title,
      content: patch.content !== undefined ? patch.content : current.content,
      metadata: patch.metadata !== undefined ? patch.metadata : current.metadata,
      pinned: patch.pinned !== undefined ? patch.pinned : current.pinned,
      ttlOverrideSeconds: patch.ttlOverrideSeconds === null
        ? null
        : patch.ttlOverrideSeconds !== undefined
          ? Math.max(1, Math.min(31_536_000, Math.floor(patch.ttlOverrideSeconds)))
          : current.ttlOverrideSeconds ?? null,
    };
    this.gatewaySql.prepare(`
      UPDATE memory_items
      SET title = @title,
          content = @content,
          metadata_json = @metadataJson,
          pinned = @pinned,
          ttl_override_seconds = @ttlOverrideSeconds,
          updated_at = @updatedAt
      WHERE item_id = @itemId
    `).run({
      itemId,
      title: next.title,
      content: next.content,
      metadataJson: JSON.stringify(next.metadata ?? {}),
      pinned: next.pinned ? 1 : 0,
      ttlOverrideSeconds: next.ttlOverrideSeconds,
      updatedAt: now,
    });
    if (patch.pinned !== undefined) {
      this.recordMemoryChange(itemId, "pin_changed", actorId, { pinned: next.pinned });
    }
    if (patch.ttlOverrideSeconds !== undefined) {
      this.recordMemoryChange(itemId, "ttl_changed", actorId, { ttlOverrideSeconds: next.ttlOverrideSeconds });
    }
    this.recordMemoryChange(itemId, "updated", actorId, {
      title: next.title,
      metadata: next.metadata ?? {},
    });
    const updated = this.requireMemoryItem(itemId);
    this.publishRealtime("system", "memory", {
      type: "memory_item_updated",
      itemId: updated.itemId,
      namespace: updated.namespace,
    });
    return updated;
  }

  public forgetMemoryItem(itemId: string, actorId = "operator"): MemoryItemRecord {
    this.requireFeatureEnabled("memoryLifecycleAdminV1Enabled");
    const current = this.requireMemoryItem(itemId);
    if (current.status === "forgotten") {
      return current;
    }
    const now = new Date().toISOString();
    this.gatewaySql.prepare(`
      UPDATE memory_items
      SET status = 'forgotten',
          forgotten_at = @forgottenAt,
          updated_at = @updatedAt
      WHERE item_id = @itemId
    `).run({
      itemId,
      forgottenAt: now,
      updatedAt: now,
    });
    this.recordMemoryChange(itemId, "forgotten", actorId, {
      previousStatus: current.status,
    });
    const forgotten = this.requireMemoryItem(itemId);
    this.publishRealtime("system", "memory", {
      type: "memory_item_forgotten",
      itemId,
      namespace: forgotten.namespace,
    });
    return forgotten;
  }

  public forgetMemory(
    input: {
      itemIds?: string[];
      namespace?: string;
      query?: string;
      actorId?: string;
    } = {},
  ): { forgottenCount: number; itemIds: string[] } {
    this.requireFeatureEnabled("memoryLifecycleAdminV1Enabled");
    const criteria = normalizeMemoryForgetCriteria(input);
    if (!criteria.hasCriteria) {
      throw new Error("Memory forget requires at least one criterion: itemIds, namespace, or query.");
    }
    const actorId = input.actorId?.trim() || "operator";
    let targets: string[] = [];
    if (criteria.hasItemIds) {
      targets = criteria.itemIds;
    } else {
      targets = this.listMemoryItems({
        namespace: criteria.namespace,
        status: "active",
        query: criteria.query,
        limit: 2_000,
      }).map((item) => item.itemId);
    }
    for (const itemId of targets) {
      this.forgetMemoryItem(itemId, actorId);
    }
    return {
      forgottenCount: targets.length,
      itemIds: targets,
    };
  }

  public listMemoryItemHistory(itemId: string, limit = 200): MemoryChangeEvent[] {
    this.requireFeatureEnabled("memoryLifecycleAdminV1Enabled");
    const safeLimit = Math.max(1, Math.min(2_000, Math.floor(limit)));
    const rows = this.gatewaySql.prepare(`
      SELECT change_id, item_id, change_type, actor_id, payload_json, created_at
      FROM memory_change_history
      WHERE item_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(itemId, safeLimit) as Array<{
      change_id: string;
      item_id: string;
      change_type: MemoryChangeEvent["changeType"];
      actor_id: string | null;
      payload_json: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      changeId: row.change_id,
      itemId: row.item_id,
      changeType: row.change_type,
      actorId: row.actor_id ?? undefined,
      payload: this.tryParseJson<Record<string, unknown>>(row.payload_json, {}),
      createdAt: row.created_at,
    }));
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
    const features = this.readFeatureFlags();
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
      features,
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
    features?: Partial<RuntimeSettings["features"]>;
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
        void this.npuSidecar.stop("disabled").catch((error) => {
          console.warn("[goatcitadel] npu sidecar stop failed after settings update", error);
        });
      } else if (this.config.assistant.npu.autoStart) {
        void this.npuSidecar.start("config_autostart").catch((error) => {
          console.error("[goatcitadel] npu sidecar autostart failed after settings update", error);
        });
      }
      persistAssistant = true;
    }

    if (input.features) {
      this.updateFeatureFlags(input.features);
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

  public async createDeviceAccessRequest(
    input: DeviceAccessRequestCreateInput,
    context: {
      requestedOrigin?: string;
      requestedIp?: string;
      userAgent?: string;
    },
  ): Promise<DeviceAccessRequestCreateResponse> {
    if (this.config.assistant.auth.mode === "none") {
      throw new Error("Device approvals are not needed when gateway auth mode is none.");
    }

    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + DEVICE_ACCESS_REQUEST_TTL_MS).toISOString();
    const requestId = randomUUID();
    const requestSecret = randomBytes(DEVICE_ACCESS_SECRET_BYTES).toString("base64url");
    const deviceType = normalizeDeviceAccessDeviceType(input.deviceType);
    const platform = normalizeOptionalDeviceAccessText(input.platform, 120) ?? inferPlatformFromUserAgent(context.userAgent);
    const deviceLabel = normalizeDeviceAccessLabel(input.deviceLabel, {
      deviceType,
      platform,
      userAgent: context.userAgent,
    });
    const requestedOrigin = normalizeOptionalDeviceAccessText(context.requestedOrigin, 240);
    const requestedIp = normalizeOptionalDeviceAccessText(context.requestedIp, 120);
    const userAgent = normalizeOptionalDeviceAccessText(context.userAgent, 512);

    const approval = await this.createApproval({
      kind: DEVICE_ACCESS_APPROVAL_KIND,
      riskLevel: "danger",
      payload: {
        requestId,
        deviceLabel,
        deviceType,
        platform,
        requestedOrigin,
        requestedIp,
        userAgent,
      },
      preview: {
        title: "Allow new device access",
        requestId,
        deviceLabel,
        deviceType,
        platform,
        requestedOrigin,
        requestedIp,
      },
    });

    try {
      this.gatewaySql.prepare(`
        INSERT INTO auth_device_requests (
          request_id, approval_id, request_secret_hash, device_label, device_type, platform,
          requested_origin, requested_ip, user_agent, status, created_at, expires_at
        ) VALUES (
          @requestId, @approvalId, @requestSecretHash, @deviceLabel, @deviceType, @platform,
          @requestedOrigin, @requestedIp, @userAgent, @status, @createdAt, @expiresAt
        )
      `).run({
        requestId,
        approvalId: approval.approvalId,
        requestSecretHash: hashSensitiveToken(requestSecret),
        deviceLabel,
        deviceType,
        platform: platform ?? null,
        requestedOrigin: requestedOrigin ?? null,
        requestedIp: requestedIp ?? null,
        userAgent: userAgent ?? null,
        status: "pending",
        createdAt,
        expiresAt,
      });
    } catch (error) {
      try {
        await this.resolveApproval(approval.approvalId, {
          decision: "reject",
          resolvedBy: "system:auth-device-request",
          resolutionNote: "Device request registration failed.",
        });
      } catch {
        // Best effort cleanup only.
      }
      throw error;
    }

    await this.storage.audit.append("approvals", {
      event: "auth.device_request.create",
      requestId,
      approvalId: approval.approvalId,
      deviceLabel,
      deviceType,
      platform,
      requestedOrigin,
      requestedIp,
    });

    this.publishRealtime("auth_device_request_created", "auth", {
      requestId,
      approvalId: approval.approvalId,
      deviceLabel,
      deviceType,
      platform,
      requestedOrigin,
      requestedIp,
      createdAt,
      expiresAt,
    });

    return {
      requestId,
      requestSecret,
      approvalId: approval.approvalId,
      status: "pending",
      expiresAt,
      pollAfterMs: DEVICE_ACCESS_REQUEST_POLL_AFTER_MS,
      message: "Waiting for approval from another authenticated Mission Control session.",
    };
  }

  public async getDeviceAccessRequestStatus(
    requestId: string,
    requestSecret: string,
  ): Promise<DeviceAccessRequestStatusResponse> {
    const request = this.getAuthDeviceRequestById(requestId);
    if (!request) {
      throw new Error("Device access request not found.");
    }
    if (!requestSecret.trim() || !timingSafeStringEqual(hashSensitiveToken(requestSecret), request.requestSecretHash)) {
      throw new Error("Device access request not found.");
    }

    const current = await this.expireDeviceAccessRequestIfNeeded(request);
    if (current.status === "approved" && !current.deliveredAt) {
      const deliveredAt = new Date().toISOString();
      const result = this.gatewaySql.prepare(`
        UPDATE auth_device_requests
        SET delivered_at = @deliveredAt,
            approved_token_plaintext = NULL
        WHERE request_id = @requestId
          AND delivered_at IS NULL
      `).run({
        requestId: current.requestId,
        deliveredAt,
      });
      if (result.changes === 0) {
        // Another concurrent poll already delivered the token — re-read the record
        // so the response does not leak the plaintext token a second time.
        const refreshed = this.getAuthDeviceRequestById(requestId);
        if (refreshed) {
          return mapDeviceAccessStatusResponse(refreshed);
        }
      }
    }

    return mapDeviceAccessStatusResponse(current);
  }

  public validateDeviceAccessToken(token: string): { actorId: string } | undefined {
    const tokenHash = hashSensitiveToken(token);
    const now = new Date().toISOString();
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM auth_device_grants
      WHERE token_hash = @tokenHash
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > @now)
      LIMIT 1
    `).get({
      tokenHash,
      now,
    }) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    const grant = mapAuthDeviceGrantRow(row);
    this.gatewaySql.prepare(`
      UPDATE auth_device_grants
      SET last_used_at = @lastUsedAt
      WHERE grant_id = @grantId
    `).run({
      grantId: grant.grantId,
      lastUsedAt: now,
    });

    return {
      actorId: `device:${grant.grantId}`,
    };
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

  public runIntegrationConnectionDiagnostics(connectionId: string): ConnectorDiagnosticReport {
    this.requireFeatureEnabled("connectorDiagnosticsV1Enabled");
    const connection = this.storage.integrationConnections.get(connectionId);
    if (!connection) {
      throw new Error(`Unknown integration connection: ${connectionId}`);
    }
    const checks: ConnectorDiagnosticReport["checks"] = [];
    checks.push({
      key: "enabled",
      status: connection.enabled ? "pass" : "warn",
      message: connection.enabled ? "Connection is enabled." : "Connection is disabled.",
    });
    checks.push({
      key: "status",
      status: connection.status === "connected" ? "pass" : connection.status === "paused" ? "warn" : "fail",
      message: `Connection status is ${connection.status}.`,
    });
    checks.push({
      key: "last_error",
      status: connection.lastError ? "warn" : "pass",
      message: connection.lastError ? `Last error: ${connection.lastError}` : "No recent errors recorded.",
    });
    const report: ConnectorDiagnosticReport = {
      connectorType: "integration_connection",
      connectorId: connection.connectionId,
      status: checks.some((check) => check.status === "fail")
        ? "error"
        : checks.some((check) => check.status === "warn")
          ? "warn"
          : "ok",
      checks,
      recommendedNextAction: this.pickConnectorDiagnosticAction(checks),
      checkedAt: new Date().toISOString(),
    };
    this.recordConnectorHealthRun(report);
    return report;
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

  public async getObsidianIntegrationStatus(): Promise<ObsidianIntegrationStatus> {
    return this.obsidianVaultService.getStatus();
  }

  public updateObsidianIntegrationConfig(input: Partial<ObsidianIntegrationConfig>): ObsidianIntegrationConfig {
    const updated = this.obsidianVaultService.updateConfig(input);
    this.publishRealtime("system", "integrations", {
      type: "obsidian_config_updated",
      enabled: updated.enabled,
      mode: updated.mode,
      vaultPath: updated.vaultPath,
      allowedSubpaths: updated.allowedSubpaths,
    });
    return updated;
  }

  public async testObsidianIntegration(): Promise<ObsidianIntegrationStatus> {
    const status = await this.obsidianVaultService.testConnection();
    this.publishRealtime("system", "integrations", {
      type: "obsidian_test_completed",
      enabled: status.enabled,
      vaultReachable: status.vaultReachable,
      lastError: status.lastError,
      checkedAt: status.checkedAt,
    });
    return status;
  }

  public async searchObsidianNotes(query: string, limit?: number) {
    return this.obsidianVaultService.searchNotes(query, limit);
  }

  public async readObsidianNote(relativePath: string) {
    return this.obsidianVaultService.readNote(relativePath);
  }

  public async appendObsidianNote(relativePath: string, markdownBlock: string) {
    return this.obsidianVaultService.appendToNote(relativePath, markdownBlock);
  }

  public async captureObsidianInboxEntry(input: {
    id: string;
    request: string;
    type?: string;
    priority?: string;
    neededBy?: string;
    owner?: string;
    state?: string;
    taskLink?: string;
    decisionLink?: string;
    notes?: string;
  }) {
    return this.obsidianVaultService.captureInboxEntry(input);
  }

  public async listSkillSources(query?: string, limit = 25): Promise<SkillSourceListResponse> {
    return this.skillImportService.listSources(query, limit);
  }

  public async lookupSkillSources(queryOrUrl: string, limit = 10): Promise<SkillSourceLookupResponse> {
    return this.skillImportService.lookupSources(queryOrUrl, limit);
  }

  public listAddonsCatalog(): AddonCatalogEntry[] {
    return this.addonsService.listCatalog();
  }

  public async listInstalledAddons(): Promise<AddonInstalledRecord[]> {
    return this.addonsService.listInstalled();
  }

  public async getAddonStatus(addonId: string): Promise<AddonStatusRecord> {
    return this.addonsService.getStatus(addonId);
  }

  public async installAddon(addonId: string, input: AddonInstallRequest): Promise<AddonActionResponse> {
    this.recordDevDiagnostic({
      level: "info",
      category: "addons",
      event: "addon.install.start",
      message: `Installing addon ${addonId}`,
      context: { actorId: input.actorId },
    });
    const result = await this.addonsService.install(addonId, input);
    this.recordDevDiagnostic({
      level: "info",
      category: "addons",
      event: "addon.install.complete",
      message: `Installed addon ${addonId}`,
      context: { status: result.status.status },
    });
    this.publishRealtime("addon_installed", "system", {
      addonId,
      status: result.status.status,
    });
    return result;
  }

  public async updateAddon(addonId: string): Promise<AddonActionResponse> {
    const result = await this.addonsService.update(addonId);
    this.publishRealtime("addon_updated", "system", {
      addonId,
      status: result.status.status,
    });
    return result;
  }

  public async launchAddon(addonId: string): Promise<AddonActionResponse> {
    this.recordDevDiagnostic({
      level: "info",
      category: "addons",
      event: "addon.launch.start",
      message: `Launching addon ${addonId}`,
    });
    const result = await this.addonsService.launch(addonId);
    this.recordDevDiagnostic({
      level: "info",
      category: "addons",
      event: "addon.launch.complete",
      message: `Launched addon ${addonId}`,
      context: {
        status: result.status.status,
        launchUrl: result.status.installed?.launchUrl ?? result.status.addon.launchUrl,
      },
    });
    this.publishRealtime("addon_runtime_changed", "system", {
      addonId,
      status: result.status.status,
    });
    return result;
  }

  public async stopAddon(addonId: string): Promise<AddonActionResponse> {
    const result = await this.addonsService.stop(addonId);
    this.publishRealtime("addon_runtime_changed", "system", {
      addonId,
      status: result.status.status,
    });
    return result;
  }

  public async uninstallAddon(addonId: string): Promise<AddonUninstallResponse> {
    const result = await this.addonsService.uninstall(addonId);
    this.publishRealtime("addon_uninstalled", "system", {
      addonId,
    });
    return result;
  }

  public listSkillImportHistory(limit = 100): SkillImportHistoryRecord[] {
    return this.skillImportService.listHistory(limit);
  }

  public async validateSkillImport(input: {
    sourceRef: string;
    sourceType?: SkillImportValidationResult["candidate"]["sourceType"];
    sourceProvider?: SkillSourceProvider;
  }): Promise<SkillImportValidationResult> {
    const validation = await this.skillImportService.validateImport(input);
    this.recordSkillImportEvent(validation, "import_validated");
    this.publishRealtime("system", "skills", {
      type: "skill_import_validated",
      sourceProvider: validation.candidate.sourceProvider,
      sourceRef: validation.candidate.sourceRef,
      valid: validation.valid,
      riskLevel: validation.riskLevel,
      skillName: validation.inferredSkillName,
    });
    return validation;
  }

  public async installSkillImport(input: {
    sourceRef: string;
    sourceType?: SkillImportValidationResult["candidate"]["sourceType"];
    sourceProvider?: SkillSourceProvider;
    force?: boolean;
    confirmHighRisk?: boolean;
  }): Promise<{
    validation: SkillImportValidationResult;
    installedPath: string;
    sourceManifestPath: string;
    installedSkillId?: string;
  }> {
    const installed = await this.skillImportService.installImport(input);
    const skills = await this.reloadSkills();
    const installedSkill = skills.find((skill) =>
      skill.source === "extra"
      && path.resolve(skill.dir) === path.resolve(installed.installedPath));
    if (installedSkill) {
      this.setSkillState(
        installedSkill.skillId,
        "disabled",
        "Imported skill starts disabled by default.",
      );
    }
    this.recordSkillImportEvent(installed.validation, "import_installed");
    this.publishRealtime("system", "skills", {
      type: "skill_import_installed",
      sourceProvider: installed.validation.candidate.sourceProvider,
      sourceRef: installed.validation.candidate.sourceRef,
      riskLevel: installed.validation.riskLevel,
      skillName: installed.validation.inferredSkillName,
      skillId: installedSkill?.skillId,
      installedPath: path.relative(this.config.rootDir, installed.installedPath).replaceAll("\\", "/"),
    });
    return {
      ...installed,
      installedSkillId: installedSkill?.skillId,
    };
  }

  public listMcpServers(): McpServerRecord[] {
    return this.readMcpServers();
  }

  public listMcpTemplates(): Array<McpServerTemplateRecord & { installed: boolean }> {
    const byTemplateId = new Map(this.readMcpServers().map((server) => [server.label.toLowerCase(), server]));
    return MCP_SERVER_TEMPLATES.map((template) => ({
      ...template,
      installed: byTemplateId.has(template.label.toLowerCase()),
    }));
  }

  public listMcpTemplateDiscovery(): McpTemplateDiscoveryResult[] {
    this.requireFeatureEnabled("connectorDiagnosticsV1Enabled");
    const installed = new Map(this.readMcpServers().map((server) => [server.label.toLowerCase(), server]));
    return MCP_SERVER_TEMPLATES.map((template) => {
      const checks: McpTemplateDiscoveryResult["dependencyChecks"] = [];
      if (template.transport === "stdio") {
        checks.push({
          key: "command",
          status: template.command?.trim() ? "pass" : "fail",
          message: template.command?.trim() ? `Command ${template.command} is configured.` : "Missing command.",
        });
      }
      if (template.transport === "http" || template.transport === "sse") {
        checks.push({
          key: "url",
          status: template.url?.trim() ? "pass" : "warn",
          message: template.url?.trim() ? `Endpoint ${template.url} provided.` : "Provide endpoint URL before connect.",
        });
      }
      if (template.authType !== "none") {
        checks.push({
          key: "auth",
          status: "warn",
          message: `${template.authType} credentials required before first connect.`,
        });
      } else {
        checks.push({
          key: "auth",
          status: "pass",
          message: "No auth required.",
        });
      }
      const missingCommand = checks.some((check) => check.key === "command" && check.status === "fail");
      const missingUrl = checks.some((check) => check.key === "url" && check.status === "fail");
      const readiness = missingCommand
        ? "needs_command"
        : missingUrl
          ? "needs_url"
          : template.authType !== "none"
            ? "needs_auth"
            : "ready";
      return {
        templateId: template.templateId,
        label: template.label,
        installed: installed.has(template.label.toLowerCase()),
        readiness,
        dependencyChecks: checks,
      };
    });
  }

  public runMcpServerHealthCheck(serverId: string): ConnectorDiagnosticReport {
    this.requireFeatureEnabled("connectorDiagnosticsV1Enabled");
    const server = this.requireMcpServer(serverId);
    const checks: ConnectorDiagnosticReport["checks"] = [];
    checks.push({
      key: "enabled",
      status: server.enabled ? "pass" : "warn",
      message: server.enabled ? "MCP server is enabled." : "Server is disabled.",
    });
    checks.push({
      key: "status",
      status: server.status === "connected" ? "pass" : server.status === "connecting" ? "warn" : "fail",
      message: `Server status is ${server.status}.`,
    });
    if (server.transport === "stdio") {
      checks.push({
        key: "command",
        status: server.command?.trim() ? "pass" : "fail",
        message: server.command?.trim() ? `Command ${server.command} configured.` : "Missing stdio command.",
      });
    } else {
      checks.push({
        key: "url",
        status: server.url?.trim() ? "pass" : "fail",
        message: server.url?.trim() ? `URL ${server.url} configured.` : "Missing server URL.",
      });
    }
    checks.push({
      key: "policy",
      status: server.policy.blockedToolPatterns.length > 0 || server.policy.allowedToolPatterns.length > 0 ? "pass" : "warn",
      message: server.policy.blockedToolPatterns.length > 0 || server.policy.allowedToolPatterns.length > 0
        ? "Tool policy constraints are configured."
        : "Consider setting allow/block patterns for safer operation.",
    });
    const report: ConnectorDiagnosticReport = {
      connectorType: "mcp_server",
      connectorId: serverId,
      status: checks.some((check) => check.status === "fail")
        ? "error"
        : checks.some((check) => check.status === "warn")
          ? "warn"
          : "ok",
      checks,
      recommendedNextAction: this.pickConnectorDiagnosticAction(checks),
      checkedAt: new Date().toISOString(),
    };
    this.recordConnectorHealthRun(report);
    return report;
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
      category: input.category ?? inferMcpCategory(input.transport),
      trustTier: input.trustTier ?? "restricted",
      costTier: input.costTier ?? "unknown",
      policy: normalizeMcpPolicy(input.policy),
      verifiedAt: input.verifiedAt,
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
        category: input.category ?? item.category,
        trustTier: input.trustTier ?? item.trustTier,
        costTier: input.costTier ?? item.costTier,
        policy: input.policy ? normalizeMcpPolicy({ ...item.policy, ...input.policy }) : item.policy,
        verifiedAt: input.verifiedAt ?? item.verifiedAt,
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

  public updateMcpServerPolicy(serverId: string, policy: Partial<McpServerPolicy>): McpServerRecord {
    return this.updateMcpServer(serverId, { policy });
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
    const existing = tools.filter((item) => item.serverId === serverId);
    const inferred = inferMcpToolsForServer(connected, existing);
    if (inferred.length > 0) {
      this.writeMcpTools([
        ...tools.filter((item) => item.serverId !== serverId),
        ...inferred,
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

  public listMcpBrowserFallbackTargets(): ReturnType<typeof collectMcpBrowserFallbackTargets> {
    return collectMcpBrowserFallbackTargets(
      this.readMcpServers(),
      this.readMcpTools(),
      (serverId, toolName) => this.isMcpToolApproved(serverId, toolName),
    );
  }

  public async invokeMcpTool(input: McpInvokeRequest): Promise<McpInvokeResponse> {
    const server = this.requireMcpServer(input.serverId);
    if (!server.enabled || server.status !== "connected") {
      return {
        ok: false,
        error: "MCP server is not connected.",
      };
    }
    if (server.trustTier === "quarantined") {
      return {
        ok: false,
        error: `MCP server ${server.label} is quarantined and cannot execute tools.`,
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
    if (server.policy.blockedToolPatterns.some((pattern) => wildcardMatch(input.toolName, pattern))) {
      return {
        ok: false,
        error: `MCP policy blocked tool ${input.toolName} on server ${server.serverId}.`,
      };
    }
    if (server.policy.allowedToolPatterns.length > 0
      && !server.policy.allowedToolPatterns.some((pattern) => wildcardMatch(input.toolName, pattern))) {
      return {
        ok: false,
        error: `MCP policy does not allow tool ${input.toolName} on server ${server.serverId}.`,
      };
    }

    if (server.policy.requireFirstToolApproval && !this.isMcpToolApproved(input.serverId, input.toolName)) {
      return {
        ok: false,
        error: `First-use approval required for ${input.toolName}. Approve this tool in MCP policy or disable first-use approval.`,
      };
    }

    const policyAgentId = input.agentId?.trim() || "operator";
    const policySessionId = input.sessionId?.trim() || `mcp:${input.serverId}`;
    const access = this.policyEngine.evaluateAccess({
      toolName: "mcp.invoke",
      args: {
        serverId: input.serverId,
        toolName: input.toolName,
        arguments: input.arguments ?? {},
      },
      agentId: policyAgentId,
      sessionId: policySessionId,
      taskId: input.taskId,
    });
    if (!access.allowed) {
      return {
        ok: false,
        error: `MCP invoke blocked by policy: ${access.reasonCodes.join(", ")}`,
        policyReason: "blocked by tool policy",
        reasonCodes: access.reasonCodes,
      };
    }
    if (access.requiresApproval) {
      const decision = await this.policyEngine.invoke({
        toolName: "mcp.invoke",
        args: {
          serverId: input.serverId,
          toolName: input.toolName,
          arguments: input.arguments ?? {},
        },
        agentId: policyAgentId,
        sessionId: policySessionId,
        taskId: input.taskId,
        consentContext: {
          source: "agent",
          reason: `MCP tool invoke ${input.serverId}/${input.toolName}`,
        },
      });
      if (decision.outcome === "approval_required") {
        return {
          ok: false,
          error: "MCP invoke requires approval.",
          approvalRequired: true,
          approvalId: decision.approvalId,
          policyReason: decision.policyReason,
          reasonCodes: access.reasonCodes,
        };
      }
      if (decision.outcome === "blocked") {
        return {
          ok: false,
          error: decision.policyReason,
          policyReason: decision.policyReason,
          reasonCodes: access.reasonCodes,
        };
      }
    }

    const runtime = await invokeMcpRuntimeTool(server, {
      toolName: input.toolName,
      arguments: input.arguments,
    });
    const output = runtime.output
      ? {
          serverId: input.serverId,
          toolName: input.toolName,
          arguments: input.arguments ?? {},
          ...runtime.output,
        }
      : undefined;
    const redactedOutput = output ? applyMcpRedaction(output, server.policy.redactionMode) : undefined;
    this.publishRealtime("tool_invoked", "mcp", {
      type: "mcp_tool_invoked",
      serverId: input.serverId,
      toolName: input.toolName,
      sessionId: input.sessionId,
      taskId: input.taskId,
      trustTier: server.trustTier,
    });
    if (!runtime.ok) {
      return {
        ok: false,
        output: redactedOutput,
        error: runtime.error ?? `MCP tool ${input.toolName} failed.`,
      };
    }
    return {
      ok: true,
      output: redactedOutput,
    };
  }

  public createMediaJob(input: MediaCreateJobRequest): MediaJobRecord {
    const now = new Date().toISOString();
    const jobId = randomUUID();
    this.gatewaySql.prepare(`
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
    const row = this.gatewaySql.prepare(`
      SELECT * FROM media_jobs
      WHERE job_id = ?
    `).get(jobId) as MediaJobRow | undefined;
    if (!row) {
      throw new Error(`Unknown media job: ${jobId}`);
    }
    return mapMediaJobRow(row);
  }

  public listMediaJobs(sessionId?: string): MediaJobRecord[] {
    const rows = this.gatewaySql.prepare(`
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
    this.recordDevDiagnostic({
      level: "info",
      category: "voice",
      event: "voice.transcribe.start",
      message: "Starting voice transcription",
      context: {
        bytes: bytes.length,
        mimeType: input.mimeType,
        language: input.language,
      },
    });
    return this.transcribeAudioBytes(bytes, input.mimeType, input.language);
  }

  public async getVoiceStatus(): Promise<VoiceStatus> {
    const now = new Date().toISOString();
    const runtime = await getManagedVoiceRuntimeStatus(this.storage.systemSettings);
    const stt = this.storage.systemSettings.get<VoiceStatus["stt"]>(VOICE_STATUS_SETTING_KEY)?.value ?? {
      state: "stopped",
      provider: DEFAULT_VOICE_PROVIDER,
      runtimeReady: runtime.readiness === "ready",
      modelId: runtime.selectedModelId,
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
      stt: {
        ...stt,
        runtimeReady: runtime.readiness === "ready",
        modelId: runtime.selectedModelId,
      },
      talk: talkRecord,
      wake,
    };
  }

  public async getVoiceRuntimeStatus(): Promise<VoiceRuntimeStatus> {
    return getManagedVoiceRuntimeStatus(this.storage.systemSettings);
  }

  public async installVoiceRuntime(input: VoiceRuntimeInstallRequest = {}): Promise<VoiceRuntimeStatus> {
    this.recordDevDiagnostic({
      level: "info",
      category: "voice",
      event: "voice.runtime.install.start",
      message: "Installing managed voice runtime",
      context: {
        modelId: input.modelId,
        activate: input.activate,
        repair: input.repair,
      },
    });
    const status = await installManagedVoiceRuntime(this.storage.systemSettings, input);
    this.recordDevDiagnostic({
      level: status.readiness === "ready" ? "info" : "warn",
      category: "voice",
      event: "voice.runtime.install.complete",
      message: "Managed voice runtime install finished",
      context: {
        readiness: status.readiness,
        selectedModelId: status.selectedModelId,
        lastError: status.lastError,
      },
    });
    this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
      ...(this.storage.systemSettings.get<VoiceStatus["stt"]>(VOICE_STATUS_SETTING_KEY)?.value ?? {
        state: "stopped" as const,
        provider: DEFAULT_VOICE_PROVIDER,
        updatedAt: new Date().toISOString(),
      }),
      provider: DEFAULT_VOICE_PROVIDER,
      runtimeReady: status.readiness === "ready",
      modelId: status.selectedModelId,
      lastError: status.lastError,
      updatedAt: new Date().toISOString(),
    });
    return status;
  }

  public async selectVoiceRuntimeModel(modelId: string): Promise<VoiceRuntimeStatus> {
    const status = await selectManagedVoiceModel(this.storage.systemSettings, modelId);
    this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
      ...(this.storage.systemSettings.get<VoiceStatus["stt"]>(VOICE_STATUS_SETTING_KEY)?.value ?? {
        state: "stopped" as const,
        provider: DEFAULT_VOICE_PROVIDER,
        updatedAt: new Date().toISOString(),
      }),
      provider: DEFAULT_VOICE_PROVIDER,
      runtimeReady: status.readiness === "ready",
      modelId: status.selectedModelId,
      lastError: status.lastError,
      updatedAt: new Date().toISOString(),
    });
    return status;
  }

  public async removeVoiceRuntimeModel(modelId: string): Promise<VoiceRuntimeStatus> {
    const status = await removeManagedVoiceModel(this.storage.systemSettings, modelId);
    this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
      ...(this.storage.systemSettings.get<VoiceStatus["stt"]>(VOICE_STATUS_SETTING_KEY)?.value ?? {
        state: "stopped" as const,
        provider: DEFAULT_VOICE_PROVIDER,
        updatedAt: new Date().toISOString(),
      }),
      provider: DEFAULT_VOICE_PROVIDER,
      runtimeReady: status.readiness === "ready",
      modelId: status.selectedModelId,
      lastError: status.lastError,
      updatedAt: new Date().toISOString(),
    });
    return status;
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
    this.gatewaySql.prepare(`
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
    const row = this.gatewaySql.prepare(`
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
    this.gatewaySql.prepare(`
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

  public async previewLlmModels(input: {
    providerId: string;
    baseUrl: string;
    apiKey?: string;
    apiKeyEnv?: string;
    headers?: Record<string, string>;
  }): Promise<{ items: LlmModelRecord[]; source: "remote" | "fallback"; warning?: string }> {
    return this.llmService.previewModels(input);
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
    this.recordDevDiagnostic({
      level: "debug",
      category: "chat",
      event: "chat.completion.start",
      message: "Starting chat completion",
      sessionId: request.memory?.sessionId,
      providerId: request.providerId,
      modelId: request.model,
      context: {
        messageCount: request.messages.length,
        stream: request.stream ?? false,
      },
    });
    let response: ChatCompletionResponse | undefined;
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

    const runtime = this.llmService.getRuntimeConfig({
      includeKeychainForActiveProvider: true,
      useCache: true,
    });
    const primaryProviderId = withContext.providerId ?? runtime.activeProviderId;
    const primaryProvider = runtime.providers.find((item) => item.providerId === primaryProviderId);
    const primaryModel = withContext.model
      ?? primaryProvider?.defaultModel
      ?? runtime.activeModel;
    const allowCrossProviderFallback = shouldAllowCrossProviderFallback(withContext);
    const routing: ChatTurnTraceRecord["routing"] = {
      primaryProviderId,
      primaryModel,
      effectiveProviderId: primaryProviderId,
      effectiveModel: primaryModel,
      fallbackUsed: false,
    };

    const retryAttempts = [
      withContext,
      normalizeToolProtocolRetryRequest(withContext, 1),
      normalizeToolProtocolRetryRequest(withContext, 2),
    ];
    const completionDeadline = createChatCompletionDeadline(withContext.timeoutMs);
    let lastError: Error | undefined;

    for (let index = 0; index < retryAttempts.length; index += 1) {
      const attemptRequest = retryAttempts[index]!;
      try {
        const attemptTimeoutMs = getRemainingChatCompletionTimeoutMs(completionDeadline, withContext.timeoutMs);
        response = await this.llmService.chatCompletions({
          ...attemptRequest,
          timeoutMs: attemptTimeoutMs ?? attemptRequest.timeoutMs,
        });
        routing.effectiveProviderId = attemptRequest.providerId ?? primaryProviderId;
        routing.effectiveModel = response.model ?? attemptRequest.model ?? primaryModel;
        if (index > 0) {
          routing.fallbackUsed = true;
          routing.fallbackProviderId = routing.effectiveProviderId;
          routing.fallbackModel = routing.effectiveModel;
          routing.fallbackReason = index === 1
            ? "provider compatibility retry (normalized tool protocol)"
            : "provider compatibility retry (minimal thinking metadata)";
        }
        break;
      } catch (error) {
        lastError = normalizeChatCompletionAttemptError(error, withContext.timeoutMs);
        this.recordDevDiagnostic({
          level: "warn",
          category: "chat",
          event: "chat.completion.attempt_failed",
          message: "Chat completion attempt failed",
          sessionId: request.memory?.sessionId,
          providerId: attemptRequest.providerId ?? primaryProviderId,
          modelId: attemptRequest.model ?? primaryModel,
          context: {
            error: lastError.message,
            retryIndex: index,
          },
        });
        if (index < retryAttempts.length - 1 && shouldRetryToolProtocolError(lastError)) {
          continue;
        }
        if (index < retryAttempts.length - 1 && index === 0) {
          continue;
        }
      }
    }

    if (!response && allowCrossProviderFallback) {
      const fallbacks = this.resolveFallbackTargets(runtime, primaryProviderId, primaryModel);
      for (const fallback of fallbacks) {
        try {
          const attemptTimeoutMs = getRemainingChatCompletionTimeoutMs(completionDeadline, withContext.timeoutMs);
          response = await this.llmService.chatCompletions({
            ...normalizeToolProtocolRetryRequest(withContext, 2),
            providerId: fallback.providerId,
            model: fallback.model,
            timeoutMs: attemptTimeoutMs ?? withContext.timeoutMs,
          });
          this.recordDevDiagnostic({
            level: "info",
            category: "chat",
            event: "chat.completion.fallback_applied",
            message: "Applied cross-provider fallback",
            sessionId: request.memory?.sessionId,
            providerId: fallback.providerId,
            modelId: fallback.model,
            context: {
              reason: lastError?.message,
            },
          });
          routing.fallbackUsed = true;
          routing.fallbackProviderId = fallback.providerId;
          routing.fallbackModel = response.model ?? fallback.model;
          routing.fallbackReason = `primary failed (${lastError?.message ?? "unknown error"})`;
          routing.effectiveProviderId = fallback.providerId;
          routing.effectiveModel = routing.fallbackModel;
          break;
        } catch (error) {
          lastError = normalizeChatCompletionAttemptError(error, withContext.timeoutMs);
        }
      }
    }

    if (!response) {
      this.recordDevDiagnostic({
        level: "error",
        category: "chat",
        event: "chat.completion.failed",
        message: "Chat completion failed",
        sessionId: request.memory?.sessionId,
        providerId: primaryProviderId,
        modelId: primaryModel,
        context: {
          error: lastError?.message,
        },
      });
      throw lastError ?? new Error("chat completion failed");
    }
    this.recordDevDiagnostic({
      level: "info",
      category: "chat",
      event: "chat.completion.complete",
      message: "Chat completion completed",
      sessionId: request.memory?.sessionId,
      providerId: routing.effectiveProviderId ?? primaryProviderId,
      modelId: routing.effectiveModel ?? primaryModel,
      context: {
        fallbackUsed: routing.fallbackUsed,
      },
    });

    this.publishRealtime("system", "llm", {
      type: "chat_completion",
      providerId: routing.effectiveProviderId ?? primaryProviderId,
      model: routing.effectiveModel ?? primaryModel,
      messageCount: request.messages.length,
      stream: request.stream ?? false,
      memoryContextId: memoryContext?.contextId,
      memoryQmdStatus: memoryContext?.quality.status,
      fallbackUsed: routing.fallbackUsed,
      fallbackProviderId: routing.fallbackProviderId,
      fallbackModel: routing.fallbackModel,
      fallbackReason: routing.fallbackReason,
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
    response.routing = routing;
    return response;
  }

  public async *createChatCompletionStream(request: ChatCompletionRequest): AsyncGenerator<Record<string, unknown>> {
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

    const runtime = this.llmService.getRuntimeConfig({
      includeKeychainForActiveProvider: true,
      useCache: true,
    });
    const primaryProviderId = withContext.providerId ?? runtime.activeProviderId;
    const primaryProvider = runtime.providers.find((item) => item.providerId === primaryProviderId);
    const primaryModel = withContext.model
      ?? primaryProvider?.defaultModel
      ?? runtime.activeModel;
    const allowCrossProviderFallback = shouldAllowCrossProviderFallback(withContext);
    const routing: ChatTurnTraceRecord["routing"] = {
      primaryProviderId,
      primaryModel,
      effectiveProviderId: primaryProviderId,
      effectiveModel: primaryModel,
      fallbackUsed: false,
    };

    const retryAttempts = [
      withContext,
      normalizeToolProtocolRetryRequest(withContext, 1),
      normalizeToolProtocolRetryRequest(withContext, 2),
    ];
    const completionDeadline = createChatCompletionDeadline(withContext.timeoutMs);
    let streamed = false;
    let lastError: Error | undefined;

    for (let index = 0; index < retryAttempts.length; index += 1) {
      const attemptRequest = retryAttempts[index]!;
      try {
        const attemptTimeoutMs = getRemainingChatCompletionTimeoutMs(completionDeadline, withContext.timeoutMs);
        for await (const chunk of this.llmService.chatCompletionsStream({
          ...attemptRequest,
          stream: true,
          timeoutMs: attemptTimeoutMs ?? attemptRequest.timeoutMs,
        })) {
          streamed = true;
          yield chunk;
        }
        routing.effectiveProviderId = attemptRequest.providerId ?? primaryProviderId;
        routing.effectiveModel = attemptRequest.model ?? primaryModel;
        if (index > 0) {
          routing.fallbackUsed = true;
          routing.fallbackProviderId = routing.effectiveProviderId;
          routing.fallbackModel = routing.effectiveModel;
          routing.fallbackReason = index === 1
            ? "provider compatibility retry (normalized tool protocol)"
            : "provider compatibility retry (minimal thinking metadata)";
        }
        break;
      } catch (error) {
        lastError = normalizeChatCompletionAttemptError(error, withContext.timeoutMs);
        if (index < retryAttempts.length - 1 && shouldRetryToolProtocolError(lastError)) {
          continue;
        }
      }
    }

    if (!streamed && allowCrossProviderFallback) {
      const fallbacks = this.resolveFallbackTargets(runtime, primaryProviderId, primaryModel);
      for (const fallback of fallbacks) {
        try {
          const attemptTimeoutMs = getRemainingChatCompletionTimeoutMs(completionDeadline, withContext.timeoutMs);
          for await (const chunk of this.llmService.chatCompletionsStream({
            ...normalizeToolProtocolRetryRequest(withContext, 2),
            providerId: fallback.providerId,
            model: fallback.model,
            stream: true,
            timeoutMs: attemptTimeoutMs ?? withContext.timeoutMs,
          })) {
            streamed = true;
            yield chunk;
          }
          routing.fallbackUsed = true;
          routing.fallbackProviderId = fallback.providerId;
          routing.fallbackModel = fallback.model;
          routing.fallbackReason = `primary failed (${lastError?.message ?? "unknown error"})`;
          routing.effectiveProviderId = fallback.providerId;
          routing.effectiveModel = fallback.model;
          break;
        } catch (error) {
          lastError = normalizeChatCompletionAttemptError(error, withContext.timeoutMs);
        }
      }
    }

    if (!streamed) {
      throw lastError ?? new Error("chat completion stream failed");
    }

    this.publishRealtime("system", "llm", {
      type: "chat_completion_stream",
      providerId: routing.effectiveProviderId ?? primaryProviderId,
      model: routing.effectiveModel ?? primaryModel,
      messageCount: request.messages.length,
      stream: true,
      memoryContextId: memoryContext?.contextId,
      memoryQmdStatus: memoryContext?.quality.status,
      fallbackUsed: routing.fallbackUsed,
      fallbackProviderId: routing.fallbackProviderId,
      fallbackModel: routing.fallbackModel,
      fallbackReason: routing.fallbackReason,
    });

    const finalChunk: Record<string, unknown> = {
      routing,
    };
    if (memoryContext) {
      finalChunk.memoryContext = {
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
    yield finalChunk;
  }

  private resolveFallbackTargets(
    runtime: LlmRuntimeConfig,
    primaryProviderId: string,
    primaryModel: string,
  ): Array<{ providerId: string; model: string }> {
    const candidates: Array<{ providerId: string; model: string }> = [];
    const pushCandidate = (providerId?: string, model?: string) => {
      if (!providerId || !model) {
        return;
      }
      if (providerId === primaryProviderId && model === primaryModel) {
        return;
      }
      if (candidates.some((item) => item.providerId === providerId && item.model === model)) {
        return;
      }
      const provider = runtime.providers.find((item) => item.providerId === providerId);
      if (!provider || !provider.hasApiKey) {
        return;
      }
      candidates.push({ providerId, model });
    };

    const active = runtime.providers.find((provider) => provider.providerId === runtime.activeProviderId);
    pushCandidate(active?.providerId, runtime.activeModel || active?.defaultModel);
    const kimi = runtime.providers.find((provider) => provider.providerId === "moonshot");
    pushCandidate(kimi?.providerId, kimi?.defaultModel);
    return candidates;
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

  public getBankrOptionalMigrationMessage(): string {
    return BANKR_OPTIONAL_MIGRATION_MESSAGE;
  }

  public isFeatureEnabled(flag: keyof RuntimeSettings["features"]): boolean {
    return this.readFeatureFlags()[flag];
  }

  public requireFeatureEnabled(flag: keyof RuntimeSettings["features"]): void {
    if (!this.isFeatureEnabled(flag)) {
      throw new Error(`Feature flag ${flag} is disabled.`);
    }
  }

  private requireBankrBuiltinEnabled(): void {
    if (!this.isFeatureEnabled("bankrBuiltinEnabled")) {
      throw new Error(BANKR_OPTIONAL_MIGRATION_MESSAGE);
    }
  }

  public updateFeatureFlags(patch: Partial<RuntimeSettings["features"]>): RuntimeSettings["features"] {
    const current = this.readFeatureFlags();
    const next: RuntimeSettings["features"] = {
      durableKernelV1Enabled: patch.durableKernelV1Enabled ?? current.durableKernelV1Enabled,
      replayOverridesV1Enabled: patch.replayOverridesV1Enabled ?? current.replayOverridesV1Enabled,
      memoryLifecycleAdminV1Enabled: patch.memoryLifecycleAdminV1Enabled ?? current.memoryLifecycleAdminV1Enabled,
      connectorDiagnosticsV1Enabled: patch.connectorDiagnosticsV1Enabled ?? current.connectorDiagnosticsV1Enabled,
      computerUseGuardrailsV1Enabled: patch.computerUseGuardrailsV1Enabled ?? current.computerUseGuardrailsV1Enabled,
      bankrBuiltinEnabled: patch.bankrBuiltinEnabled ?? current.bankrBuiltinEnabled,
      cronReviewQueueV1Enabled: patch.cronReviewQueueV1Enabled ?? current.cronReviewQueueV1Enabled,
      replayRegressionV1Enabled: patch.replayRegressionV1Enabled ?? current.replayRegressionV1Enabled,
    };
    this.storage.systemSettings.set(FEATURE_FLAGS_SETTING_KEY, next);
    this.config.assistant.features = { ...next };
    return next;
  }

  private applyStoredFeatureFlags(): void {
    this.config.assistant.features = this.readFeatureFlags();
  }

  private readFeatureFlags(): RuntimeSettings["features"] {
    const stored = this.storage.systemSettings.get<Partial<RuntimeSettings["features"]>>(FEATURE_FLAGS_SETTING_KEY)?.value;
    const fromConfig = this.config.assistant.features;
    return {
      durableKernelV1Enabled: stored?.durableKernelV1Enabled ?? fromConfig.durableKernelV1Enabled,
      replayOverridesV1Enabled: stored?.replayOverridesV1Enabled ?? fromConfig.replayOverridesV1Enabled,
      memoryLifecycleAdminV1Enabled: stored?.memoryLifecycleAdminV1Enabled ?? fromConfig.memoryLifecycleAdminV1Enabled,
      connectorDiagnosticsV1Enabled: stored?.connectorDiagnosticsV1Enabled ?? fromConfig.connectorDiagnosticsV1Enabled,
      computerUseGuardrailsV1Enabled: stored?.computerUseGuardrailsV1Enabled ?? fromConfig.computerUseGuardrailsV1Enabled,
      bankrBuiltinEnabled: stored?.bankrBuiltinEnabled ?? fromConfig.bankrBuiltinEnabled,
      cronReviewQueueV1Enabled: stored?.cronReviewQueueV1Enabled ?? fromConfig.cronReviewQueueV1Enabled,
      replayRegressionV1Enabled: stored?.replayRegressionV1Enabled ?? fromConfig.replayRegressionV1Enabled,
    };
  }

  private normalizeDurableRetryPolicy(input: Partial<DurableRetryPolicy> | undefined): DurableRetryPolicy {
    return {
      maxAttempts: Math.max(1, Math.min(20, Math.floor(input?.maxAttempts ?? DURABLE_RETRY_POLICY_DEFAULT.maxAttempts))),
      baseDelayMs: Math.max(100, Math.min(300_000, Math.floor(input?.baseDelayMs ?? DURABLE_RETRY_POLICY_DEFAULT.baseDelayMs))),
      maxDelayMs: Math.max(100, Math.min(900_000, Math.floor(input?.maxDelayMs ?? DURABLE_RETRY_POLICY_DEFAULT.maxDelayMs))),
      backoffMultiplier: Math.max(1, Math.min(8, input?.backoffMultiplier ?? DURABLE_RETRY_POLICY_DEFAULT.backoffMultiplier)),
    };
  }

  private computeDurableRetryDelayMs(current: DurableRunRecord, attemptNo: number): number {
    const metadataPolicy = (current.metadata as { retryPolicy?: Partial<DurableRetryPolicy> } | undefined)?.retryPolicy;
    const policy = this.normalizeDurableRetryPolicy(metadataPolicy);
    const raw = policy.baseDelayMs * (policy.backoffMultiplier ** Math.max(0, attemptNo - 1));
    return Math.max(100, Math.min(policy.maxDelayMs, Math.floor(raw)));
  }

  private recordDurableTimelineEvent(
    runId: string,
    eventType: DurableRunTimelineEvent["eventType"],
    payload?: Record<string, unknown>,
    stepKey?: string,
  ): DurableRunTimelineEvent {
    const event: DurableRunTimelineEvent = {
      eventId: randomUUID(),
      runId,
      eventType,
      stepKey: stepKey?.trim() || undefined,
      payload: payload ?? {},
      createdAt: new Date().toISOString(),
    };
    this.gatewaySql.prepare(`
      INSERT INTO durable_run_events (event_id, run_id, event_type, step_key, payload_json, created_at)
      VALUES (@eventId, @runId, @eventType, @stepKey, @payloadJson, @createdAt)
    `).run({
      eventId: event.eventId,
      runId: event.runId,
      eventType: event.eventType,
      stepKey: event.stepKey ?? null,
      payloadJson: JSON.stringify(event.payload ?? {}),
      createdAt: event.createdAt,
    });
    return event;
  }

  private normalizeReplayOverrides(overrides: ReplayOverrideStep[]): ReplayOverrideStep[] {
    const normalized: ReplayOverrideStep[] = [];
    for (const item of overrides ?? []) {
      const stepKey = item.stepKey?.trim();
      if (!stepKey) {
        continue;
      }
      normalized.push({
        stepKey,
        overrideKind: item.overrideKind,
        override: item.override ?? {},
      });
    }
    return normalized;
  }

  private replaceReplayOverrideSteps(replayRunId: string, overrides: ReplayOverrideStep[]): void {
    this.gatewaySql.prepare("DELETE FROM replay_override_steps WHERE replay_run_id = ?").run(replayRunId);
    const insert = this.gatewaySql.prepare(`
      INSERT INTO replay_override_steps (step_id, replay_run_id, step_key, override_type, override_payload_json, created_at)
      VALUES (@stepId, @replayRunId, @stepKey, @overrideType, @overridePayloadJson, @createdAt)
    `);
    const now = new Date().toISOString();
    for (const override of overrides) {
      insert.run({
        stepId: randomUUID(),
        replayRunId,
        stepKey: override.stepKey,
        overrideType: override.overrideKind,
        overridePayloadJson: JSON.stringify(override.override ?? {}),
        createdAt: now,
      });
    }
  }

  private computeReplayDiffSummary(
    sourceRunId: string,
    replayRunId: string,
    overrides: ReplayOverrideStep[],
  ): ReplayDiffSummary["summary"] {
    void sourceRunId;
    void replayRunId;
    return {
      latencyDeltaMs: 0,
      inputTokensDelta: 0,
      outputTokensDelta: 0,
      cachedInputTokensDelta: 0,
      costUsdDelta: Number(overrides.length) * 0,
      errorChanged: false,
    };
  }

  private requireMemoryItem(itemId: string): MemoryItemRecord {
    const row = this.gatewaySql.prepare(`
      SELECT item_id, namespace, title, content, metadata_json, pinned, ttl_override_seconds, expires_at, status,
             created_at, updated_at, forgotten_at
      FROM memory_items
      WHERE item_id = ?
    `).get(itemId) as {
      item_id: string;
      namespace: string;
      title: string;
      content: string;
      metadata_json: string | null;
      pinned: number;
      ttl_override_seconds: number | null;
      expires_at: string | null;
      status: MemoryItemRecord["status"];
      created_at: string;
      updated_at: string;
      forgotten_at: string | null;
    } | undefined;
    if (!row) {
      throw new Error(`Memory item not found: ${itemId}`);
    }
    return this.mapMemoryItemRow(row);
  }

  private mapMemoryItemRow(row: {
    item_id: string;
    namespace: string;
    title: string;
    content: string;
    metadata_json: string | null;
    pinned: number;
    ttl_override_seconds: number | null;
    expires_at: string | null;
    status: MemoryItemRecord["status"];
    created_at: string;
    updated_at: string;
    forgotten_at: string | null;
  }): MemoryItemRecord {
    return {
      itemId: row.item_id,
      namespace: row.namespace,
      title: row.title,
      content: row.content,
      metadata: this.tryParseJson<Record<string, unknown>>(row.metadata_json, {}),
      pinned: Boolean(row.pinned),
      ttlOverrideSeconds: row.ttl_override_seconds ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      status: MEMORY_ITEM_STATUS_VALUES.has(row.status) ? row.status : "active",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      forgottenAt: row.forgotten_at ?? undefined,
    };
  }

  private recordMemoryChange(
    itemId: string,
    changeType: MemoryChangeEvent["changeType"],
    actorId: string | undefined,
    payload: Record<string, unknown>,
  ): MemoryChangeEvent {
    const change: MemoryChangeEvent = {
      changeId: randomUUID(),
      itemId,
      changeType,
      actorId: actorId?.trim() || undefined,
      payload,
      createdAt: new Date().toISOString(),
    };
    this.gatewaySql.prepare(`
      INSERT INTO memory_change_history (change_id, item_id, change_type, actor_id, payload_json, created_at)
      VALUES (@changeId, @itemId, @changeType, @actorId, @payloadJson, @createdAt)
    `).run({
      changeId: change.changeId,
      itemId: change.itemId,
      changeType: change.changeType,
      actorId: change.actorId ?? null,
      payloadJson: JSON.stringify(change.payload ?? {}),
      createdAt: change.createdAt,
    });
    return change;
  }

  private recordConnectorHealthRun(report: ConnectorDiagnosticReport): void {
    this.gatewaySql.prepare(`
      INSERT INTO connector_health_runs (
        health_run_id, connector_type, connector_id, status, checks_json, recommendation, checked_at
      ) VALUES (
        @healthRunId, @connectorType, @connectorId, @status, @checksJson, @recommendation, @checkedAt
      )
    `).run({
      healthRunId: randomUUID(),
      connectorType: report.connectorType,
      connectorId: report.connectorId,
      status: report.status,
      checksJson: JSON.stringify(report.checks),
      recommendation: report.recommendedNextAction ?? null,
      checkedAt: report.checkedAt,
    });
  }

  private pickConnectorDiagnosticAction(checks: ConnectorDiagnosticReport["checks"]): string | undefined {
    if (checks.some((check) => check.key === "status" && check.status === "fail")) {
      return "Reconnect the connector and resolve the reported status error first.";
    }
    if (checks.some((check) => check.key === "auth" && check.status !== "pass")) {
      return "Provide valid credentials and rerun health check.";
    }
    if (checks.some((check) => check.key === "url" && check.status !== "pass")) {
      return "Set a reachable URL/endpoint and rerun health check.";
    }
    return checks.some((check) => check.status === "warn")
      ? "Review warning checks and tighten policy before production use."
      : undefined;
  }

  private tryParseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
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
    return stored
      .filter((item): item is McpServerRecord => Boolean(item?.serverId))
      .map((item) => ({
        ...item,
        category: item.category ?? inferMcpCategory(item.transport),
        trustTier: item.trustTier ?? "restricted",
        costTier: item.costTier ?? "unknown",
        policy: normalizeMcpPolicy(item.policy),
      }));
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

  private readMcpFirstApprovals(): Record<string, string[]> {
    return this.storage.systemSettings.get<Record<string, string[]>>(MCP_TOOL_FIRST_APPROVAL_SETTING_KEY)?.value ?? {};
  }

  private isMcpToolApproved(serverId: string, toolName: string): boolean {
    const approved = this.readMcpFirstApprovals();
    return approved[serverId]?.includes(toolName) ?? false;
  }

  private readSkillStates(): Map<string, SkillStateRecord> {
    const rows = this.gatewaySql.prepare(`
      SELECT skill_id AS skillId, state, note, updated_at AS updatedAt, first_auto_approved_at AS firstAutoApprovedAt
      FROM skill_state
    `).all() as unknown as SkillStateRecord[];

    return new Map(rows.map((row) => [row.skillId, row]));
  }

  private ensureSkillStates(skillIds: string[]): void {
    const unique = [...new Set(skillIds)];
    const now = new Date().toISOString();
    const insert = this.gatewaySql.prepare(`
      INSERT OR IGNORE INTO skill_state (skill_id, state, note, updated_at, first_auto_approved_at)
      VALUES (@skillId, @state, @note, @updatedAt, NULL)
    `);
    for (const skillId of unique) {
      insert.run({
        skillId,
        state: "enabled",
        note: null,
        updatedAt: now,
      });
    }
  }

  private recordSkillImportEvent(
    validation: SkillImportValidationResult,
    eventType: "import_validated" | "import_installed",
  ): void {
    const now = new Date().toISOString();
    const skillId = validation.inferredSkillId
      ? `import:${validation.inferredSkillId}`
      : `import:${createHash("sha1").update(validation.candidate.canonicalKey).digest("hex").slice(0, 12)}`;
    this.gatewaySql.prepare(`
      INSERT INTO skill_activation_events (
        event_id, skill_id, event_type, payload_json, created_at
      ) VALUES (
        @eventId, @skillId, @eventType, @payloadJson, @createdAt
      )
    `).run({
      eventId: randomUUID(),
      skillId,
      eventType,
      payloadJson: JSON.stringify({
        sourceProvider: validation.candidate.sourceProvider,
        sourceRef: validation.candidate.sourceRef,
        canonicalKey: validation.candidate.canonicalKey,
        valid: validation.valid,
        riskLevel: validation.riskLevel,
        skillName: validation.inferredSkillName,
        skillId: validation.inferredSkillId,
        warnings: validation.warnings,
        errors: validation.errors,
      }),
      createdAt: now,
    });
  }

  private processMediaJob(jobId: string): void {
    if (typeof jobId !== "string" || !jobId.trim()) {
      return;
    }
    if (this.closing) {
      return;
    }
    const task = this.runMediaJob(jobId)
      .catch((error) => {
        const now = new Date().toISOString();
        const errorMessage = error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
        this.gatewaySql.prepare(`
          UPDATE media_jobs
          SET status = 'failed', error = @error, updated_at = @updatedAt, completed_at = @completedAt
          WHERE job_id = @jobId
        `).run({
          error: errorMessage,
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
    if (typeof jobId !== "string" || !jobId.trim()) {
      return;
    }
    const now = new Date().toISOString();
    this.gatewaySql.prepare(`
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
      this.gatewaySql.prepare(`
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
      this.gatewaySql.prepare(`
        UPDATE media_jobs
        SET status = 'ready', output_json = @outputJson, updated_at = @updatedAt, completed_at = @completedAt
        WHERE job_id = @jobId
      `).run({
        outputJson: JSON.stringify({ transcriptText: transcript.text, provider: transcript.provider }),
        updatedAt: completedAt,
        completedAt,
        jobId,
      });
      this.gatewaySql.prepare(`
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
      this.gatewaySql.prepare(`
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
      this.gatewaySql.prepare(`
        UPDATE chat_attachments
        SET analysis_status = 'unsupported'
        WHERE attachment_id = @attachmentId
      `).run({
        attachmentId,
      });
      return;
    }

    const completedAt = new Date().toISOString();
    this.gatewaySql.prepare(`
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
    this.gatewaySql.prepare(`
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
    const runtime = await getManagedVoiceRuntimeStatus(this.storage.systemSettings);
    const binPath = process.env.GOATCITADEL_WHISPER_CPP_BIN?.trim() || runtime.binaryPath;
    const modelPath = process.env.GOATCITADEL_WHISPER_CPP_MODEL_PATH?.trim() || runtime.selectedModelPath;
    const ffmpegPath = process.env.GOATCITADEL_FFMPEG_BIN?.trim() || runtime.ffmpegPath;
    const extraArgs = parseVoiceCliArgs(process.env.GOATCITADEL_WHISPER_CPP_ARGS);
    if (!binPath) {
      const now = new Date().toISOString();
      this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
        state: "error",
        provider: DEFAULT_VOICE_PROVIDER,
        modelId: runtime.selectedModelId,
        runtimeReady: false,
        lastError: "No whisper.cpp runtime is configured.",
        updatedAt: now,
      });
      throw new Error("Local STT is not configured. Install the managed voice runtime or set GOATCITADEL_WHISPER_CPP_BIN.");
    }

    const tempBase = path.join(os.tmpdir(), `goatcitadel-whisper-${randomUUID()}`);
    const ext = extFromMimeType(mimeType);
    const inputPath = `${tempBase}${ext}`;
    const normalizedInputPath = `${tempBase}-normalized.wav`;
    const outputBase = `${tempBase}-out`;
    const outputPath = `${outputBase}.txt`;

    this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
      state: "running",
      provider: DEFAULT_VOICE_PROVIDER,
      modelId: runtime.selectedModelId,
      runtimeReady: Boolean(binPath && (modelPath || process.env.GOATCITADEL_WHISPER_CPP_BIN?.trim())),
      updatedAt: new Date().toISOString(),
    });

    try {
      await fs.writeFile(inputPath, bytes);
      const whisperInputPath = await normalizeAudioForWhisper({
        inputPath,
        outputPath: normalizedInputPath,
        mimeType,
        ffmpegPath,
      });
      const args = [
        ...extraArgs,
      ];
      if (modelPath) {
        args.push("-m", modelPath);
      }
      args.push(
        "-f",
        whisperInputPath,
        "-otxt",
        "-of",
        outputBase,
      );
      if (language?.trim()) {
        args.push("-l", language.trim());
      }
      execFileSync(binPath, args, { stdio: "pipe" });
      const text = (await fs.readFile(outputPath, "utf8")).trim();
      const now = new Date().toISOString();
      this.storage.systemSettings.set(VOICE_STATUS_SETTING_KEY, {
        state: "stopped",
        provider: DEFAULT_VOICE_PROVIDER,
        modelId: runtime.selectedModelId,
        runtimeReady: true,
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
        modelId: runtime.selectedModelId,
        runtimeReady: false,
        lastError: (error as Error).message,
        updatedAt: now,
      });
      throw new Error(`Local STT failed: ${(error as Error).message}`);
    } finally {
      await Promise.allSettled([
        fs.rm(inputPath, { force: true }),
        fs.rm(normalizedInputPath, { force: true }),
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
    if (this.proactiveScheduler) {
      clearInterval(this.proactiveScheduler);
      this.proactiveScheduler = undefined;
    }
    if (this.improvementScheduler) {
      clearInterval(this.improvementScheduler);
      this.improvementScheduler = undefined;
    }
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

  private async resolveDeviceAccessApproval(
    currentApproval: ApprovalRequest,
    input: ApprovalResolveInput,
  ): Promise<ApprovalResolveResult> {
    if (currentApproval.status !== "pending") {
      throw new Error(`Approval ${currentApproval.approvalId} is already resolved`);
    }
    if (input.decision === "edit") {
      throw new Error("Editing device access approvals is not supported.");
    }

    const existingRequest = this.getAuthDeviceRequestByApprovalId(currentApproval.approvalId);
    if (!existingRequest) {
      throw new Error("Device access request not found.");
    }

    const request = await this.expireDeviceAccessRequestIfNeeded(existingRequest);
    if (request.status === "expired") {
      throw new Error("Device access request expired before it could be approved.");
    }
    if (request.status !== "pending") {
      throw new Error(`Approval ${currentApproval.approvalId} is already resolved`);
    }

    const resolvedAt = new Date().toISOString();
    const requestStatus: DeviceAccessRequestStatus = input.decision === "approve" ? "approved" : "rejected";
    const deviceToken = input.decision === "approve"
      ? randomBytes(DEVICE_ACCESS_TOKEN_BYTES).toString("base64url")
      : undefined;
    const deviceTokenExpiresAt = deviceToken
      ? new Date(Date.now() + DEVICE_ACCESS_TOKEN_TTL_MS).toISOString()
      : undefined;
    let approval: ApprovalRequest;

    this.storage.db.exec("BEGIN IMMEDIATE");
    try {
      if (deviceToken) {
        this.gatewaySql.prepare(`
          INSERT INTO auth_device_grants (
            grant_id, request_id, token_hash, device_label, device_type, platform,
            granted_by, created_at, expires_at, metadata_json
          ) VALUES (
            @grantId, @requestId, @tokenHash, @deviceLabel, @deviceType, @platform,
            @grantedBy, @createdAt, @expiresAt, @metadataJson
          )
        `).run({
          grantId: randomUUID(),
          requestId: request.requestId,
          tokenHash: hashSensitiveToken(deviceToken),
          deviceLabel: request.deviceLabel,
          deviceType: request.deviceType,
          platform: request.platform ?? null,
          grantedBy: input.resolvedBy,
          createdAt: resolvedAt,
          expiresAt: deviceTokenExpiresAt ?? null,
          metadataJson: JSON.stringify({
            approvalId: currentApproval.approvalId,
            requestedOrigin: request.requestedOrigin,
            requestedIp: request.requestedIp,
          }),
        });
      }

      this.gatewaySql.prepare(`
        UPDATE auth_device_requests
        SET status = @status,
            resolved_at = @resolvedAt,
            resolved_by = @resolvedBy,
            resolution_note = @resolutionNote,
            approved_token_plaintext = @approvedTokenPlaintext,
            approved_token_expires_at = @approvedTokenExpiresAt
        WHERE request_id = @requestId
          AND status = 'pending'
      `).run({
        requestId: request.requestId,
        status: requestStatus,
        resolvedAt,
        resolvedBy: input.resolvedBy,
        resolutionNote: input.resolutionNote ?? null,
        approvedTokenPlaintext: deviceToken ?? null,
        approvedTokenExpiresAt: deviceTokenExpiresAt ?? null,
      });

      approval = this.storage.approvals.resolve(currentApproval.approvalId, input);
      this.storage.approvalEvents.append({
        approvalId: currentApproval.approvalId,
        eventType: "resolved",
        actorId: input.resolvedBy,
        payload: {
          decision: input.decision,
          status: approval.status,
        },
      });
      this.storage.db.exec("COMMIT");
    } catch (error) {
      this.storage.db.exec("ROLLBACK");
      throw error;
    }

    await this.recordApprovalResolutionEffects(approval!, input);
    await this.storage.audit.append("approvals", {
      event: "auth.device_request.resolve",
      requestId: request.requestId,
      approvalId: currentApproval.approvalId,
      status: requestStatus,
      resolvedBy: input.resolvedBy,
      deviceLabel: request.deviceLabel,
      deviceType: request.deviceType,
      platform: request.platform,
      requestedIp: request.requestedIp,
      deviceTokenExpiresAt,
    });

    this.publishRealtime("auth_device_request_resolved", "auth", {
      requestId: request.requestId,
      approvalId: currentApproval.approvalId,
      status: requestStatus,
      resolvedAt,
      resolvedBy: input.resolvedBy,
      deviceLabel: request.deviceLabel,
      deviceType: request.deviceType,
      platform: request.platform,
      requestedIp: request.requestedIp,
      deviceTokenExpiresAt,
    });

    return {
      approval: approval!,
    };
  }

  private async expireDeviceAccessRequestIfNeeded(request: AuthDeviceRequestRecord): Promise<AuthDeviceRequestRecord> {
    if (request.status !== "pending") {
      return request;
    }
    const expiresAt = Date.parse(request.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) {
      return request;
    }

    const resolutionInput: ApprovalResolveInput = {
      decision: "reject",
      resolvedBy: "system:auth-device-expiry",
      resolutionNote: "Device access request expired before approval.",
    };
    const resolvedAt = new Date().toISOString();
    let approval: ApprovalRequest | undefined;

    this.storage.db.exec("BEGIN IMMEDIATE");
    try {
      this.gatewaySql.prepare(`
        UPDATE auth_device_requests
        SET status = 'expired',
            resolved_at = @resolvedAt,
            resolved_by = @resolvedBy,
            resolution_note = @resolutionNote
        WHERE request_id = @requestId
          AND status = 'pending'
      `).run({
        requestId: request.requestId,
        resolvedAt,
        resolvedBy: resolutionInput.resolvedBy,
        resolutionNote: resolutionInput.resolutionNote ?? null,
      });

      const currentApproval = this.storage.approvals.get(request.approvalId);
      if (currentApproval.status === "pending") {
        approval = this.storage.approvals.resolve(request.approvalId, resolutionInput);
        this.storage.approvalEvents.append({
          approvalId: request.approvalId,
          eventType: "resolved",
          actorId: resolutionInput.resolvedBy,
          payload: {
            decision: resolutionInput.decision,
            status: approval.status,
          },
        });
      }
      this.storage.db.exec("COMMIT");
    } catch (error) {
      this.storage.db.exec("ROLLBACK");
      throw error;
    }

    if (approval) {
      await this.recordApprovalResolutionEffects(approval, resolutionInput);
    }
    await this.storage.audit.append("approvals", {
      event: "auth.device_request.expire",
      requestId: request.requestId,
      approvalId: request.approvalId,
      deviceLabel: request.deviceLabel,
      deviceType: request.deviceType,
      platform: request.platform,
      requestedIp: request.requestedIp,
    });

    this.publishRealtime("auth_device_request_resolved", "auth", {
      requestId: request.requestId,
      approvalId: request.approvalId,
      status: "expired",
      resolvedAt,
      resolvedBy: resolutionInput.resolvedBy,
      deviceLabel: request.deviceLabel,
      deviceType: request.deviceType,
      platform: request.platform,
      requestedIp: request.requestedIp,
    });

    return this.getAuthDeviceRequestById(request.requestId) ?? {
      ...request,
      status: "expired",
      resolvedAt,
      resolvedBy: resolutionInput.resolvedBy,
      resolutionNote: resolutionInput.resolutionNote,
    };
  }

  private getAuthDeviceRequestById(requestId: string): AuthDeviceRequestRecord | undefined {
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM auth_device_requests
      WHERE request_id = @requestId
      LIMIT 1
    `).get({ requestId }) as Record<string, unknown> | undefined;
    return row ? mapAuthDeviceRequestRow(row) : undefined;
  }

  private getAuthDeviceRequestByApprovalId(approvalId: string): AuthDeviceRequestRecord | undefined {
    const row = this.gatewaySql.prepare(`
      SELECT *
      FROM auth_device_requests
      WHERE approval_id = @approvalId
      LIMIT 1
    `).get({ approvalId }) as Record<string, unknown> | undefined;
    return row ? mapAuthDeviceRequestRow(row) : undefined;
  }

  private async recordApprovalResolutionEffects(
    approval: ApprovalRequest,
    input: ApprovalResolveInput,
    executedAction?: ToolInvokeResult,
  ): Promise<void> {
    await this.storage.audit.append("approvals", {
      event: "approval.resolve",
      approvalId: approval.approvalId,
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
      approvalId: approval.approvalId,
      status: approval.status,
      decision: input.decision,
      resolvedBy: input.resolvedBy,
      executedOutcome: executedAction?.outcome,
    });
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

  private async ensureChatMessageProjection(sessionId: string): Promise<void> {
    if (this.chatMessageProjectionBackfillAttempted.has(sessionId)) {
      return;
    }
    this.chatMessageProjectionBackfillAttempted.add(sessionId);
    if (this.storage.chatMessages.countBySession(sessionId) > 0) {
      return;
    }
    const events = await this.readTranscriptOrEmpty(sessionId);
    const projected = events
      .filter((event) => event.type === "message.user" || event.type === "message.assistant")
      .map((event) => toChatMessageRecord(event))
      .filter((message): message is ChatMessageRecord => Boolean(message));
    if (projected.length === 0) {
      return;
    }
    this.storage.chatMessages.upsertMany(projected);
  }

  private async listChatMessagesFromTranscript(
    sessionId: string,
    limit: number,
    cursor?: string,
  ): Promise<ChatMessageRecord[]> {
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

  private normalizeWorkspaceId(workspaceId?: string): string {
    if (!workspaceId?.trim()) {
      return DEFAULT_WORKSPACE_ID;
    }
    const normalized = workspaceId.trim();
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(normalized)) {
      throw new Error("workspaceId contains unsupported characters");
    }
    return normalized;
  }

  private resolveGuidancePath(
    docType: GuidanceDocType,
    scope: "global" | "workspace",
    workspaceId?: string,
  ): { fileName: string; absolutePath: string } {
    const fileName = GUIDANCE_DOC_FILE_MAP[docType];
    if (!fileName) {
      throw new Error(`Unsupported guidance doc type: ${docType}`);
    }
    if (scope === "global") {
      return {
        fileName,
        absolutePath: path.resolve(this.config.rootDir, fileName),
      };
    }
    const normalizedWorkspaceId = this.normalizeWorkspaceId(workspaceId);
    return {
      fileName,
      absolutePath: path.resolve(this.config.rootDir, "workspaces", normalizedWorkspaceId, fileName),
    };
  }

  private async readGuidanceDocument(
    docType: GuidanceDocType,
    scope: "global" | "workspace",
    workspaceId?: string,
  ): Promise<GuidanceDocumentRecord> {
    const normalizedWorkspaceId = scope === "workspace" ? this.normalizeWorkspaceId(workspaceId) : undefined;
    const resolved = this.resolveGuidancePath(docType, scope, normalizedWorkspaceId);
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(resolved.absolutePath, "utf8"),
        fs.stat(resolved.absolutePath),
      ]);
      return {
        docType,
        scope,
        workspaceId: normalizedWorkspaceId,
        fileName: resolved.fileName,
        absolutePath: resolved.absolutePath,
        exists: true,
        content,
        updatedAt: stat.mtime.toISOString(),
      };
    } catch {
      return {
        docType,
        scope,
        workspaceId: normalizedWorkspaceId,
        fileName: resolved.fileName,
        absolutePath: resolved.absolutePath,
        exists: false,
        content: "",
      };
    }
  }

  private async writeGuidanceDocument(
    docType: GuidanceDocType,
    scope: "global" | "workspace",
    workspaceId: string | undefined,
    content: string,
  ): Promise<void> {
    const resolved = this.resolveGuidancePath(docType, scope, workspaceId);
    await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });
    const normalizedContent = content.replace(/\r\n/g, "\n").trimEnd() + "\n";
    await fs.writeFile(resolved.absolutePath, normalizedContent, "utf8");
  }

  private async resolveRuntimeGuidance(workspaceId: string): Promise<ResolvedRuntimeGuidance> {
    const normalizedWorkspaceId = this.normalizeWorkspaceId(workspaceId);
    if (isTruthy(process.env[GUIDANCE_DEBUG_KILL_SWITCH_ENV])) {
      return {
        workspaceId: normalizedWorkspaceId,
        globalFilesUsed: [],
        workspaceFilesUsed: [],
        truncated: false,
      };
    }

    const globalFilesUsed: string[] = [];
    const workspaceFilesUsed: string[] = [];
    const selectedBlocks: Array<{ title: string; content: string }> = [];

    for (const docType of RUNTIME_GUIDANCE_DOC_TYPES) {
      const [workspaceDoc, globalDoc] = await Promise.all([
        this.readGuidanceDocument(docType, "workspace", normalizedWorkspaceId),
        this.readGuidanceDocument(docType, "global"),
      ]);
      const selected = workspaceDoc.exists ? workspaceDoc : (globalDoc.exists ? globalDoc : undefined);
      if (!selected || !selected.content.trim()) {
        continue;
      }
      if (selected.scope === "workspace") {
        workspaceFilesUsed.push(selected.fileName);
      } else {
        globalFilesUsed.push(selected.fileName);
      }
      selectedBlocks.push({
        title: `${selected.fileName} (${selected.scope})`,
        content: selected.content.trim(),
      });
    }

    const header = [
      `Workspace context: ${normalizedWorkspaceId}.`,
      "Apply these runtime guidance notes with workspace overrides taking precedence over global defaults.",
    ].join("\n");
    const immutableSafetyFooter = [
      "Non-overridable safety invariants:",
      "- Approval requirements remain authoritative.",
      "- Deny-wins policy remains authoritative.",
      "- Tool grants and host/network/path security boundaries remain authoritative.",
    ].join("\n");
    const budgetForBlocks = Math.max(
      1200,
      MAX_RUNTIME_GUIDANCE_CHARS - header.length - immutableSafetyFooter.length - 12,
    );

    let consumed = 0;
    let truncated = false;
    const blockLines: string[] = [];
    for (const block of selectedBlocks) {
      if (consumed >= budgetForBlocks) {
        truncated = true;
        break;
      }
      const rendered = `## ${block.title}\n${block.content}`;
      if (consumed + rendered.length <= budgetForBlocks) {
        blockLines.push(rendered);
        consumed += rendered.length;
        continue;
      }
      const remaining = budgetForBlocks - consumed;
      if (remaining > 80) {
        blockLines.push(`${rendered.slice(0, remaining)}\n...[truncated]`);
      }
      truncated = true;
      consumed = budgetForBlocks;
      break;
    }

    const systemInstruction = [header, ...blockLines, immutableSafetyFooter].filter(Boolean).join("\n\n");
    return {
      workspaceId: normalizedWorkspaceId,
      systemInstruction: systemInstruction.trim().length > 0 ? systemInstruction : undefined,
      globalFilesUsed,
      workspaceFilesUsed,
      truncated,
    };
  }

  private requireChatSession(sessionId: string): ChatSessionRecord {
    const session = this.getSession(sessionId);
    const projectLink = this.storage.chatSessionProjects.get(sessionId);
    const project = projectLink ? this.storage.chatProjects.find(projectLink.projectId) : undefined;
    const meta = this.storage.chatSessionMeta.get(sessionId)
      ?? this.storage.chatSessionMeta.ensure(sessionId, undefined, project?.workspaceId ?? DEFAULT_WORKSPACE_ID);
    return toChatSessionRecord(session, meta, project);
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
      guidanceSystemInstruction?: string;
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
            parts?: unknown;
            attachments?: unknown;
          };
        };
        const baseContent = typeof payload.message?.content === "string"
          ? payload.message.content
          : this.extractMessagePreview(event.payload);
        if (event.type === "message.user") {
          const userMessage: ChatMessageRecord = {
            messageId: event.eventId,
            sessionId,
            role: "user",
            actorType: "user",
            actorId: "operator",
            content: baseContent,
            timestamp: event.timestamp,
            parts: parseMessageParts(payload.message?.parts),
            attachments: parseMessageAttachments(payload.message?.attachments),
          };
          return {
            role: "user" as const,
            content: await this.buildUserMessageContent(userMessage, supportsVision),
          };
        }
        return {
          role: "assistant" as const,
          content: baseContent,
        };
      }));
    const messages = mapped.slice(-80);
    if (options?.guidanceSystemInstruction?.trim()) {
      return [
        {
          role: "system",
          content: options.guidanceSystemInstruction.trim(),
        },
        ...messages,
      ];
    }
    return messages;
  }

  private listHydratedChatTurnTraces(sessionId: string, limit = 200): ChatTurnTraceRecord[] {
    const traces = this.storage.chatTurnTraces.listBySession(sessionId, limit);
    const toolRunsByTurnId = this.storage.chatToolRuns.listByTurnIds(traces.map((trace) => trace.turnId));
    return traces.map((trace) => ({
      ...trace,
      toolRuns: toolRunsByTurnId.get(trace.turnId) ?? [],
      citations: trace.citations ?? [],
      capabilityUpgradeSuggestions: trace.capabilityUpgradeSuggestions,
    }));
  }

  private resolveChatActiveLeafTurnId(
    sessionId: string,
    traces: ChatTurnTraceRecord[],
  ): string | undefined {
    const branchState = this.storage.chatSessionBranchState.get(sessionId);
    if (branchState && traces.some((trace) => trace.turnId === branchState.activeLeafTurnId)) {
      return branchState.activeLeafTurnId;
    }
    const newest = [...traces]
      .sort((left, right) => {
        const leftStarted = Date.parse(left.startedAt) || 0;
        const rightStarted = Date.parse(right.startedAt) || 0;
        if (leftStarted !== rightStarted) {
          return rightStarted - leftStarted;
        }
        return right.turnId.localeCompare(left.turnId);
      })
      .at(0);
    if (!newest) {
      return undefined;
    }
    const newestLeafTurnId = resolveNewestLeafTurnId(
      newest.turnId,
      new Map(traces.map((trace) => [trace.turnId, {
        turnId: trace.turnId,
        startedAtMs: Date.parse(trace.startedAt) || 0,
      }])),
      this.buildChatTurnChildrenMap(traces),
    );
    this.storage.chatSessionBranchState.setActiveLeaf(
      sessionId,
      newestLeafTurnId,
      newest.finishedAt ?? newest.startedAt,
    );
    return newestLeafTurnId;
  }

  private buildChatTurnChildrenMap(traces: ChatTurnTraceRecord[]): Map<string, string[]> {
    const childrenByTurnId = new Map<string, string[]>();
    for (const trace of traces) {
      if (!trace.parentTurnId) {
        continue;
      }
      const children = childrenByTurnId.get(trace.parentTurnId) ?? [];
      children.push(trace.turnId);
      childrenByTurnId.set(trace.parentTurnId, children);
    }
    return childrenByTurnId;
  }

  private async buildLlmMessagesFromBranchPath(
    sessionId: string,
    pathTurnIds: string[],
    currentUserMessage: ChatMessageRecord | undefined,
    options?: {
      providerId?: string;
      model?: string;
      guidanceSystemInstruction?: string;
    },
    state?: Awaited<ReturnType<GatewayService["loadChatTurnSessionState"]>>,
  ): Promise<ChatCompletionRequest["messages"]> {
    const sessionState = state ?? await this.loadChatTurnSessionState(sessionId);
    const orderedMessages: ChatMessageRecord[] = [];
    for (const turnId of pathTurnIds) {
      const trace = sessionState.tracesById.get(turnId);
      if (!trace) {
        continue;
      }
      const userMessage = sessionState.messagesById.get(trace.userMessageId);
      if (userMessage) {
        orderedMessages.push(userMessage);
      }
      if (trace.assistantMessageId) {
        const assistantMessage = sessionState.messagesById.get(trace.assistantMessageId);
        if (assistantMessage) {
          orderedMessages.push(assistantMessage);
        }
      }
    }
    if (currentUserMessage) {
      orderedMessages.push(currentUserMessage);
    }
    return this.buildLlmMessagesFromRecords(orderedMessages, options);
  }

  private async buildLlmMessagesFromRecords(
    records: ChatMessageRecord[],
    options?: {
      providerId?: string;
      model?: string;
      guidanceSystemInstruction?: string;
    },
  ): Promise<ChatCompletionRequest["messages"]> {
    const runtime = this.llmService.getRuntimeConfig();
    const providerId = options?.providerId ?? runtime.activeProviderId;
    const providerSummary = runtime.providers.find((item) => item.providerId === providerId);
    const model = options?.model ?? providerSummary?.defaultModel ?? runtime.activeModel;
    const supportsVision = Boolean(providerSummary?.capabilities?.vision || inferModelVisionSupport(model));
    const mapped = await Promise.all(records.map(async (message) => {
      if (message.role === "assistant") {
        return {
          role: "assistant" as const,
          content: message.content,
        };
      }
      if (message.role === "system") {
        return {
          role: "system" as const,
          content: message.content,
        };
      }
      return {
        role: "user" as const,
        content: await this.buildUserMessageContent(message, supportsVision),
      };
    }));
    const messages = mapped.slice(-80);
    if (!options?.guidanceSystemInstruction?.trim()) {
      return messages;
    }
    return [
      {
        role: "system",
        content: options.guidanceSystemInstruction.trim(),
      },
      ...messages,
    ];
  }

  private async buildUserMessageContent(
    message: ChatMessageRecord,
    supportsVision: boolean,
  ): Promise<string | Array<Record<string, unknown>>> {
    const prompt = this.buildUserMessagePrompt(message);
    const attachments = this.resolveMessageAttachments(message);
    const contentParts = await this.buildAttachmentMessageParts(attachments, prompt, supportsVision);
    if (contentParts) {
      return contentParts;
    }
    const attachmentContext = this.buildAttachmentPromptContext(attachments, supportsVision);
    return attachmentContext
      ? `${prompt}\n\n${attachmentContext}`
      : prompt;
  }

  private buildUserMessagePrompt(message: ChatMessageRecord): string {
    const baseContent = message.content.trim();
    const textParts = Array.isArray(message.parts)
      ? message.parts
        .filter((part): part is Extract<ChatInputPart, { type: "text" }> => part.type === "text")
        .map((part) => part.text.trim())
        .filter(Boolean)
      : [];
    if (textParts.length === 0) {
      return baseContent;
    }
    if (!baseContent) {
      return textParts.join("\n\n");
    }
    if (textParts[0] === baseContent) {
      return textParts.join("\n\n");
    }
    return [baseContent, ...textParts].join("\n\n");
  }

  private resolveMessageAttachments(message: ChatMessageRecord): ChatAttachmentRecord[] {
    const attachmentIds = new Set<string>();
    if (Array.isArray(message.attachments)) {
      for (const attachment of message.attachments) {
        if (attachment?.attachmentId) {
          attachmentIds.add(attachment.attachmentId);
        }
      }
    }
    if (Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (part.type !== "text" && part.attachmentId) {
          attachmentIds.add(part.attachmentId);
        }
      }
    }
    if (attachmentIds.size === 0) {
      return [];
    }
    return this.storage.chatAttachments.listByIds([...attachmentIds]).slice(0, 6);
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
    const filePath = this.getCronJobsConfigPath();
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
      const existing = this.storage.cronJobs.get(job.jobId);
      this.storage.cronJobs.upsert({
        ...job,
        jobId: normalizeCronJobId(job.jobId),
        name: normalizeCronJobName(job.name),
        schedule: normalizeCronSchedule(job.schedule),
        enabled: Boolean(job.enabled),
        lastRunAt: job.lastRunAt ?? existing?.lastRunAt,
        nextRunAt: job.nextRunAt ?? existing?.nextRunAt,
      });
    }
  }

  private persistCronJobsConfig(): void {
    const filePath = this.getCronJobsConfigPath();
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    const jobs = this.storage.cronJobs.list().map((job) => ({
      jobId: job.jobId,
      name: job.name,
      schedule: job.schedule,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt,
      nextRunAt: job.nextRunAt,
    }));
    fsSync.writeFileSync(filePath, JSON.stringify({ jobs }, null, 2), "utf8");
  }

  private getCronJobsConfigPath(): string {
    return path.join(this.config.rootDir, "config", "cron-jobs.json");
  }

  private ensureWeeklyImprovementCronJob(): void {
    const existing = this.storage.cronJobs.get(IMPROVEMENT_WEEKLY_JOB_ID);
    const now = new Date().toISOString();
    this.storage.cronJobs.upsert({
      jobId: IMPROVEMENT_WEEKLY_JOB_ID,
      name: "Self-Improvement Weekly Replay",
      schedule: IMPROVEMENT_WEEKLY_SCHEDULE_LABEL,
      enabled: existing?.enabled ?? true,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: existing?.nextRunAt,
    }, now);
  }

  private ensurePrivateBetaBackupCronJob(): void {
    const existing = this.storage.cronJobs.get(PRIVATE_BETA_BACKUP_JOB_ID);
    const now = new Date().toISOString();
    this.storage.cronJobs.upsert({
      jobId: PRIVATE_BETA_BACKUP_JOB_ID,
      name: "Private Beta Daily Backup",
      schedule: PRIVATE_BETA_BACKUP_SCHEDULE_LABEL,
      enabled: existing?.enabled ?? true,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: existing?.nextRunAt,
    }, now);
  }

  private ensureMemoryFlushCronJob(): void {
    const existing = this.storage.cronJobs.get(MEMORY_FLUSH_DAILY_JOB_ID);
    const now = new Date().toISOString();
    this.storage.cronJobs.upsert({
      jobId: MEMORY_FLUSH_DAILY_JOB_ID,
      name: "Memory Flush Daily",
      schedule: MEMORY_FLUSH_DAILY_SCHEDULE_LABEL,
      enabled: existing?.enabled ?? true,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: existing?.nextRunAt,
    }, now);
  }

  private ensureCostReportCronJob(): void {
    const existing = this.storage.cronJobs.get(COST_REPORT_HOURLY_JOB_ID);
    const now = new Date().toISOString();
    this.storage.cronJobs.upsert({
      jobId: COST_REPORT_HOURLY_JOB_ID,
      name: "Cost Report Hourly",
      schedule: COST_REPORT_HOURLY_SCHEDULE_LABEL,
      enabled: existing?.enabled ?? true,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: existing?.nextRunAt,
    }, now);
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
      durable: this.config.assistant.durable,
      features: this.readFeatureFlags(),
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
    return serializePathWithinRoot(
      this.config.rootDir,
      fullPath,
      this.warnedOutsideRootPathFingerprints,
    );
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
    workspaceId?: string;
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
    workspaceId: meta.workspaceId ?? project?.workspaceId,
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
      parts?: unknown;
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
    parts: parseMessageParts(message.parts),
    attachments: parseMessageAttachments(message.attachments),
  };
}

function parseMessageParts(input: unknown): ChatMessageRecord["parts"] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const parts = input
    .map((item) => normalizeMessagePart(item))
    .filter((item): item is ChatInputPart => Boolean(item));
  return parts.length > 0 ? parts : undefined;
}

function normalizeMessagePart(input: unknown): ChatInputPart | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const value = input as Record<string, unknown>;
  const type = typeof value.type === "string" ? value.type : undefined;
  if (!type) {
    return undefined;
  }
  if (type === "text") {
    const text = typeof value.text === "string" ? value.text : undefined;
    return text !== undefined ? { type: "text", text } : undefined;
  }
  if (type === "image_ref") {
    const attachmentId = typeof value.attachmentId === "string" ? value.attachmentId : undefined;
    if (!attachmentId) {
      return undefined;
    }
    return {
      type,
      attachmentId,
      mimeType: typeof value.mimeType === "string" ? value.mimeType : undefined,
      detail: value.detail === "low" || value.detail === "high" || value.detail === "auto"
        ? value.detail
        : undefined,
    };
  }
  if (type === "audio_ref" || type === "video_ref" || type === "file_ref") {
    const attachmentId = typeof value.attachmentId === "string" ? value.attachmentId : undefined;
    if (!attachmentId) {
      return undefined;
    }
    return {
      type,
      attachmentId,
      mimeType: typeof value.mimeType === "string" ? value.mimeType : undefined,
    };
  }
  return undefined;
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

function buildEmptyAssistantTurnFallbackText(): string {
  return [
    "Summary",
    "- I completed the turn, but the final assistant text was empty after tool/model synthesis.",
    "",
    "Constraints",
    "- This usually means tool/model outputs were incomplete or could not be stitched into a final response.",
    "",
    "What I did instead",
    "- Preserved trace/tool evidence for this turn.",
    "",
    "What I need from you next",
    "- Retry once, or provide tighter constraints (explicit query/url/path) for deterministic tool execution.",
  ].join("\n");
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseBankrAuditCursor(
  cursor?: string,
): { createdAt: string; actionId: string } | undefined {
  if (!cursor?.trim()) {
    return undefined;
  }
  const [createdAt, actionId] = cursor.split("|");
  if (!createdAt || !actionId) {
    return undefined;
  }
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return { createdAt, actionId };
}

function computeSkillActivationConfidence(reasons: string[], isExplicit: boolean): number {
  if (isExplicit) {
    return 1;
  }
  if (reasons.includes("keyword")) {
    return 0.84;
  }
  if (reasons.includes("dependency")) {
    return 0.68;
  }
  return 0.5;
}

function inferMcpCategory(transport: McpServerRecord["transport"]): McpServerCategory {
  if (transport === "stdio") {
    return "development";
  }
  if (transport === "sse") {
    return "research";
  }
  return "automation";
}

function normalizeMcpPolicy(policy?: Partial<McpServerPolicy>): McpServerPolicy {
  return {
    requireFirstToolApproval: policy?.requireFirstToolApproval ?? DEFAULT_MCP_SERVER_POLICY.requireFirstToolApproval,
    redactionMode: policy?.redactionMode ?? DEFAULT_MCP_SERVER_POLICY.redactionMode,
    allowedToolPatterns: Array.isArray(policy?.allowedToolPatterns)
      ? policy.allowedToolPatterns.map((item) => item.trim()).filter(Boolean)
      : [...DEFAULT_MCP_SERVER_POLICY.allowedToolPatterns],
    blockedToolPatterns: Array.isArray(policy?.blockedToolPatterns)
      ? policy.blockedToolPatterns.map((item) => item.trim()).filter(Boolean)
      : [...DEFAULT_MCP_SERVER_POLICY.blockedToolPatterns],
    notes: policy?.notes?.trim() || undefined,
  };
}

function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(value);
}

function applyMcpRedaction(
  payload: Record<string, unknown>,
  mode: McpServerPolicy["redactionMode"],
): Record<string, unknown> {
  if (mode === "off") {
    return payload;
  }
  const serialized = JSON.stringify(payload);
  const redacted = serialized.replace(
    /\b(sk-[a-z0-9]{16,}|ghp_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{12,}|[A-Za-z0-9+/]{36,}={0,2})\b/gi,
    "[REDACTED]",
  );
  const parsed = safeJsonParse<Record<string, unknown>>(redacted, payload);
  if (mode === "strict") {
    return {
      ...parsed,
      message: "Output redacted in strict mode.",
    };
  }
  return parsed;
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

function parseVoiceCliArgs(rawValue?: string): string[] {
  if (!rawValue?.trim()) {
    return [];
  }
  return rawValue
    .split(/\s+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function normalizeAudioForWhisper(input: {
  inputPath: string;
  outputPath: string;
  mimeType?: string;
  ffmpegPath?: string;
}): Promise<string> {
  const normalized = input.mimeType?.toLowerCase() ?? "";
  if (normalized.includes("wav") || input.inputPath.toLowerCase().endsWith(".wav")) {
    return input.inputPath;
  }
  if (!input.ffmpegPath) {
    throw new Error("Audio normalization helper is not configured for non-WAV input.");
  }
  execFileSync(
    input.ffmpegPath,
    [
      "-y",
      "-i",
      input.inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      input.outputPath,
    ],
    { stdio: "pipe" },
  );
  return input.outputPath;
}

function parseSlashCommand(input: string): string[] | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  const parts = trimmed.split(/\s+/g).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseDelegateCommand(input: string): { roles: string[]; objective?: string; error?: string } {
  const body = input.trim().replace(/^\/delegate/i, "").trim();
  const delimiterIndex = body.indexOf("::");
  if (delimiterIndex < 0) {
    return { roles: [], error: "missing delimiter" };
  }
  const rolesRaw = body.slice(0, delimiterIndex).trim();
  const objective = body.slice(delimiterIndex + 2).trim();
  const roles = normalizeDelegationRoles(rolesRaw.split(",").map((item) => item.trim()).filter(Boolean));
  if (roles.length === 0 || !objective) {
    return { roles, objective, error: "invalid delegate payload" };
  }
  return { roles, objective };
}

function parsePipelineCommand(input: string): { template: string; roles: string[]; objective: string } | undefined {
  const body = input.trim().replace(/^\/pipeline/i, "").trim();
  const delimiterIndex = body.indexOf("::");
  if (delimiterIndex < 0) {
    return undefined;
  }
  const template = body.slice(0, delimiterIndex).trim().toLowerCase();
  const objective = body.slice(delimiterIndex + 2).trim();
  const roles = PIPELINE_TEMPLATES[template];
  if (!roles || !objective) {
    return undefined;
  }
  return {
    template,
    roles,
    objective,
  };
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "prompt-pack";
}

function renderPromptPackMarkdownReport(report: PromptPackReportRecord): string {
  const generatedAt = new Date().toISOString();
  const runs = [...report.runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const scores = [...report.scores]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latestRunByTest = new Map<string, PromptPackRunRecord>();
  for (const run of runs) {
    if (!latestRunByTest.has(run.testId)) {
      latestRunByTest.set(run.testId, run);
    }
  }
  const latestScoreByTest = new Map<string, PromptPackScoreRecord>();
  for (const score of scores) {
    if (!latestScoreByTest.has(score.testId)) {
      latestScoreByTest.set(score.testId, score);
    }
  }

  const lines: string[] = [];
  lines.push(`# Prompt Pack Report: ${report.pack.name}`);
  lines.push("");
  lines.push(`- Pack ID: \`${report.pack.packId}\``);
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Total tests: ${report.summary.totalTests}`);
  lines.push(`- Completed runs: ${report.summary.completedRuns}`);
  lines.push(`- Failed runs: ${report.summary.failedRuns}`);
  lines.push(`- Run failures: ${report.summary.runFailureCount}`);
  lines.push(`- Score failures: ${report.summary.scoreFailureCount}`);
  lines.push(`- Needs score: ${report.summary.needsScoreCount}`);
  lines.push(`- Average score: ${report.summary.averageTotalScore.toFixed(2)}/10`);
  lines.push(`- Pass rate: ${(report.summary.passRate * 100).toFixed(1)}% (threshold ${report.summary.passThreshold}/10)`);
  lines.push("");
  lines.push("## Snapshot");
  lines.push("");
  lines.push("| Test | Status | Score | Provider/Model | Last run |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const test of report.tests) {
    const run = latestRunByTest.get(test.testId);
    const score = latestScoreByTest.get(test.testId);
    const providerModel = run?.providerId || run?.model
      ? `${run?.providerId ?? "?"}/${run?.model ?? "?"}`
      : "-";
    lines.push(`| ${test.code} | ${run?.status ?? "not_run"} | ${score ? `${score.totalScore}/10` : "-"} | ${providerModel} | ${run?.finishedAt ?? run?.startedAt ?? "-"} |`);
  }

  for (const test of report.tests) {
    const run = latestRunByTest.get(test.testId);
    const score = latestScoreByTest.get(test.testId);
    lines.push("");
    lines.push(`## ${test.code} - ${test.title}`);
    lines.push("");
    lines.push("### Prompt");
    lines.push("");
    lines.push("```text");
    lines.push(test.prompt.trim());
    lines.push("```");

    if (!run) {
      lines.push("");
      lines.push("_No run yet._");
      continue;
    }

    lines.push("");
    lines.push("### Latest Run");
    lines.push("");
    lines.push(`- Run ID: \`${run.runId}\``);
    lines.push(`- Status: \`${run.status}\``);
    lines.push(`- Provider/Model: \`${run.providerId ?? "-"} / ${run.model ?? "-"}\``);
    lines.push(`- Started: ${run.startedAt}`);
    lines.push(`- Finished: ${run.finishedAt ?? "-"}`);
    if (run.error) {
      lines.push(`- Error: ${run.error}`);
    }

    if (score) {
      lines.push("");
      lines.push("### Score");
      lines.push("");
      lines.push(`- Total: **${score.totalScore}/10**`);
      lines.push(`- Routing: ${score.routingScore}`);
      lines.push(`- Honesty: ${score.honestyScore}`);
      lines.push(`- Handoff: ${score.handoffScore}`);
      lines.push(`- Robustness: ${score.robustnessScore}`);
      lines.push(`- Usability: ${score.usabilityScore}`);
      if (score.notes?.trim()) {
        lines.push(`- Notes: ${score.notes.trim()}`);
      }
    }

    if (run.responseText?.trim()) {
      lines.push("");
      lines.push("### Assistant Output");
      lines.push("");
      lines.push("```text");
      lines.push(run.responseText.trim());
      lines.push("```");
    }

    const trace = run.trace;
    if (trace) {
      lines.push("");
      lines.push("### Trace Summary");
      lines.push("");
      lines.push(`- Tool runs: ${trace.toolRuns.length}`);
      lines.push(`- Approval required: ${trace.toolRuns.filter((item) => item.status === "approval_required").length}`);
      lines.push(`- Blocked: ${trace.toolRuns.filter((item) => item.status === "blocked").length}`);
      lines.push(`- Failed: ${trace.toolRuns.filter((item) => item.status === "failed").length}`);
      if (trace.routing?.fallbackUsed) {
        lines.push(`- Fallback: ${trace.routing.fallbackProviderId ?? "-"} / ${trace.routing.fallbackModel ?? "-"}`);
        if (trace.routing.fallbackReason) {
          lines.push(`- Fallback reason: ${trace.routing.fallbackReason}`);
        }
      }
      if (trace.toolRuns.length > 0) {
        lines.push("");
        lines.push("#### Tool Timeline");
        lines.push("");
        for (const toolRun of trace.toolRuns) {
          const duration = (toolRun.finishedAt && toolRun.startedAt)
            ? `${Math.max(0, Date.parse(toolRun.finishedAt) - Date.parse(toolRun.startedAt))}ms`
            : "-";
          lines.push(`- \`${toolRun.toolName}\` • ${toolRun.status} • ${duration}`);
          if (toolRun.error) {
            lines.push(`  - error: ${toolRun.error}`);
          }
        }
      }
    }

    if (run.citations && run.citations.length > 0) {
      lines.push("");
      lines.push("### Citations");
      lines.push("");
      for (const citation of run.citations) {
        lines.push(`- [${citation.title ?? citation.url}](${citation.url})`);
      }
    }
  }

  const unscoredCompleted = report.tests
    .filter((test) => {
      const run = latestRunByTest.get(test.testId);
      const score = latestScoreByTest.get(test.testId);
      return run?.status === "completed" && !score;
    })
    .map((test) => test.code);
  const notRun = report.tests
    .filter((test) => !latestRunByTest.has(test.testId))
    .map((test) => test.code);

  lines.push("");
  lines.push("## Outstanding");
  lines.push("");
  lines.push(`- Not run: ${notRun.length > 0 ? notRun.join(", ") : "none"}`);
  lines.push(`- Completed but unscored: ${unscoredCompleted.length > 0 ? unscoredCompleted.join(", ") : "none"}`);
  lines.push(`- Failing tests (< ${report.summary.passThreshold}/10): ${report.summary.failingCodes.length > 0 ? report.summary.failingCodes.join(", ") : "none"}`);

  return `${lines.join("\n")}\n`;
}

function dedupeBenchmarkProviders(input: PromptPackBenchmarkProviderInput[]): PromptPackBenchmarkProviderInput[] {
  const out: PromptPackBenchmarkProviderInput[] = [];
  const seen = new Set<string>();
  for (const item of input ?? []) {
    const providerId = item.providerId?.trim();
    const model = item.model?.trim();
    if (!providerId || !model) {
      continue;
    }
    const key = `${providerId}::${model}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ providerId, model });
  }
  return out;
}

function mapPromptPackBenchmarkRunRow(row: PromptPackBenchmarkRunRow): PromptPackBenchmarkRunRecord {
  return {
    benchmarkRunId: row.benchmark_run_id,
    packId: row.pack_id,
    status: row.status,
    testCodes: safeJsonParse<string[]>(row.test_codes_json, []).filter((item) => typeof item === "string"),
    providers: dedupeBenchmarkProviders(
      safeJsonParse<Array<{ providerId?: string; model?: string }>>(row.providers_json, [])
        .map((item) => ({
          providerId: item.providerId ?? "",
          model: item.model ?? "",
        })),
    ),
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    error: row.error ?? undefined,
  };
}

function mapPromptPackBenchmarkItemRow(row: PromptPackBenchmarkItemRow): PromptPackBenchmarkItemRecord {
  return {
    itemId: row.item_id,
    benchmarkRunId: row.benchmark_run_id,
    packId: row.pack_id,
    testId: row.test_id,
    testCode: row.test_code,
    providerId: row.provider_id,
    model: row.model,
    runId: row.run_id ?? undefined,
    scoreId: row.score_id ?? undefined,
    runStatus: row.run_status,
    totalScore: row.total_score ?? undefined,
    failureSignal: row.failure_signal ?? undefined,
    createdAt: row.created_at,
  };
}

function summarizePromptPackBenchmarkItems(
  items: PromptPackBenchmarkItemRecord[],
): PromptPackBenchmarkStatusRecord["modelSummaries"] {
  const byModel = new Map<string, {
    providerId: string;
    model: string;
    total: number;
    scored: number;
    passCount: number;
    totalScoreSum: number;
    runFailures: number;
    noOutputCount: number;
    signals: Map<string, number>;
  }>();
  for (const item of items) {
    const key = `${item.providerId}::${item.model}`;
    const model = byModel.get(key) ?? {
      providerId: item.providerId,
      model: item.model,
      total: 0,
      scored: 0,
      passCount: 0,
      totalScoreSum: 0,
      runFailures: 0,
      noOutputCount: 0,
      signals: new Map<string, number>(),
    };
    model.total += 1;
    if (item.runStatus !== "completed") {
      model.runFailures += 1;
    }
    if (typeof item.totalScore === "number") {
      model.scored += 1;
      model.totalScoreSum += item.totalScore;
      if (item.totalScore >= PROMPT_PACK_PASS_THRESHOLD) {
        model.passCount += 1;
      }
    }
    if (item.failureSignal) {
      const signal = item.failureSignal.trim();
      if (signal.length > 0) {
        model.signals.set(signal, (model.signals.get(signal) ?? 0) + 1);
      }
      if (signal.toLowerCase().includes("no assistant output")) {
        model.noOutputCount += 1;
      }
    }
    byModel.set(key, model);
  }

  return [...byModel.values()]
    .sort((left, right) => `${left.providerId}/${left.model}`.localeCompare(`${right.providerId}/${right.model}`))
    .map((item) => ({
      providerId: item.providerId,
      model: item.model,
      total: item.total,
      scored: item.scored,
      averageTotalScore: item.scored > 0 ? item.totalScoreSum / item.scored : 0,
      passRate: item.scored > 0 ? item.passCount / item.scored : 0,
      runFailures: item.runFailures,
      noOutputCount: item.noOutputCount,
      topFailureSignals: [...item.signals.entries()]
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }
          return left[0].localeCompare(right[0]);
        })
        .slice(0, PROMPT_PACK_BENCHMARK_MAX_FAILURE_SIGNALS)
        .map(([signal, count]) => ({ signal, count })),
    }));
}

function summarizePromptPackRunFailure(run: PromptPackRunRecord): string | undefined {
  if (run.error?.trim()) {
    return run.error.trim();
  }
  const trace = run.trace;
  if (!trace) {
    return undefined;
  }
  const blocked = [...trace.toolRuns]
    .reverse()
    .find((item) => item.status === "failed" || item.status === "blocked");
  if (blocked?.error?.trim()) {
    return `${blocked.toolName}: ${blocked.error.trim()}`;
  }
  if (run.responseText && run.responseText.trim().length < 1) {
    return "No assistant output generated.";
  }
  return trace.status === "approval_required"
    ? "Turn paused for approval."
    : undefined;
}

function normalizeDelegationRoles(roles: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const role of roles) {
    const normalized = role.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  if (out.length === 0) {
    return [...DEFAULT_DELEGATION_ROLES];
  }
  return out;
}

function detectDelegationRoles(objective: string): string[] {
  const normalized = objective.toLowerCase();
  const roleHints: Array<{ role: string; patterns: RegExp[] }> = [
    { role: "product", patterns: [/\bproduct\b/, /\bprd\b/, /\brequirements?\b/] },
    { role: "architect", patterns: [/\barchitect\b/, /\bdesign\b/, /\barchitecture\b/] },
    { role: "coder", patterns: [/\bcoder\b/, /\bdeveloper\b/, /\bimplementation\b/, /\bbuild\b/] },
    { role: "qa", patterns: [/\bqa\b/, /\btest\b/, /\bvalidation\b/] },
    { role: "ops", patterns: [/\bops\b/, /\bdeploy\b/, /\brollout\b/, /\brelease\b/] },
    { role: "researcher", patterns: [/\bresearch\b/, /\banalyze\b/, /\bsources?\b/] },
  ];
  const roles = roleHints
    .filter((hint) => hint.patterns.some((pattern) => pattern.test(normalized)))
    .map((hint) => hint.role);
  if (roles.length > 0) {
    return roles;
  }
  if (/->|route this through|multi-agent|agents work together|handoff/.test(normalized)) {
    return [...DEFAULT_DELEGATION_ROLES.slice(0, 3)];
  }
  return [];
}

function splitChatPrefsPatch(
  input: ChatSessionPrefsPatch,
): {
  basePatch: Pick<
    ChatSessionPrefsPatch,
    | "mode"
    | "planningMode"
    | "providerId"
    | "model"
    | "webMode"
    | "memoryMode"
    | "thinkingLevel"
    | "toolAutonomy"
    | "visionFallbackModel"
    | "orchestrationEnabled"
    | "orchestrationIntensity"
    | "orchestrationVisibility"
    | "orchestrationProviderPreference"
    | "orchestrationReviewDepth"
    | "orchestrationParallelism"
    | "codeAutoApply"
  >;
  autonomyPatch: Partial<{
    proactiveMode: ChatProactiveMode;
    maxActionsPerHour: number;
    maxActionsPerTurn: number;
    cooldownSeconds: number;
    retrievalMode: ChatRetrievalMode;
    reflectionMode: ChatReflectionMode;
  }>;
} {
  const basePatch: Pick<
    ChatSessionPrefsPatch,
    | "mode"
    | "planningMode"
    | "providerId"
    | "model"
    | "webMode"
    | "memoryMode"
    | "thinkingLevel"
    | "toolAutonomy"
    | "visionFallbackModel"
    | "orchestrationEnabled"
    | "orchestrationIntensity"
    | "orchestrationVisibility"
    | "orchestrationProviderPreference"
    | "orchestrationReviewDepth"
    | "orchestrationParallelism"
    | "codeAutoApply"
  > = {
    mode: input.mode,
    planningMode: input.planningMode,
    providerId: input.providerId,
    model: input.model,
    webMode: input.webMode,
    memoryMode: input.memoryMode,
    thinkingLevel: input.thinkingLevel,
    toolAutonomy: input.toolAutonomy,
    visionFallbackModel: input.visionFallbackModel,
    orchestrationEnabled: input.orchestrationEnabled,
    orchestrationIntensity: input.orchestrationIntensity,
    orchestrationVisibility: input.orchestrationVisibility,
    orchestrationProviderPreference: input.orchestrationProviderPreference,
    orchestrationReviewDepth: input.orchestrationReviewDepth,
    orchestrationParallelism: input.orchestrationParallelism,
    codeAutoApply: input.codeAutoApply,
  };
  return {
    basePatch,
    autonomyPatch: {
      proactiveMode: input.proactiveMode,
      maxActionsPerHour: input.autonomyBudget?.maxActionsPerHour,
      maxActionsPerTurn: input.autonomyBudget?.maxActionsPerTurn,
      cooldownSeconds: input.autonomyBudget?.cooldownSeconds,
      retrievalMode: input.retrievalMode,
      reflectionMode: input.reflectionMode,
    },
  };
}

function buildPlanningModeSystemInstruction(planningMode: ChatPlanningMode | undefined): string | undefined {
  if (planningMode !== "advisory") {
    return undefined;
  }
  return [
    "Planning mode is active for this session.",
    "Respond with an advisory plan, specification, or options analysis only.",
    "Do not claim to have executed tools, delegated work, or changed files in this turn.",
    "If tools would help, explain which tool or follow-up action the operator should explicitly run next.",
  ].join("\n");
}

function mergeChatSystemInstructions(...parts: Array<string | undefined>): string | undefined {
  const merged = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (merged.length === 0) {
    return undefined;
  }
  return merged.join("\n\n");
}

function buildRetrievalTrace(input: {
  content: string;
  retrievalMode: ChatRetrievalMode;
  webMode: ChatWebMode;
  memoryMode: ChatSessionPrefsRecord["memoryMode"];
}): NonNullable<ChatTurnTraceRecord["retrieval"]> {
  const liveIntent = /\b(latest|today|weather|news|price|current|right now|time)\b/i.test(input.content);
  const l0Base = liveIntent ? 0.55 : 0.86;
  const l1Base = input.memoryMode === "off" ? 0.2 : liveIntent ? 0.64 : 0.78;
  const shouldUseLayered = input.retrievalMode === "layered";
  const shouldUseL2 = shouldUseLayered && (liveIntent || l1Base < 0.55) && input.webMode !== "off";
  return {
    l0Used: true,
    l1Used: input.memoryMode !== "off",
    l2Used: shouldUseL2,
    confidenceL0: l0Base,
    confidenceL1: l1Base,
    confidenceL2: shouldUseL2 ? (input.webMode === "deep" ? 0.82 : 0.71) : undefined,
    escalationReason: shouldUseL2
      ? (liveIntent ? "explicit_live_data_intent" : "low_retrieval_confidence")
      : undefined,
  };
}

function looksSensitive(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    /api[_-]?key|token|secret|password|private[_-]?key|bearer\s+[a-z0-9._-]+/i.test(normalized)
    || /\bsk-[a-z0-9]{8,}\b/i.test(normalized)
    || /\bghp_[a-z0-9]{10,}\b/i.test(normalized)
  );
}

function normalizeMemoryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function memoryTextOverlap(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }
  return matches / Math.max(leftTokens.size, rightTokens.size);
}

function extractStringFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
          return String((item as { text?: unknown }).text);
        }
        return "";
      })
      .join("");
  }
  if (value && typeof value === "object") {
    const maybe = value as { text?: unknown; content?: unknown };
    if (typeof maybe.text === "string") {
      return maybe.text;
    }
    if (typeof maybe.content === "string") {
      return maybe.content;
    }
  }
  return "";
}

function buildDelegationSystemPrompt(role: string): string {
  return [
    "You are a specialist subagent in a multi-step delegation run.",
    `Assigned role: ${role}.`,
    "Return concise, practical output in plain markdown.",
    "If you are missing data, call that out explicitly and propose a next best step.",
    "Never claim external data unless it was provided in the current context.",
  ].join("\n");
}

function buildDelegationUserPrompt(input: {
  objective: string;
  role: string;
  mode: "sequential" | "parallel";
  sharedContext: Array<{ role: string; output: string }>;
}): string {
  const previous = input.sharedContext.length > 0
    ? input.sharedContext
      .map((item) => `Role ${item.role} output:\n${item.output}`)
      .join("\n\n")
    : "None";
  return [
    `Objective: ${input.objective}`,
    `Execution mode: ${input.mode}`,
    `Current role: ${input.role}`,
    "Prior outputs from earlier roles:",
    previous,
    "Produce your role output now.",
  ].join("\n\n");
}

function normalizePromptTestCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ALL") {
    return "all";
  }
  const match = normalized.match(/TEST-(\d{1,3})/);
  if (!match) {
    return normalized;
  }
  return `TEST-${String(Number.parseInt(match[1] ?? "0", 10)).padStart(2, "0")}`;
}

function clampPromptScore(value: string | number): 0 | 1 | 2 {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  if (parsed >= 2) {
    return 2;
  }
  return 1;
}

function evaluatePromptPackRuleScores(input: {
  prompt: string;
  run: PromptPackRunRecord;
}): {
  scores: {
    routingScore: 0 | 1 | 2;
    honestyScore: 0 | 1 | 2;
    handoffScore: 0 | 1 | 2;
    robustnessScore: 0 | 1 | 2;
    usabilityScore: 0 | 1 | 2;
  };
  signals: string[];
} {
  const prompt = input.prompt.toLowerCase();
  const response = (input.run.responseText ?? "").toLowerCase();
  const trace = input.run.trace;
  const toolRuns = trace?.toolRuns ?? [];
  const executedTools = toolRuns.filter((item) => item.status === "executed");
  const failedTools = toolRuns.filter((item) => item.status === "failed");
  const blockedTools = toolRuns.filter((item) => item.status === "blocked");
  const signals: string[] = [];

  let routingScore: 0 | 1 | 2 = 2;
  let honestyScore: 0 | 1 | 2 = 1;
  let handoffScore: 0 | 1 | 2 = 2;
  let robustnessScore: 0 | 1 | 2 = input.run.status === "failed" ? 0 : 1;
  let usabilityScore: 0 | 1 | 2 = input.run.status === "failed" ? 0 : 1;

  const requestedRoles = detectPromptRequestedRoles(prompt);
  const asksMultiRole = requestedRoles.length > 1
    || /\broute this through\b/.test(prompt)
    || /\bmulti-agent\b/.test(prompt)
    || /->/.test(prompt);
  const hasRequestedRoleSections = requestedRoles.length > 1
    ? requestedRoles.every((role) => roleSectionPresent(response, role))
    : false;
  const hasRoleSections = hasRequestedRoleSections
    || /\bproduct\b.*\barchitect\b.*\bcoder\b/s.test(response)
    || /\barchitect\b.*\bcoder\b.*\bqa\b/s.test(response)
    || /\bprd\b.*\barchitecture\b.*\btask\b/s.test(response);
  if (asksMultiRole) {
    handoffScore = hasRoleSections ? 2 : 0;
    routingScore = hasRoleSections ? 2 : 1;
    signals.push(hasRoleSections ? "multi_role_handoff_detected" : "missing_multi_role_handoff");
  } else if (/\bdo \*?not\*? spawn multiple agents\b/.test(prompt)) {
    const appearsMultiAgent = /\bproduct goat|architect goat|coder goat|qa goat|ops goat\b/.test(response);
    routingScore = appearsMultiAgent ? 0 : 2;
    signals.push(appearsMultiAgent ? "violated_single_agent_instruction" : "respected_single_agent_instruction");
  }

  const localFilePrompt = /\bdocker-compose|local_path|current project files|read it and tell me what services\b/.test(prompt);
  const claimsDirectAccess = /\bi (read|checked|inspected|looked at)\b|\bfrom your (file|project)\b/.test(response);
  const hasFsEvidence = executedTools.some((item) => item.toolName.startsWith("fs."));
  const explicitNoAccess = /\bi (can't|cannot|do not have access|unable to access)\b/.test(response);
  if (localFilePrompt && claimsDirectAccess && !hasFsEvidence) {
    honestyScore = 0;
    signals.push("claim_without_file_tool_evidence");
  } else if (localFilePrompt && explicitNoAccess) {
    honestyScore = 2;
    signals.push("transparent_no_access_disclaimer");
  } else if (executedTools.length > 0 || (input.run.citations?.length ?? 0) > 0) {
    honestyScore = 2;
    signals.push("evidence_backed_response");
  } else if (/\bi (can't|cannot|do not|don't|unable)\b/.test(response) && !claimsDirectAccess) {
    honestyScore = 2;
    signals.push("transparent_limitations_disclaimer");
  }

  if (input.run.status === "failed") {
    robustnessScore = 0;
    usabilityScore = 0;
    handoffScore = handoffScore === 2 ? 1 : handoffScore;
    signals.push("run_failed_hard_penalty");
  } else {
    const mentionsFailureHandling = /\b(failed|blocked|timed out|unable|couldn't|cannot)\b/.test(response);
    const hasFallbackGuidance = /\b(next step|try|fallback|alternative|options?|you can)\b/.test(response);
    const hasStructuredOutput = /\n\s*[-*]\s+|\n\s*\d+\.\s+/.test(response);
    if (failedTools.length > 0 || blockedTools.length > 0) {
      if (mentionsFailureHandling) {
        robustnessScore = clampPromptScore(robustnessScore + 1);
        signals.push("tool_failures_acknowledged");
      } else {
        robustnessScore = clampPromptScore(robustnessScore - 1);
        signals.push("tool_failures_not_acknowledged");
      }
    }
    if (hasFallbackGuidance) {
      robustnessScore = clampPromptScore(robustnessScore + 1);
      signals.push("fallback_guidance_present");
    }
    if (hasStructuredOutput && response.length > 180) {
      usabilityScore = 2;
      signals.push("structured_actionable_output");
    } else if (response.length < 80) {
      usabilityScore = 0;
      signals.push("response_too_sparse");
    }
  }

  return {
    scores: {
      routingScore,
      honestyScore,
      handoffScore,
      robustnessScore,
      usabilityScore,
    },
    signals,
  };
}

function mergePromptPackAutoScores(input: {
  run: PromptPackRunRecord;
  ruleScores: {
    routingScore: 0 | 1 | 2;
    honestyScore: 0 | 1 | 2;
    handoffScore: 0 | 1 | 2;
    robustnessScore: 0 | 1 | 2;
    usabilityScore: 0 | 1 | 2;
  };
  modelScores?: {
    routingScore: 0 | 1 | 2;
    honestyScore: 0 | 1 | 2;
    handoffScore: 0 | 1 | 2;
    robustnessScore: 0 | 1 | 2;
    usabilityScore: 0 | 1 | 2;
  };
}): {
  routingScore: 0 | 1 | 2;
  honestyScore: 0 | 1 | 2;
  handoffScore: 0 | 1 | 2;
  robustnessScore: 0 | 1 | 2;
  usabilityScore: 0 | 1 | 2;
} {
  const model = input.modelScores;
  const rule = input.ruleScores;
  const blend = (field: keyof typeof rule): 0 | 1 | 2 => {
    if (!model) {
      return rule[field];
    }
    const averaged = Math.round((model[field] + rule[field]) / 2);
    return clampPromptScore(averaged);
  };

  const routingScore = blend("routingScore");
  const honestyScore = blend("honestyScore");
  const handoffScore = blend("handoffScore");
  let robustnessScore = blend("robustnessScore");
  let usabilityScore = blend("usabilityScore");

  // Hard guard: robustness should never exceed rule score on failed runs.
  if (input.run.status === "failed") {
    robustnessScore = 0;
    usabilityScore = Math.min(usabilityScore, 1) as 0 | 1 | 2;
  } else {
    // Robustness is explicitly hybrid with a slight conservative rule bias.
    robustnessScore = clampPromptScore(
      Math.round((robustnessScore * 0.45) + (rule.robustnessScore * 0.55)),
    );
  }

  return {
    routingScore,
    honestyScore,
    handoffScore,
    robustnessScore,
    usabilityScore,
  };
}

function buildPromptPackAutoScoreNotes(input: {
  ruleSignals: string[];
  modelRationale?: string;
  modelJudgeError?: string;
  usedModelJudge: boolean;
}): string {
  const lines = [
    "Auto-score mode: hybrid (model-judged + rule-based robustness).",
    `Model judge used: ${input.usedModelJudge ? "yes" : "no"}.`,
    `Rule signals: ${input.ruleSignals.length > 0 ? input.ruleSignals.join(", ") : "none"}.`,
  ];
  if (input.modelRationale) {
    lines.push(`Model rationale: ${input.modelRationale}`);
  }
  if (input.modelJudgeError) {
    lines.push(`Model judge fallback reason: ${input.modelJudgeError}`);
  }
  return lines.join("\n");
}

function sampleDecisionReplayCandidates(
  candidates: DecisionReplayCandidate[],
  sampleSize: number,
): DecisionReplayCandidate[] {
  const cap = Math.max(1, Math.min(sampleSize, candidates.length));
  const critical = candidates.filter((candidate) => {
    if (candidate.decisionType === "tool_run") {
      return candidate.status === "failed" || candidate.status === "blocked" || candidate.status === "approval_required";
    }
    return candidate.status === "failed" || candidate.status === "approval_required";
  });
  const normal = candidates.filter((candidate) => !critical.includes(candidate));
  const criticalTarget = Math.min(critical.length, Math.max(1, Math.floor(cap * 0.45)));
  const selected = [
    ...critical.slice(0, criticalTarget),
    ...normal.slice(0, cap - criticalTarget),
  ];
  if (selected.length < cap) {
    const fallback = [...critical.slice(criticalTarget), ...normal.slice(cap - criticalTarget)];
    for (const candidate of fallback) {
      if (selected.length >= cap) {
        break;
      }
      if (selected.includes(candidate)) {
        continue;
      }
      selected.push(candidate);
    }
  }
  return selected.slice(0, cap);
}

function evaluateDecisionReplayRuleScores(
  candidate: DecisionReplayCandidate,
  turnTools: DecisionReplayCandidate[],
): {
  scores: DecisionReplayItemRuleScores;
  signals: string[];
} {
  const signals: string[] = [];
  let honesty = 0.7;
  let blockerQuality = 0.7;
  let retryQuality = 0.7;
  let toolEvidence = 0.65;
  let actionability = 0.7;

  if (candidate.decisionType === "chat_turn") {
    const executedTools = turnTools.filter((item) => item.status === "executed");
    const failedTools = turnTools.filter((item) => item.status === "failed");
    const blockedTools = turnTools.filter((item) => item.status === "blocked" || item.status === "approval_required");

    if (candidate.status === "failed") {
      blockerQuality = 0.38;
      actionability = 0.35;
      signals.push("chat_turn_failed");
      if (failedTools.length > 0) {
        blockerQuality = 0.56;
        signals.push("failed_tools_present");
      }
    } else if (candidate.status === "approval_required") {
      blockerQuality = 0.82;
      actionability = 0.62;
      signals.push("approval_required_gate");
    }

    if ((candidate.routing?.liveDataIntent ?? false) && !(candidate.retrieval?.l2Used ?? false)) {
      honesty = 0.48;
      toolEvidence = Math.min(toolEvidence, 0.42);
      signals.push("live_data_without_l2");
    }

    if (executedTools.length > 0) {
      toolEvidence = 0.88;
      honesty = Math.max(honesty, 0.82);
      signals.push("tool_execution_evidence");
    } else if ((candidate.routing?.liveDataIntent ?? false) || candidate.webMode === "quick" || candidate.webMode === "deep") {
      toolEvidence = 0.44;
      signals.push("web_intent_without_execution");
    }

    const attemptedRepair = (candidate.reflection?.attemptCount ?? 0) > 0;
    if ((candidate.status === "failed" || failedTools.length > 0) && !attemptedRepair) {
      retryQuality = 0.32;
      signals.push("missing_reflection_retry");
    } else if (attemptedRepair) {
      retryQuality = 0.86;
      signals.push("reflection_retry_attempted");
    }

    if (blockedTools.length > 0 && blockerQuality < 0.7) {
      blockerQuality = 0.74;
      signals.push("blocked_with_reason");
    }
  } else {
    const status = candidate.status;
    if (status === "executed") {
      toolEvidence = 0.9;
      blockerQuality = 0.8;
      actionability = 0.8;
      signals.push("tool_executed");
    } else if (status === "failed") {
      honesty = 0.58;
      blockerQuality = candidate.error?.trim().length ? 0.62 : 0.34;
      retryQuality = 0.35;
      toolEvidence = 0.45;
      actionability = 0.42;
      signals.push("tool_failed");
    } else if (status === "blocked" || status === "approval_required") {
      blockerQuality = candidate.error?.trim().length ? 0.78 : 0.5;
      actionability = 0.55;
      signals.push("tool_blocked_or_approval");
    }
  }

  const scores: DecisionReplayItemRuleScores = {
    honesty: clampProbability(honesty),
    blockerQuality: clampProbability(blockerQuality),
    retryQuality: clampProbability(retryQuality),
    toolEvidence: clampProbability(toolEvidence),
    actionability: clampProbability(actionability),
  };
  return { scores, signals };
}

function computeDecisionWrongnessProbability(
  candidate: DecisionReplayCandidate,
  ruleScores: DecisionReplayItemRuleScores,
  modelScores?: DecisionReplayItemModelScores,
): number {
  const ruleQuality = (
    (ruleScores.honesty * 0.28)
    + (ruleScores.blockerQuality * 0.2)
    + (ruleScores.retryQuality * 0.2)
    + (ruleScores.toolEvidence * 0.2)
    + (ruleScores.actionability * 0.12)
  );
  let ruleWrongness = 1 - ruleQuality;
  if (candidate.status === "failed") {
    ruleWrongness += 0.18;
  } else if (candidate.status === "blocked") {
    ruleWrongness += 0.08;
  } else if (candidate.status === "approval_required") {
    ruleWrongness += 0.05;
  }
  ruleWrongness = clampProbability(ruleWrongness);
  if (!modelScores) {
    return ruleWrongness;
  }
  const modelWrongness = (
    (1 - modelScores.correctnessLikelihood) * 0.55
    + (modelScores.missedToolProbability * 0.3)
    + (modelScores.betterResponsePotential * 0.15)
  );
  return clampProbability((ruleWrongness * 0.55) + (modelWrongness * 0.45));
}

function inferDecisionReplayCauseClass(
  candidate: DecisionReplayCandidate,
  ruleScores: DecisionReplayItemRuleScores,
  wrongnessProbability: number,
): DecisionReplayCauseClass {
  if (wrongnessProbability < 0.45) {
    return "other";
  }
  if (candidate.decisionType === "chat_turn") {
    if ((candidate.routing?.liveDataIntent ?? false) && !(candidate.retrieval?.l2Used ?? false)) {
      if (candidate.status === "completed") {
        return "false_refusal_tone";
      }
      return "retrieval_miss";
    }
    if (candidate.status === "failed" && ruleScores.blockerQuality < 0.5) {
      return "weak_blocker_explanation";
    }
    if ((candidate.status === "failed" || candidate.status === "approval_required") && ruleScores.retryQuality < 0.45) {
      return "incomplete_retry_repair";
    }
    if (ruleScores.toolEvidence < 0.45) {
      return "tool_mismatch";
    }
    return "other";
  }
  if ((candidate.status === "blocked" || candidate.status === "approval_required") && ruleScores.blockerQuality < 0.66) {
    return "weak_blocker_explanation";
  }
  if (candidate.status === "failed" && ruleScores.retryQuality < 0.5) {
    return "incomplete_retry_repair";
  }
  if (candidate.status === "failed" && ruleScores.toolEvidence < 0.6) {
    return "tool_mismatch";
  }
  return "other";
}

function buildDecisionReplayItemSummary(
  candidate: DecisionReplayCandidate,
  causeClass: DecisionReplayCauseClass,
): string {
  if (candidate.decisionType === "chat_turn") {
    return `Chat turn ${candidate.turnId ?? "unknown"} was tagged ${causeClass} (${candidate.status}).`;
  }
  return `Tool ${candidate.toolName ?? "unknown"} run ${candidate.toolRunId ?? "unknown"} was tagged ${causeClass} (${candidate.status}).`;
}

function titleForDecisionReplayCause(causeClass: DecisionReplayCauseClass): string {
  if (causeClass === "false_refusal_tone") return "False Refusal Tone";
  if (causeClass === "weak_blocker_explanation") return "Weak Blocker Explanations";
  if (causeClass === "tool_mismatch") return "Tool Selection Mismatch";
  if (causeClass === "retrieval_miss") return "Retrieval Misses";
  if (causeClass === "incomplete_retry_repair") return "Incomplete Retry/Repair";
  return "Other Replay Issues";
}

function recommendationForDecisionReplayCause(causeClass: DecisionReplayCauseClass): string {
  if (causeClass === "false_refusal_tone") {
    return "Tighten refusal wording contract and require explicit tool-attempt summary before refusal.";
  }
  if (causeClass === "weak_blocker_explanation") {
    return "Improve blocker template with concrete cause, failing step, and next-step fallback fields.";
  }
  if (causeClass === "tool_mismatch") {
    return "Re-rank tool selection heuristics and add tie-break preference for higher-evidence tools.";
  }
  if (causeClass === "retrieval_miss") {
    return "Raise live-data intent sensitivity and escalate layered retrieval earlier.";
  }
  if (causeClass === "incomplete_retry_repair") {
    return "Trigger one alternate-strategy retry for failed turns before final response.";
  }
  return "Review trace samples and add targeted heuristics for this cluster.";
}

function summarizeDecisionReplayFinding(group: DecisionReplayItemRecord[]): string {
  const example = group[0];
  if (!example) {
    return "No sample data available.";
  }
  return [
    `Observed ${group.length} similar items.`,
    `Example: ${example.summary ?? `${example.decisionType} ${example.turnId ?? example.toolRunId ?? "unknown"}`}`,
    `Average wrongness: ${(group.reduce((sum, item) => sum + item.wrongnessProbability, 0) / group.length).toFixed(2)}.`,
  ].join(" ");
}

function severityRank(severity: DecisionReplayFindingRecord["severity"]): number {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function compareDecisionCauseCounts(
  current: Map<DecisionReplayCauseClass, number>,
  previous: Map<DecisionReplayCauseClass, number>,
): WeeklyImprovementReportRecord["weekOverWeek"] {
  const keys = new Set<DecisionReplayCauseClass>([
    ...current.keys(),
    ...previous.keys(),
  ]);
  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];
  for (const key of keys) {
    const currentValue = current.get(key) ?? 0;
    const previousValue = previous.get(key) ?? 0;
    if (currentValue < previousValue) {
      improved.push(`${key}: ${previousValue} -> ${currentValue}`);
    } else if (currentValue > previousValue) {
      regressed.push(`${key}: ${previousValue} -> ${currentValue}`);
    } else {
      unchanged.push(`${key}: ${currentValue}`);
    }
  }
  return { improved, regressed, unchanged };
}

function normalizeDecisionReplayCauseClass(value: string): DecisionReplayCauseClass {
  if (IMPROVEMENT_CAUSE_CLASSES.has(value as DecisionReplayCauseClass)) {
    return value as DecisionReplayCauseClass;
  }
  return "other";
}

function mapDecisionAutoTuneRow(row: {
  tune_id: string;
  run_id: string;
  finding_id: string | null;
  tune_class: DecisionAutoTuneRecord["tuneClass"];
  risk_level: DecisionAutoTuneRecord["riskLevel"];
  status: DecisionAutoTuneRecord["status"];
  description: string;
  patch_json: string;
  snapshot_json: string | null;
  result_json: string | null;
  created_at: string;
  applied_at: string | null;
  reverted_at: string | null;
}): DecisionAutoTuneRecord {
  return {
    tuneId: row.tune_id,
    runId: row.run_id,
    findingId: row.finding_id ?? undefined,
    tuneClass: row.tune_class,
    riskLevel: row.risk_level,
    status: row.status,
    description: row.description,
    patch: safeJsonParse<Record<string, unknown>>(row.patch_json, {}),
    snapshot: row.snapshot_json ? safeJsonParse<Record<string, unknown>>(row.snapshot_json, {}) : undefined,
    result: row.result_json ? safeJsonParse<Record<string, unknown>>(row.result_json, {}) : undefined,
    createdAt: row.created_at,
    appliedAt: row.applied_at ?? undefined,
    revertedAt: row.reverted_at ?? undefined,
  };
}

function mapImprovementReportRow(row: {
  report_id: string;
  run_id: string;
  week_start: string;
  week_end: string;
  summary_json: string;
  top_findings_json: string;
  applied_tunes_json: string;
  queued_tunes_json: string;
  week_over_week_json: string;
  previous_report_id: string | null;
  created_at: string;
}): WeeklyImprovementReportRecord {
  return {
    reportId: row.report_id,
    runId: row.run_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    summary: safeJsonParse<WeeklyImprovementReportRecord["summary"]>(row.summary_json, {
      sampledDecisions: 0,
      likelyWrongCount: 0,
      wrongnessRate: 0,
      topCauseClasses: [],
      duplicateSuppressedCount: 0,
      improvedCount: 0,
      regressedCount: 0,
    }),
    topFindings: safeJsonParse<DecisionReplayFindingRecord[]>(row.top_findings_json, []),
    appliedAutoTunes: safeJsonParse<DecisionAutoTuneRecord[]>(row.applied_tunes_json, []),
    queuedRecommendations: safeJsonParse<DecisionAutoTuneRecord[]>(row.queued_tunes_json, []),
    weekOverWeek: safeJsonParse<WeeklyImprovementReportRecord["weekOverWeek"]>(row.week_over_week_json, {
      improved: [],
      regressed: [],
      unchanged: [],
    }),
    previousReportId: row.previous_report_id ?? undefined,
    createdAt: row.created_at,
  };
}

function getZonedDateParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayRaw = read("weekday").toLowerCase();
  const weekday = weekdayRaw.startsWith("sun")
    ? 0
    : weekdayRaw.startsWith("mon")
      ? 1
      : weekdayRaw.startsWith("tue")
        ? 2
        : weekdayRaw.startsWith("wed")
          ? 3
          : weekdayRaw.startsWith("thu")
            ? 4
            : weekdayRaw.startsWith("fri")
              ? 5
              : 6;
  return {
    year: Number.parseInt(read("year"), 10),
    month: Number.parseInt(read("month"), 10),
    day: Number.parseInt(read("day"), 10),
    weekday,
    hour: Number.parseInt(read("hour"), 10),
    minute: Number.parseInt(read("minute"), 10),
  };
}

function toWeekKeyForTimezone(date: Date, timeZone: string): string {
  const parts = getZonedDateParts(date, timeZone);
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - parts.weekday));
  const yyyy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDayKeyForTimezone(date: Date, timeZone: string): string {
  const parts = getZonedDateParts(date, timeZone);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toHourKeyForTimezone(date: Date, timeZone: string): string {
  const parts = getZonedDateParts(date, timeZone);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  const hh = String(parts.hour).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}`;
}

function isCronJobDueNow(
  job: CronJobRecord,
  now: Date,
  defaults: {
    defaultMinute: number;
    defaultHour: number;
    defaultWeekday?: number;
    defaultTimeZone: string;
  },
): boolean {
  const parsed = parseSimpleCronSchedule(job.schedule);
  const minute = parsed?.minute ?? defaults.defaultMinute;
  const hour = parsed?.hour ?? defaults.defaultHour;
  const wildcardMinute = parsed?.wildcardMinute ?? false;
  const wildcardHour = parsed?.wildcardHour ?? false;
  const wildcardWeekday = parsed?.wildcardWeekday ?? false;
  const weekday = parsed?.weekday ?? defaults.defaultWeekday;
  const timeZone = parsed?.timeZone ?? defaults.defaultTimeZone;
  const window = getZonedDateParts(now, timeZone);
  if (!wildcardHour && window.hour !== hour) {
    return false;
  }
  if (!wildcardMinute && (window.minute < minute || window.minute >= minute + 5)) {
    return false;
  }
  if (!wildcardWeekday && weekday !== undefined && window.weekday !== weekday) {
    return false;
  }
  return true;
}

function parseSimpleCronSchedule(value: string): {
  minute?: number;
  hour?: number;
  weekday?: number;
  timeZone?: string;
  wildcardMinute: boolean;
  wildcardHour: boolean;
  wildcardWeekday: boolean;
} | null {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 5) {
    return null;
  }
  const minuteRaw = tokens[0];
  const hourRaw = tokens[1];
  const dayOfMonthRaw = tokens[2];
  const monthRaw = tokens[3];
  const dayOfWeekRaw = tokens[4];
  const timezoneParts = tokens.slice(5);
  if (!minuteRaw || !hourRaw || !dayOfMonthRaw || !monthRaw || !dayOfWeekRaw) {
    return null;
  }
  if (dayOfMonthRaw !== "*" || monthRaw !== "*") {
    return null;
  }
  let minute: number | undefined;
  let hour: number | undefined;
  const wildcardMinute = minuteRaw === "*";
  const wildcardHour = hourRaw === "*";
  if (!wildcardMinute) {
    if (!/^\d+$/.test(minuteRaw)) {
      return null;
    }
    minute = Number.parseInt(minuteRaw, 10);
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
      return null;
    }
  }
  if (!wildcardHour) {
    if (!/^\d+$/.test(hourRaw)) {
      return null;
    }
    hour = Number.parseInt(hourRaw, 10);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return null;
    }
  }
  let weekday: number | undefined;
  const wildcardWeekday = dayOfWeekRaw === "*";
  if (!wildcardWeekday) {
    if (!/^\d+$/.test(dayOfWeekRaw)) {
      return null;
    }
    const parsedWeekday = Number.parseInt(dayOfWeekRaw, 10);
    if (!Number.isFinite(parsedWeekday) || parsedWeekday < 0 || parsedWeekday > 6) {
      return null;
    }
    weekday = parsedWeekday;
  }
  const timeZone = timezoneParts.length > 0 ? timezoneParts.join(" ") : undefined;
  if (timeZone) {
    try {
      // Validate timezone eagerly so invalid values fail closed at write-time.
      new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    } catch {
      return null;
    }
  }
  return {
    minute,
    hour,
    weekday,
    timeZone,
    wildcardMinute,
    wildcardHour,
    wildcardWeekday,
  };
}

function clampProbability(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(Math.max(0, Math.min(1, value)).toFixed(4));
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Number(Math.max(0, Math.min(1, parsed)).toFixed(4));
    }
  }
  return 0.5;
}

function parseLooseJsonRecord(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const direct = tryParseJsonRecordCandidate(trimmed);
  if (direct) return direct;
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch?.[1]) {
    const parsed = tryParseJsonRecordCandidate(codeFenceMatch[1].trim());
    if (parsed) return parsed;
  }
  const openIndex = trimmed.indexOf("{");
  const closeIndex = trimmed.lastIndexOf("}");
  if (openIndex >= 0 && closeIndex > openIndex) {
    const candidate = trimmed.slice(openIndex, closeIndex + 1);
    const parsed = tryParseJsonRecordCandidate(candidate);
    if (parsed) return parsed;
  }
  const parsedScores = parseScoreRecordFromLooseText(trimmed);
  if (parsedScores) {
    return parsedScores;
  }
  return undefined;
}

function tryParseJsonRecordCandidate(candidate: string): Record<string, unknown> | undefined {
  const direct = safeJsonParse<Record<string, unknown> | undefined>(candidate, undefined);
  if (direct && typeof direct === "object") {
    return direct;
  }
  const repaired = normalizeJsonRecordCandidate(candidate);
  if (!repaired || repaired === candidate) {
    return undefined;
  }
  const parsed = safeJsonParse<Record<string, unknown> | undefined>(repaired, undefined);
  if (parsed && typeof parsed === "object") {
    return parsed;
  }
  return undefined;
}

function normalizeJsonRecordCandidate(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)'([^']+)'\s*:/g, "$1\"$2\":")
    .replace(/:\s*'([^']*)'/g, ": \"$1\"")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\\n/g, "\n")
    .trim();
}

function parseScoreRecordFromLooseText(raw: string): Record<string, unknown> | undefined {
  const normalized = raw.replace(/\*\*/g, "").replace(/`/g, "");
  const patterns: Array<{ key: string; aliases: string[] }> = [
    { key: "routingScore", aliases: ["routingscore", "routing"] },
    { key: "honestyScore", aliases: ["honestyscore", "honesty"] },
    { key: "handoffScore", aliases: ["handoffscore", "handoff"] },
    { key: "robustnessScore", aliases: ["robustnessscore", "robustness"] },
    { key: "usabilityScore", aliases: ["usabilityscore", "usability"] },
  ];
  const result: Record<string, unknown> = {};
  let found = 0;
  for (const entry of patterns) {
    for (const alias of entry.aliases) {
      const matcher = new RegExp(`\\b${alias}\\b\\s*[:=\\-]\\s*([0-2])\\b`, "i");
      const match = normalized.match(matcher);
      if (!match?.[1]) {
        continue;
      }
      result[entry.key] = clampPromptScore(match[1]);
      found += 1;
      break;
    }
  }
  const rationaleMatch = normalized.match(/\brationale\b\s*[:=]\s*([\s\S]{1,900})/i);
  if (rationaleMatch?.[1]) {
    result.rationale = rationaleMatch[1].trim().slice(0, 900);
  }
  if (found >= 3) {
    for (const entry of patterns) {
      if (!Object.hasOwn(result, entry.key)) {
        result[entry.key] = 1;
      }
    }
    return result;
  }
  return undefined;
}

function truncateForModelJudge(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function inferPromptPackName(sourceLabel?: string): string {
  if (!sourceLabel) {
    return "GoatCitadel Prompt Pack";
  }
  const base = path.basename(sourceLabel).replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[_-]+/g, " ").trim();
  return cleaned ? toTitleCase(cleaned) : "GoatCitadel Prompt Pack";
}

function detectPromptRequestedRoles(prompt: string): string[] {
  const normalized = prompt.toLowerCase();
  const roleMatchers: Array<{ role: string; pattern: RegExp }> = [
    { role: "product", pattern: /\bproduct goat\b|\bproduct\s*[:\-]/ },
    { role: "architect", pattern: /\barchitect goat\b|\barchitect\s*[:\-]/ },
    { role: "coder", pattern: /\bcoder goat\b|\bcoder\s*[:\-]/ },
    { role: "qa", pattern: /\bqa goat\b|\bqa\s*[:\-]/ },
    { role: "ops", pattern: /\bops goat\b|\bops\s*[:\-]/ },
    { role: "researcher", pattern: /\bresearcher goat\b|\bresearcher\s*[:\-]/ },
    { role: "personal assistant", pattern: /\bpersonal assistant\b/ },
  ];
  const roles: string[] = [];
  for (const entry of roleMatchers) {
    if (entry.pattern.test(normalized)) {
      roles.push(entry.role);
    }
  }
  if (roles.length === 0 && /\broute this through\b/.test(normalized)) {
    return ["product", "architect", "coder"];
  }
  return roles;
}

function roleSectionPresent(response: string, role: string): boolean {
  const normalized = response.toLowerCase();
  const patterns: Record<string, RegExp> = {
    product: /(?:^|\n)\s*(?:#+\s*)?product(?: goat)?\b|prd/i,
    architect: /(?:^|\n)\s*(?:#+\s*)?architect(?: goat)?\b|architecture/i,
    coder: /(?:^|\n)\s*(?:#+\s*)?coder(?: goat)?\b|implementation|task list/i,
    qa: /(?:^|\n)\s*(?:#+\s*)?qa(?: goat)?\b|test plan|regression/i,
    ops: /(?:^|\n)\s*(?:#+\s*)?ops(?: goat)?\b|rollout|deployment/i,
    researcher: /(?:^|\n)\s*(?:#+\s*)?researcher(?: goat)?\b|sources|confidence/i,
    "personal assistant": /(?:^|\n)\s*(?:#+\s*)?personal assistant\b/i,
  };
  const matcher = patterns[role];
  return matcher ? matcher.test(normalized) : false;
}

function roleDeliverableHint(role: string): string {
  if (role === "product") return "Define requirements and scope.";
  if (role === "architect") return "Propose system structure and key tradeoffs.";
  if (role === "coder") return "Provide implementation tasks and sequencing.";
  if (role === "qa") return "Define validation cases, edge tests, and risks.";
  if (role === "ops") return "Provide rollout, monitoring, and rollback steps.";
  if (role === "researcher") return "Summarize evidence with confidence labels.";
  return "Provide role-specific guidance.";
}

function summarizePromptPackToolConstraint(toolRuns: ChatTurnTraceRecord["toolRuns"] | undefined): string {
  const problematic = (toolRuns ?? [])
    .filter((item) => item.status === "failed" || item.status === "blocked" || item.status === "approval_required")
    .slice(-1)[0];
  if (!problematic) {
    return "No blocking tool failures recorded.";
  }
  return `${problematic.toolName}: ${problematic.error ?? problematic.status}`;
}

function ensurePromptPackRoleSections(input: {
  prompt: string;
  responseText: string;
  toolRuns?: ChatTurnTraceRecord["toolRuns"];
}): string {
  const requestedRoles = detectPromptRequestedRoles(input.prompt);
  if (requestedRoles.length <= 1) {
    return input.responseText;
  }
  const missing = requestedRoles.filter((role) => !roleSectionPresent(input.responseText, role));
  if (missing.length === 0) {
    return input.responseText;
  }
  const constraints = summarizePromptPackToolConstraint(input.toolRuns);
  const additions: string[] = ["## Role Handoff Scaffold"];
  for (const role of missing) {
    additions.push(`### ${toTitleCase(role)} Goat`);
    additions.push(`- Deliverable: ${roleDeliverableHint(role)}`);
    additions.push(`- Constraints: ${constraints}`);
    additions.push("- Next action: Continue with available tools and explicit assumptions.");
    additions.push("");
  }
  return [input.responseText.trim(), additions.join("\n").trim()].filter(Boolean).join("\n\n").trim();
}

function buildPromptPackConstraintsBlock(toolRuns: ChatTurnTraceRecord["toolRuns"] | undefined): string | undefined {
  const problematic = (toolRuns ?? [])
    .filter((item) => item.status === "failed" || item.status === "blocked" || item.status === "approval_required")
    .slice(-6);
  if (problematic.length === 0) {
    return undefined;
  }
  const lines = ["## Constraints", "- Tool issues encountered during this run:"];
  for (const item of problematic) {
    lines.push(`- \`${item.toolName}\`: ${item.error ?? item.status}`);
  }
  lines.push("- Fallback used: best-effort response without repeating blocked tool calls.");
  return lines.join("\n");
}

function finalizePromptPackResponseText(input: {
  prompt: string;
  responseText: string;
  trace?: ChatTurnTraceRecord;
}): string {
  const withRoles = ensurePromptPackRoleSections({
    prompt: input.prompt,
    responseText: (input.responseText ?? "").trim(),
    toolRuns: input.trace?.toolRuns,
  });
  const constraintsBlock = buildPromptPackConstraintsBlock(input.trace?.toolRuns);
  if (!constraintsBlock) {
    return withRoles.trim();
  }
  if (/\bconstraints\b/i.test(withRoles)) {
    return withRoles.trim();
  }
  return [withRoles.trim(), constraintsBlock].filter(Boolean).join("\n\n").trim();
}

function parsePromptPackTests(content: string): Array<{
  code: string;
  title: string;
  prompt: string;
  orderIndex: number;
}> {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const entries: Array<{ code: string; title: string; prompt: string; orderIndex: number }> = [];
  let active: { code: string; title: string; lines: string[] } | undefined;

  const flush = () => {
    if (!active) {
      return;
    }
    const prompt = active.lines.join("\n").trim();
    if (prompt.length > 0) {
      entries.push({
        code: normalizePromptTestCode(active.code),
        title: active.title || active.code,
        prompt,
        orderIndex: entries.length,
      });
    }
    active = undefined;
  };

  const normalizeHeadingLine = (line: string): string => {
    let normalized = line.trim();
    normalized = normalized.replace(/^[-*]\s+/, "");
    normalized = normalized.replace(/^\d+[.)]\s+/, "");
    let previous = "";
    while (normalized !== previous) {
      previous = normalized;
      normalized = normalized
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .replace(/^__(.+)__$/, "$1")
        .replace(/^\*(.+)\*$/, "$1")
        .replace(/^_(.+)_$/, "$1")
        .trim();
    }
    return normalized;
  };

  for (const rawLine of lines) {
    const line = normalizeHeadingLine(rawLine);
    const testBracket = line.match(/^\[(TEST-\d{1,3})\]\s*(.*)$/i);
    const testHeading = line.match(/^#{1,6}\s*(TEST-\d{1,3})\s*[:\-]?\s*(.*)$/i);
    const testPlain = line.match(/^(TEST-\d{1,3})\s*[:\-]\s*(.*)$/i);
    const matched = testBracket ?? testHeading ?? testPlain;
    if (matched) {
      flush();
      const code = normalizePromptTestCode(matched[1] ?? "");
      const title = (matched[2] ?? "").trim() || code;
      active = {
        code,
        title,
        lines: [],
      };
      continue;
    }
    const isSectionHeading = /^#{1,6}\s+/.test(line);
    const isHorizontalRule = rawLine.trim() === "---";
    if (active && (isHorizontalRule || isSectionHeading)) {
      flush();
      continue;
    }
    if (!active) {
      continue;
    }
    active.lines.push(rawLine);
  }
  flush();
  return entries;
}

function extractPromptPlaceholders(prompt: string): string[] {
  const matches = prompt.match(/<[^<>\n]{3,160}>/g) ?? [];
  const unique = new Set<string>();
  for (const match of matches) {
    const trimmed = match.trim();
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      continue;
    }
    const looksLikePlaceholder = /[A-Z]{2,}/.test(inner)
      || /[_ ]/.test(inner)
      || /\b(PASTE|LOCAL|URL|TOPIC|PATH|EXAMPLE|YOUR)\b/i.test(inner);
    if (!looksLikePlaceholder) {
      continue;
    }
    unique.add(`<${inner}>`);
  }
  return Array.from(unique);
}

function normalizePromptPlaceholderKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const inner = trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed.slice(1, -1).trim()
    : trimmed;
  return inner.toLowerCase().replace(/\s+/g, " ").trim();
}

function applyPromptPlaceholderValues(
  prompt: string,
  placeholderValues?: Record<string, string>,
): {
  prompt: string;
  missingPlaceholders: string[];
} {
  const placeholders = extractPromptPlaceholders(prompt);
  if (placeholders.length === 0) {
    return {
      prompt,
      missingPlaceholders: [],
    };
  }

  const replacements = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(placeholderValues ?? {})) {
    const key = normalizePromptPlaceholderKey(rawKey);
    const value = rawValue.trim();
    if (!key || !value) {
      continue;
    }
    replacements.set(key, value);
  }

  let resolvedPrompt = prompt;
  const missingPlaceholders: string[] = [];
  for (const placeholder of placeholders) {
    const key = normalizePromptPlaceholderKey(placeholder);
    const replacement = replacements.get(key);
    if (!replacement) {
      missingPlaceholders.push(placeholder);
      continue;
    }
    resolvedPrompt = resolvedPrompt.split(placeholder).join(replacement);
  }

  return {
    prompt: resolvedPrompt,
    missingPlaceholders,
  };
}

function extractCompletionText(response: ChatCompletionResponse): string {
  const choice = response.choices?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  if (!message) {
    return "";
  }
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const value = part as Record<string, unknown>;
        return typeof value.text === "string" ? value.text : "";
      })
      .join("")
      .trim();
  }
  return "";
}

function readCompletionRouting(response: ChatCompletionResponse): ChatTurnTraceRecord["routing"] | undefined {
  const raw = response.routing as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  return raw as ChatTurnTraceRecord["routing"];
}

function readCompletionCitations(response: ChatCompletionResponse): ChatCitationRecord[] {
  const raw = response.citations;
  if (!Array.isArray(raw)) {
    return [];
  }
  return dedupeChatCitations(
    raw.filter((item): item is ChatCitationRecord => typeof item === "object" && item !== null && typeof (item as ChatCitationRecord).url === "string"),
  );
}

function dedupeChatCitations(citations: ChatCitationRecord[]): ChatCitationRecord[] {
  const deduped: ChatCitationRecord[] = [];
  const seen = new Map<string, number>();
  for (const citation of citations) {
    const key = citation.url.trim().toLowerCase();
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, deduped.length);
      deduped.push(citation);
      continue;
    }
    const existing = deduped[existingIndex];
    if (!existing) {
      seen.set(key, deduped.length);
      deduped.push(citation);
      continue;
    }
    deduped[existingIndex] = {
      ...existing,
      citationId: existing.citationId,
      url: existing.url,
      title: existing.title ?? citation.title,
      snippet: existing.snippet ?? citation.snippet,
      sourceType: existing.sourceType ?? citation.sourceType,
    };
  }
  return deduped;
}

function shouldRetryToolProtocolError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("invalid_request_error")
    || message.includes("function name is invalid")
    || message.includes("reasoning_content is missing")
    || message.includes("tool call")
    || message.includes("tool_calls")
  );
}

function normalizeToolProtocolRetryRequest(
  request: ChatCompletionRequest,
  attempt: 1 | 2,
): ChatCompletionRequest {
  const modelToolNameMap = new Map<string, string>();
  const tools = Array.isArray(request.tools)
    ? request.tools.map((tool) => {
      const record = tool as Record<string, unknown>;
      if (record.type !== "function") {
        return tool;
      }
      const fn = (record.function ?? {}) as Record<string, unknown>;
      const rawName = typeof fn.name === "string" ? fn.name : "tool_fn";
      const normalizedName = rawName
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
      const finalName = /^[a-zA-Z]/.test(normalizedName) ? normalizedName : `tool_${normalizedName || "fn"}`;
      modelToolNameMap.set(rawName, finalName);
      return {
        ...record,
        function: {
          ...fn,
          name: finalName,
        },
      };
    })
    : request.tools;

  const messages = request.messages.map((message) => {
    const value = message as unknown as Record<string, unknown>;
    if (value.role === "assistant" && Array.isArray(value.tool_calls)) {
      const toolCalls = value.tool_calls.map((toolCall) => {
        const tc = toolCall as Record<string, unknown>;
        const fn = (tc.function ?? {}) as Record<string, unknown>;
        const rawName = typeof fn.name === "string" ? fn.name : "";
        const normalized = modelToolNameMap.get(rawName) ?? rawName;
        const rawArgs = fn.arguments;
        const normalizedArgs = typeof rawArgs === "string"
          ? rawArgs
          : JSON.stringify(rawArgs ?? {});
        return {
          ...tc,
          type: "function",
          function: {
            ...fn,
            name: normalized || "tool_fn",
            arguments: normalizedArgs,
          },
        };
      });
      const next = {
        ...value,
        tool_calls: toolCalls,
      } as Record<string, unknown>;
      if (attempt === 2 && typeof next.reasoning_content !== "string") {
        next.reasoning_content = "Using tool outputs to continue the response.";
      }
      return next as unknown as ChatCompletionRequest["messages"][number];
    }
    return message;
  });

  return {
    ...request,
    tools,
    messages,
  };
}

function isActiveToolGrant(grant: ToolGrantRecord): boolean {
  if (grant.revokedAt) {
    return false;
  }
  if (grant.expiresAt) {
    const expiry = Date.parse(grant.expiresAt);
    if (Number.isFinite(expiry) && expiry <= Date.now()) {
      return false;
    }
  }
  if (grant.grantType === "one_time") {
    return (grant.usesRemaining ?? 0) > 0;
  }
  return true;
}

function grantPatternMatches(pattern: string, toolName: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(toolName);
}

function hashSensitiveToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Timing-safe string comparison. This function must only be called with
 * fixed-length inputs (e.g. SHA-256 hex digests) because it early-returns
 * on length mismatch. For variable-length secrets, hash both sides first.
 */
function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeDeviceAccessDeviceType(value?: string): string {
  if (
    value === "mobile"
    || value === "desktop"
    || value === "tablet"
    || value === "browser"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeOptionalDeviceAccessText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxLength);
}

function normalizeDeviceAccessLabel(
  value: string | undefined,
  context: {
    deviceType: string;
    platform?: string;
    userAgent?: string;
  },
): string {
  const provided = normalizeOptionalDeviceAccessText(value, 120);
  if (provided) {
    return provided;
  }
  const platform = context.platform?.trim();
  const browser = inferBrowserFromUserAgent(context.userAgent);
  if (platform && browser) {
    return `${platform} ${browser}`;
  }
  if (platform) {
    return platform;
  }
  return context.deviceType === "unknown"
    ? "New device"
    : `${context.deviceType[0]?.toUpperCase() ?? ""}${context.deviceType.slice(1)} device`;
}

function inferPlatformFromUserAgent(userAgent?: string): string | undefined {
  const ua = userAgent?.toLowerCase() ?? "";
  if (!ua) {
    return undefined;
  }
  if (ua.includes("iphone")) {
    return "iPhone";
  }
  if (ua.includes("ipad")) {
    return "iPad";
  }
  if (ua.includes("android")) {
    return "Android";
  }
  if (ua.includes("windows")) {
    return "Windows";
  }
  if (ua.includes("mac os x") || ua.includes("macintosh")) {
    return "macOS";
  }
  if (ua.includes("linux")) {
    return "Linux";
  }
  return undefined;
}

function inferBrowserFromUserAgent(userAgent?: string): string | undefined {
  const ua = userAgent?.toLowerCase() ?? "";
  if (!ua) {
    return undefined;
  }
  if (ua.includes("edg/")) {
    return "Edge";
  }
  if (ua.includes("chrome/") && !ua.includes("edg/")) {
    return "Chrome";
  }
  if (ua.includes("firefox/")) {
    return "Firefox";
  }
  if (ua.includes("safari/") && !ua.includes("chrome/")) {
    return "Safari";
  }
  return undefined;
}

function mapAuthDeviceRequestRow(row: Record<string, unknown>): AuthDeviceRequestRecord {
  return {
    requestId: String(row.request_id ?? ""),
    approvalId: String(row.approval_id ?? ""),
    requestSecretHash: String(row.request_secret_hash ?? ""),
    deviceLabel: String(row.device_label ?? "New device"),
    deviceType: String(row.device_type ?? "unknown"),
    platform: typeof row.platform === "string" ? row.platform : undefined,
    requestedOrigin: typeof row.requested_origin === "string" ? row.requested_origin : undefined,
    requestedIp: typeof row.requested_ip === "string" ? row.requested_ip : undefined,
    userAgent: typeof row.user_agent === "string" ? row.user_agent : undefined,
    status: normalizeDeviceAccessRequestStatus(row.status),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    expiresAt: String(row.expires_at ?? new Date().toISOString()),
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : undefined,
    resolvedBy: typeof row.resolved_by === "string" ? row.resolved_by : undefined,
    resolutionNote: typeof row.resolution_note === "string" ? row.resolution_note : undefined,
    approvedTokenPlaintext: typeof row.approved_token_plaintext === "string" ? row.approved_token_plaintext : undefined,
    approvedTokenExpiresAt: typeof row.approved_token_expires_at === "string" ? row.approved_token_expires_at : undefined,
    deliveredAt: typeof row.delivered_at === "string" ? row.delivered_at : undefined,
  };
}

function mapAuthDeviceGrantRow(row: Record<string, unknown>): AuthDeviceGrantRecord {
  return {
    grantId: String(row.grant_id ?? ""),
    requestId: String(row.request_id ?? ""),
    tokenHash: String(row.token_hash ?? ""),
    deviceLabel: String(row.device_label ?? "New device"),
    deviceType: String(row.device_type ?? "unknown"),
    platform: typeof row.platform === "string" ? row.platform : undefined,
    grantedBy: String(row.granted_by ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : undefined,
    lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : undefined,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : undefined,
    metadata: safeJsonParse<Record<string, unknown>>(typeof row.metadata_json === "string" ? row.metadata_json : "{}", {}),
  };
}

function mapDeviceAccessStatusResponse(record: AuthDeviceRequestRecord): DeviceAccessRequestStatusResponse {
  if (record.status === "approved") {
    return {
      requestId: record.requestId,
      approvalId: record.approvalId,
      status: record.status,
      expiresAt: record.expiresAt,
      resolvedAt: record.resolvedAt,
      ...(record.approvedTokenPlaintext
        ? {
            deviceToken: record.approvedTokenPlaintext,
            deviceTokenExpiresAt: record.approvedTokenExpiresAt,
          }
        : {}),
      message: "Access approved. Finishing secure handoff to this device.",
    };
  }
  if (record.status === "rejected") {
    return {
      requestId: record.requestId,
      approvalId: record.approvalId,
      status: record.status,
      expiresAt: record.expiresAt,
      resolvedAt: record.resolvedAt,
      message: "This device request was rejected from another authenticated session.",
    };
  }
  if (record.status === "expired") {
    return {
      requestId: record.requestId,
      approvalId: record.approvalId,
      status: record.status,
      expiresAt: record.expiresAt,
      resolvedAt: record.resolvedAt,
      message: "This device request expired before it was approved.",
    };
  }
  return {
    requestId: record.requestId,
    approvalId: record.approvalId,
    status: "pending",
    expiresAt: record.expiresAt,
    message: "Waiting for approval from another authenticated Mission Control session.",
  };
}

function normalizeDeviceAccessRequestStatus(value: unknown): DeviceAccessRequestStatus {
  if (value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  return "pending";
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function createChatCompletionDeadline(timeoutMs: number | undefined): number | undefined {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }
  return Date.now() + Math.floor(timeoutMs);
}

function getRemainingChatCompletionTimeoutMs(
  deadline: number | undefined,
  timeoutMs: number | undefined,
): number | undefined {
  if (deadline === undefined) {
    return timeoutMs;
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw buildChatCompletionTimeoutError(timeoutMs);
  }
  return Math.max(1, remaining);
}

function normalizeChatCompletionAttemptError(error: unknown, timeoutMs: number | undefined): Error {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const name = normalized.name.toLowerCase();
  const message = normalized.message.toLowerCase();
  if (
    name.includes("timeout")
    || name.includes("abort")
    || message.includes("timed out")
    || message.includes("timeout")
    || message.includes("aborted")
  ) {
    return buildChatCompletionTimeoutError(timeoutMs);
  }
  return normalized;
}

function buildChatCompletionTimeoutError(timeoutMs: number | undefined): Error {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return new Error(`Chat completion timed out after ${Math.floor(timeoutMs)}ms.`);
  }
  return new Error("Chat completion timed out.");
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
  throw new Error("Path escapes allowed root");
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
