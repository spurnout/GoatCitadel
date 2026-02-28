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

export interface StorageOptions extends SqliteOptions {
  transcriptsDir: string;
  auditDir: string;
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
  public readonly mesh: MeshRepository;

  public constructor(options: StorageOptions) {
    this.db = createDatabase({ dbPath: options.dbPath });
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
    this.mesh = new MeshRepository(this.db);
  }

  public close(): void {
    this.db.close();
  }
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
export * from "./mesh-repo.js";
