import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  TaskCreateInput,
  TaskRecord,
  TaskStatus,
  TaskUpdateInput,
} from "@personal-ai/contracts";

interface TaskRow {
  task_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskRecord["priority"];
  assigned_agent_id: string | null;
  created_by: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListQuery {
  status?: TaskStatus;
  limit: number;
  cursor?: string;
}

export interface TaskStatusCount {
  status: string;
  count: number;
}

export class TaskRepository {
  private readonly insertStmt;
  private readonly getStmt;
  private readonly listStmt;
  private readonly updateStmt;
  private readonly deleteStmt;
  private readonly statusCountsStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO tasks (
        task_id, title, description, status, priority,
        assigned_agent_id, created_by, due_at, created_at, updated_at
      ) VALUES (
        @taskId, @title, @description, @status, @priority,
        @assignedAgentId, @createdBy, @dueAt, @createdAt, @updatedAt
      )
    `);

    this.getStmt = db.prepare("SELECT * FROM tasks WHERE task_id = ?");

    this.listStmt = db.prepare(`
      SELECT * FROM tasks
      WHERE (@status IS NULL OR status = @status)
        AND (@cursor IS NULL OR updated_at < @cursor)
      ORDER BY updated_at DESC
      LIMIT @limit
    `);

    this.updateStmt = db.prepare(`
      UPDATE tasks
      SET
        title = @title,
        description = @description,
        status = @status,
        priority = @priority,
        assigned_agent_id = @assignedAgentId,
        due_at = @dueAt,
        updated_at = @updatedAt
      WHERE task_id = @taskId
    `);

    this.deleteStmt = db.prepare("DELETE FROM tasks WHERE task_id = ?");
    this.statusCountsStmt = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM tasks
      GROUP BY status
      ORDER BY status ASC
    `);
  }

  public create(input: TaskCreateInput, now = new Date().toISOString()): TaskRecord {
    const taskId = randomUUID();
    this.insertStmt.run({
      taskId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "inbox",
      priority: input.priority ?? "normal",
      assignedAgentId: input.assignedAgentId ?? null,
      createdBy: input.createdBy ?? null,
      dueAt: input.dueAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.get(taskId);
  }

  public get(taskId: string): TaskRecord {
    const row = this.getStmt.get(taskId) as TaskRow | undefined;
    if (!row) {
      throw new Error(`Task ${taskId} not found`);
    }
    return mapTaskRow(row);
  }

  public find(taskId: string): TaskRecord | undefined {
    const row = this.getStmt.get(taskId) as TaskRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapTaskRow(row);
  }

  public list(query: TaskListQuery): TaskRecord[] {
    const rows = this.listStmt.all({
      status: query.status ?? null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    }) as unknown as TaskRow[];
    return rows.map(mapTaskRow);
  }

  public update(taskId: string, input: TaskUpdateInput, now = new Date().toISOString()): TaskRecord {
    const current = this.get(taskId);
    this.updateStmt.run({
      taskId,
      title: input.title ?? current.title,
      description: input.description ?? current.description ?? null,
      status: input.status ?? current.status,
      priority: input.priority ?? current.priority,
      assignedAgentId: input.assignedAgentId ?? current.assignedAgentId ?? null,
      dueAt: input.dueAt ?? current.dueAt ?? null,
      updatedAt: now,
    });
    return this.get(taskId);
  }

  public delete(taskId: string): boolean {
    const before = this.find(taskId);
    if (!before) {
      return false;
    }
    this.deleteStmt.run(taskId);
    return true;
  }

  public statusCounts(): TaskStatusCount[] {
    const rows = this.statusCountsStmt.all() as unknown as Array<{ status: string; count: number }>;
    return rows.map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0),
    }));
  }
}

function mapTaskRow(row: TaskRow): TaskRecord {
  return {
    taskId: row.task_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    assignedAgentId: row.assigned_agent_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    dueAt: row.due_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
