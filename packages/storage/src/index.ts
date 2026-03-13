import type { ChatAttachmentRecord } from "@goatcitadel/contracts";
import { createDatabase, type SqliteOptions } from "./sqlite.js";
import { SessionRepository } from "./session-repo.js";
import { IdempotencyRepository } from "./idempotency-repo.js";
import { TranscriptLog } from "./transcript-log.js";
import { AuditLog } from "./audit-log.js";
import { ApprovalRepository } from "./approval-repo.js";
import { CostLedgerRepository } from "./cost-ledger-repo.js";
import { ApprovalEventRepository } from "./approval-event-repo.js";
import { PendingApprovalActionRepository } from "./pending-approval-action-repo.js";
import { OrchestrationRepository } from "./orchestration-repo.js";
import { TaskRepository } from "./task-repo.js";
import { TaskActivityRepository } from "./task-activity-repo.js";
import { TaskDeliverableRepository } from "./task-deliverable-repo.js";
import { TaskSubagentRepository } from "./task-subagent-repo.js";
import { RealtimeEventRepository } from "./realtime-event-repo.js";
import { CronJobRepository } from "./cron-job-repo.js";
import { IntegrationConnectionRepository } from "./integration-connection-repo.js";
import { MeshRepository } from "./mesh-repo.js";
import { MemoryContextRepository } from "./memory-context-repo.js";
import { MemoryQmdRunRepository } from "./memory-qmd-run-repo.js";
import { AgentProfileRepository } from "./agent-profile-repo.js";
import { ToolGrantRepository } from "./tool-grant-repo.js";
import { ToolAccessDecisionRepository } from "./tool-access-decision-repo.js";
import { KnowledgeRepository } from "./knowledge-repo.js";
import { CommsDeliveryRepository } from "./comms-delivery-repo.js";
import { ChatProjectRepository } from "./chat-project-repo.js";
import { ChatSessionMetaRepository } from "./chat-session-meta-repo.js";
import { ChatSessionProjectRepository } from "./chat-session-project-repo.js";
import { ChatSessionBranchStateRepository } from "./chat-session-branch-state-repo.js";
import { ChatSessionBindingRepository } from "./chat-session-binding-repo.js";
import { ChatAttachmentRepository } from "./chat-attachment-repo.js";
import { ChatSessionPrefsRepository } from "./chat-session-prefs-repo.js";
import { SessionAutonomyPrefsRepository } from "./session-autonomy-prefs-repo.js";
import { ChatTurnTraceRepository } from "./chat-turn-trace-repo.js";
import { ChatExecutionPlanRepository } from "./chat-execution-plan-repo.js";
import { ChatConversationSummaryRepository } from "./chat-conversation-summary-repo.js";
import { ChatSpecialistCandidateRepository } from "./chat-specialist-candidate-repo.js";
import { ChatToolRunRepository } from "./chat-tool-run-repo.js";
import { ChatInlineApprovalRepository } from "./chat-inline-approval-repo.js";
import { ChatDelegationRunRepository } from "./chat-delegation-run-repo.js";
import { ChatDelegationStepRepository } from "./chat-delegation-step-repo.js";
import { ChatMessageRepository } from "./chat-message-repo.js";
import { SystemSettingsRepository } from "./system-settings-repo.js";
import { ResearchRunRepository } from "./research-run-repo.js";
import { ResearchSourceRepository } from "./research-source-repo.js";
import { PromptPackRepository } from "./prompt-pack-repo.js";
import { PromptPackRunRepository } from "./prompt-pack-run-repo.js";
import { PromptPackScoreRepository } from "./prompt-pack-score-repo.js";
import { WorkspaceRepository } from "./workspace-repo.js";
import { DurableRunRepository } from "./durable-run-repo.js";
import { GatewaySqlRepository } from "./gateway-sql-repo.js";

export interface StorageOptions extends SqliteOptions {
  transcriptsDir: string;
  auditDir: string;
}

export interface DeleteChatSessionDataResult {
  sessionId: string;
  deleted: boolean;
  cleanupRelPaths: string[];
  attachments: ChatAttachmentRecord[];
}

