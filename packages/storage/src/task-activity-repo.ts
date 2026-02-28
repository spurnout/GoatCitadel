import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  TaskActivityCreateInput,
  TaskActivityRecord,
} from "@personal-ai/contracts";

interface TaskActivityRow {
  activity_id: string;
  task_id: string;
  agent_id: string | null;
  activity_type: TaskActivityRecord["activityType"];
  message: string;
  metadata_json: string | null;
  created_at: string;
}

export class TaskActivityRepository {
  private readonly insertStmt;
  private readonly listByTaskStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO task_activities (
        activity_id, task_id, agent_id, activity_type, message, metadata_json, created_at
      ) VALUES (
        @activityId, @taskId, @agentId, @activityType, @message, @metadataJson, @createdAt
      )
    `);

    this.listByTaskStmt = db.prepare(`
      SELECT * FROM task_activities
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
  }

  public append(taskId: string, input: TaskActivityCreateInput, createdAt = new Date().toISOString()): TaskActivityRecord {
    const activityId = randomUUID();
    this.insertStmt.run({
      activityId,
      taskId,
      agentId: input.agentId ?? null,
      activityType: input.activityType,
      message: input.message,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt,
    });

    return {
      activityId,
      taskId,
      agentId: input.agentId,
      activityType: input.activityType,
      message: input.message,
      metadata: input.metadata,
      createdAt,
    };
  }

  public listByTask(taskId: string, limit = 200): TaskActivityRecord[] {
    const rows = this.listByTaskStmt.all(taskId, limit) as unknown as TaskActivityRow[];
    return rows.map((row) => ({
      activityId: row.activity_id,
      taskId: row.task_id,
      agentId: row.agent_id ?? undefined,
      activityType: row.activity_type,
      message: row.message,
      metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : undefined,
      createdAt: row.created_at,
    }));
  }
}
