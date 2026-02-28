import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  TaskSubagentCreateInput,
  TaskSubagentSession,
  TaskSubagentUpdateInput,
} from "@personal-ai/contracts";

interface TaskSubagentRow {
  subagent_session_id: string;
  task_id: string;
  openclaw_session_id: string;
  agent_name: string | null;
  status: TaskSubagentSession["status"];
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export class TaskSubagentRepository {
  private readonly insertStmt;
  private readonly listByTaskStmt;
  private readonly listAllStmt;
  private readonly getByOpenclawStmt;
  private readonly updateByOpenclawStmt;
  private readonly countActiveStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO task_subagent_sessions (
        subagent_session_id, task_id, openclaw_session_id, agent_name,
        status, created_at, updated_at, ended_at
      ) VALUES (
        @subagentSessionId, @taskId, @openclawSessionId, @agentName,
        @status, @createdAt, @updatedAt, @endedAt
      )
    `);

    this.listByTaskStmt = db.prepare(`
      SELECT * FROM task_subagent_sessions
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    this.listAllStmt = db.prepare(`
      SELECT * FROM task_subagent_sessions
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    this.getByOpenclawStmt = db.prepare(
      "SELECT * FROM task_subagent_sessions WHERE openclaw_session_id = ?",
    );

    this.updateByOpenclawStmt = db.prepare(`
      UPDATE task_subagent_sessions
      SET
        status = @status,
        ended_at = @endedAt,
        updated_at = @updatedAt
      WHERE openclaw_session_id = @openclawSessionId
    `);

    this.countActiveStmt = db.prepare(
      "SELECT COUNT(*) AS count FROM task_subagent_sessions WHERE status = 'active'",
    );
  }

  public create(taskId: string, input: TaskSubagentCreateInput, now = new Date().toISOString()): TaskSubagentSession {
    const subagentSessionId = randomUUID();
    this.insertStmt.run({
      subagentSessionId,
      taskId,
      openclawSessionId: input.openclawSessionId,
      agentName: input.agentName ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
      endedAt: null,
    });

    return this.getByOpenclawSessionId(input.openclawSessionId);
  }

  public getByOpenclawSessionId(openclawSessionId: string): TaskSubagentSession {
    const row = this.getByOpenclawStmt.get(openclawSessionId) as TaskSubagentRow | undefined;
    if (!row) {
      throw new Error(`Sub-agent session ${openclawSessionId} not found`);
    }
    return mapSubagentRow(row);
  }

  public findByOpenclawSessionId(openclawSessionId: string): TaskSubagentSession | undefined {
    const row = this.getByOpenclawStmt.get(openclawSessionId) as TaskSubagentRow | undefined;
    if (!row) {
      return undefined;
    }
    return mapSubagentRow(row);
  }

  public listByTask(taskId: string, limit = 200): TaskSubagentSession[] {
    const rows = this.listByTaskStmt.all(taskId, limit) as unknown as TaskSubagentRow[];
    return rows.map(mapSubagentRow);
  }

  public listAll(limit = 500): TaskSubagentSession[] {
    const rows = this.listAllStmt.all(limit) as unknown as TaskSubagentRow[];
    return rows.map(mapSubagentRow);
  }

  public updateByOpenclawSessionId(
    openclawSessionId: string,
    input: TaskSubagentUpdateInput,
    now = new Date().toISOString(),
  ): TaskSubagentSession {
    const current = this.getByOpenclawSessionId(openclawSessionId);
    this.updateByOpenclawStmt.run({
      openclawSessionId,
      status: input.status ?? current.status,
      endedAt: input.endedAt ?? current.endedAt ?? null,
      updatedAt: now,
    });
    return this.getByOpenclawSessionId(openclawSessionId);
  }

  public activeCount(): number {
    const row = this.countActiveStmt.get() as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }
}

function mapSubagentRow(row: TaskSubagentRow): TaskSubagentSession {
  return {
    subagentSessionId: row.subagent_session_id,
    taskId: row.task_id,
    openclawSessionId: row.openclaw_session_id,
    agentName: row.agent_name ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at ?? undefined,
  };
}