export class Storage {
  public readonly db: ReturnType<typeof createDatabase>;
  public readonly sessions: SessionRepository;
  public readonly idempotency: IdempotencyRepository;
  public readonly transcripts: TranscriptLog;
  public readonly audit: AuditLog;
  public readonly approvals: ApprovalRepository;
  public readonly approvalEvents: ApprovalEventRepository;
  public readonly pendingApprovalActions: PendingApprovalActionRepository;
  public readonly costLedger: CostLedgerRepository;
  public readonly orchestration: OrchestrationRepository;
  public readonly tasks: TaskRepository;
  public readonly taskActivities: TaskActivityRepository;
  public readonly taskDeliverables: TaskDeliverableRepository;
  public readonly taskSubagents: TaskSubagentRepository;
  public readonly realtimeEvents: RealtimeEventRepository;
  public readonly cronJobs: CronJobRepository;
  public readonly integrationConnections: IntegrationConnectionRepository;
  public readonly agentProfiles: AgentProfileRepository;
  public readonly mesh: MeshRepository;
  public readonly memoryContexts: MemoryContextRepository;
  public readonly memoryQmdRuns: MemoryQmdRunRepository;
  public readonly toolGrants: ToolGrantRepository;
  public readonly toolAccessDecisions: ToolAccessDecisionRepository;
  public readonly knowledge: KnowledgeRepository;
  public readonly commsDeliveries: CommsDeliveryRepository;
  public readonly chatProjects: ChatProjectRepository;
  public readonly chatSessionMeta: ChatSessionMetaRepository;
  public readonly chatSessionProjects: ChatSessionProjectRepository;
  public readonly chatSessionBranchState: ChatSessionBranchStateRepository;
  public readonly chatSessionBindings: ChatSessionBindingRepository;
  public readonly chatAttachments: ChatAttachmentRepository;
  public readonly chatSessionPrefs: ChatSessionPrefsRepository;
  public readonly sessionAutonomyPrefs: SessionAutonomyPrefsRepository;
  public readonly chatMessages: ChatMessageRepository;
  public readonly chatTurnTraces: ChatTurnTraceRepository;
  public readonly chatExecutionPlans: ChatExecutionPlanRepository;
  public readonly chatConversationSummaries: ChatConversationSummaryRepository;
  public readonly chatSpecialistCandidates: ChatSpecialistCandidateRepository;
  public readonly chatToolRuns: ChatToolRunRepository;
  public readonly chatInlineApprovals: ChatInlineApprovalRepository;
  public readonly chatDelegationRuns: ChatDelegationRunRepository;
  public readonly chatDelegationSteps: ChatDelegationStepRepository;
  public readonly systemSettings: SystemSettingsRepository;
  public readonly researchRuns: ResearchRunRepository;
  public readonly researchSources: ResearchSourceRepository;
  public readonly promptPacks: PromptPackRepository;
  public readonly promptPackRuns: PromptPackRunRepository;
  public readonly promptPackScores: PromptPackScoreRepository;
  public readonly workspaces: WorkspaceRepository;
  public readonly durableRuns: DurableRunRepository;
  public readonly gatewaySql: GatewaySqlRepository;

  public constructor(options: StorageOptions) {
    this.db = createDatabase({
      dbPath: options.dbPath,
      tuning: options.tuning,
    });
    this.sessions = new SessionRepository(this.db);
    this.idempotency = new IdempotencyRepository(this.db);
    this.transcripts = new TranscriptLog(options.transcriptsDir);
    this.audit = new AuditLog(options.auditDir);
    this.approvals = new ApprovalRepository(this.db);
    this.approvalEvents = new ApprovalEventRepository(this.db);
    this.pendingApprovalActions = new PendingApprovalActionRepository(this.db);
    this.costLedger = new CostLedgerRepository(this.db);
    this.orchestration = new OrchestrationRepository(this.db);
    this.tasks = new TaskRepository(this.db);
    this.taskActivities = new TaskActivityRepository(this.db);
    this.taskDeliverables = new TaskDeliverableRepository(this.db);
    this.taskSubagents = new TaskSubagentRepository(this.db);
    this.realtimeEvents = new RealtimeEventRepository(this.db);
    this.cronJobs = new CronJobRepository(this.db);
    this.integrationConnections = new IntegrationConnectionRepository(this.db);
    this.agentProfiles = new AgentProfileRepository(this.db);
    this.mesh = new MeshRepository(this.db);
    this.memoryContexts = new MemoryContextRepository(this.db);
    this.memoryQmdRuns = new MemoryQmdRunRepository(this.db);
    this.toolGrants = new ToolGrantRepository(this.db);
    this.toolAccessDecisions = new ToolAccessDecisionRepository(this.db);
    this.knowledge = new KnowledgeRepository(this.db);
    this.commsDeliveries = new CommsDeliveryRepository(this.db);
    this.chatProjects = new ChatProjectRepository(this.db);
    this.chatSessionMeta = new ChatSessionMetaRepository(this.db);
    this.chatSessionProjects = new ChatSessionProjectRepository(this.db);
    this.chatSessionBranchState = new ChatSessionBranchStateRepository(this.db);
    this.chatSessionBindings = new ChatSessionBindingRepository(this.db);
    this.chatAttachments = new ChatAttachmentRepository(this.db);
    this.chatSessionPrefs = new ChatSessionPrefsRepository(this.db);
    this.sessionAutonomyPrefs = new SessionAutonomyPrefsRepository(this.db);
    this.chatMessages = new ChatMessageRepository(this.db);
    this.chatTurnTraces = new ChatTurnTraceRepository(this.db);
    this.chatExecutionPlans = new ChatExecutionPlanRepository(this.db);
    this.chatConversationSummaries = new ChatConversationSummaryRepository(this.db);
    this.chatSpecialistCandidates = new ChatSpecialistCandidateRepository(this.db);
    this.chatToolRuns = new ChatToolRunRepository(this.db);
    this.chatInlineApprovals = new ChatInlineApprovalRepository(this.db);
    this.chatDelegationRuns = new ChatDelegationRunRepository(this.db);
    this.chatDelegationSteps = new ChatDelegationStepRepository(this.db);
    this.systemSettings = new SystemSettingsRepository(this.db);
    this.researchRuns = new ResearchRunRepository(this.db);
    this.researchSources = new ResearchSourceRepository(this.db);
    this.promptPacks = new PromptPackRepository(this.db);
    this.promptPackRuns = new PromptPackRunRepository(this.db);
    this.promptPackScores = new PromptPackScoreRepository(this.db);
    this.workspaces = new WorkspaceRepository(this.db);
    this.durableRuns = new DurableRunRepository(this.db);
    this.gatewaySql = new GatewaySqlRepository(this.db);
  }

  public close(): void {
    this.db.close();
  }

  public deleteChatSessionData(sessionId: string): DeleteChatSessionDataResult {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required");
    }

    const attachments = this.chatAttachments.listBySession(normalizedSessionId, 10_000);
    const cleanupRelPaths = dedupeStrings([
      ...attachments.map((record) => record.storageRelPath),
      ...attachments.map((record) => record.thumbnailRelPath),
      ...this.listMediaArtifactPathsForSession(normalizedSessionId, attachments),
    ]);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        DELETE FROM media_artifacts
        WHERE job_id IN (
          SELECT job_id
          FROM media_jobs
          WHERE session_id = @sessionId
             OR attachment_id IN (SELECT value FROM json_each(@attachmentIdsJson))
        )
      `).run({
        sessionId: normalizedSessionId,
        attachmentIdsJson: JSON.stringify(attachments.map((record) => record.attachmentId)),
      });
      this.db.prepare(`
        DELETE FROM media_jobs
        WHERE session_id = @sessionId
           OR attachment_id IN (SELECT value FROM json_each(@attachmentIdsJson))
      `).run({
        sessionId: normalizedSessionId,
        attachmentIdsJson: JSON.stringify(attachments.map((record) => record.attachmentId)),
      });
      this.db.prepare(`
        DELETE FROM research_sources
        WHERE run_id IN (
          SELECT run_id
          FROM research_runs
          WHERE session_id = ?
        )
      `).run(normalizedSessionId);
      this.db.prepare("DELETE FROM research_runs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare(`
        DELETE FROM chat_delegation_steps
        WHERE run_id IN (
          SELECT run_id
          FROM chat_delegation_runs
          WHERE session_id = ?
        )
      `).run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_delegation_runs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM proactive_actions WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM proactive_runs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare(`
        DELETE FROM learned_memory_sources
        WHERE item_id IN (
          SELECT item_id
          FROM learned_memory_items
          WHERE session_id = ?
        )
      `).run(normalizedSessionId);
      this.db.prepare("DELETE FROM learned_memory_conflicts WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM learned_memory_items WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_reflection_attempts WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare(`
        DELETE FROM prompt_pack_scores
        WHERE run_id IN (
          SELECT run_id
          FROM prompt_pack_runs
          WHERE session_id = ?
        )
      `).run(normalizedSessionId);
      this.db.prepare("DELETE FROM prompt_pack_runs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM memory_context_packs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM memory_qmd_runs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_execution_plan_steps WHERE plan_id IN (SELECT plan_id FROM chat_execution_plans WHERE session_id = ?)").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_execution_plans WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_conversation_summaries WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM tool_access_decisions WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM tool_invocations WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM policy_blocks WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM cost_ledger WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM bankr_action_audit WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM voice_sessions WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM mesh_session_owners WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_inline_approvals WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_tool_runs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_specialist_candidates WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_turn_traces WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM session_autonomy_prefs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_session_prefs WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_session_branch_state WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_session_bindings WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_session_projects WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_attachments WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare("DELETE FROM chat_session_meta WHERE session_id = ?").run(normalizedSessionId);
      this.db.prepare(`
        DELETE FROM tool_grants
        WHERE scope = 'session'
          AND scope_ref = ?
      `).run(normalizedSessionId);
      const deleted = Number(
        this.db.prepare("DELETE FROM sessions WHERE session_id = ?").run(normalizedSessionId).changes ?? 0,
      ) > 0;
      this.db.exec("COMMIT");
      return {
        sessionId: normalizedSessionId,
        deleted,
        cleanupRelPaths,
        attachments,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private listMediaArtifactPathsForSession(sessionId: string, attachments: ChatAttachmentRecord[]): string[] {
    const rows = this.db.prepare(`
      SELECT storage_rel_path
      FROM media_artifacts
      WHERE storage_rel_path IS NOT NULL
        AND job_id IN (
          SELECT job_id
          FROM media_jobs
          WHERE session_id = @sessionId
             OR attachment_id IN (SELECT value FROM json_each(@attachmentIdsJson))
        )
    `).all({
      sessionId,
      attachmentIdsJson: JSON.stringify(attachments.map((record) => record.attachmentId)),
    }) as Array<{ storage_rel_path?: string | null }>;
    return rows
      .map((row) => row.storage_rel_path?.trim())
      .filter((value): value is string => Boolean(value));
  }
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

export * from "./sqlite.js";
export * from "./session-repo.js";
export * from "./idempotency-repo.js";
export * from "./transcript-log.js";
export * from "./audit-log.js";
export * from "./approval-repo.js";
export * from "./approval-event-repo.js";
export * from "./pending-approval-action-repo.js";
export * from "./cost-ledger-repo.js";
export * from "./orchestration-repo.js";
export * from "./task-repo.js";
export * from "./task-activity-repo.js";
export * from "./task-deliverable-repo.js";
export * from "./task-subagent-repo.js";
export * from "./realtime-event-repo.js";
export * from "./cron-job-repo.js";
export * from "./integration-connection-repo.js";
export * from "./agent-profile-repo.js";
export * from "./mesh-repo.js";
export * from "./memory-context-repo.js";
export * from "./memory-qmd-run-repo.js";
export * from "./tool-grant-repo.js";
export * from "./tool-access-decision-repo.js";
export * from "./knowledge-repo.js";
export * from "./comms-delivery-repo.js";
export * from "./chat-project-repo.js";
export * from "./chat-session-meta-repo.js";
export * from "./chat-session-project-repo.js";
export * from "./chat-session-branch-state-repo.js";
export * from "./chat-session-binding-repo.js";
export * from "./chat-attachment-repo.js";
export * from "./chat-session-prefs-repo.js";
export * from "./session-autonomy-prefs-repo.js";
export * from "./chat-message-repo.js";
export * from "./chat-turn-trace-repo.js";
export * from "./chat-execution-plan-repo.js";
export * from "./chat-conversation-summary-repo.js";
export * from "./chat-tool-run-repo.js";
export * from "./chat-inline-approval-repo.js";
export * from "./chat-delegation-run-repo.js";
export * from "./chat-delegation-step-repo.js";
export * from "./system-settings-repo.js";
export * from "./research-run-repo.js";
export * from "./research-source-repo.js";
export * from "./prompt-pack-repo.js";
export * from "./prompt-pack-run-repo.js";
export * from "./prompt-pack-score-repo.js";
export * from "./workspace-repo.js";
export * from "./durable-run-repo.js";
export * from "./safe-json.js";
export * from "./gateway-sql-repo.js";
