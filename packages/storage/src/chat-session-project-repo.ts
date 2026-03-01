import type { DatabaseSync } from "node:sqlite";

export interface ChatSessionProjectRecord {
  sessionId: string;
  projectId: string;
  assignedAt: string;
}

interface ChatSessionProjectRow {
  session_id: string;
  project_id: string;
  assigned_at: string;
}

export class ChatSessionProjectRepository {
  private readonly getStmt;
  private readonly upsertStmt;
  private readonly deleteStmt;
  private readonly listBySessionIdsStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare("SELECT * FROM chat_session_projects WHERE session_id = ?");
    this.upsertStmt = db.prepare(`
      INSERT INTO chat_session_projects (session_id, project_id, assigned_at)
      VALUES (@sessionId, @projectId, @assignedAt)
      ON CONFLICT(session_id) DO UPDATE SET
        project_id = excluded.project_id,
        assigned_at = excluded.assigned_at
    `);
    this.deleteStmt = db.prepare("DELETE FROM chat_session_projects WHERE session_id = ?");
    this.listBySessionIdsStmt = db.prepare(`
      SELECT * FROM chat_session_projects
      WHERE session_id IN (SELECT value FROM json_each(@sessionIdsJson))
    `);
  }

  public get(sessionId: string): ChatSessionProjectRecord | undefined {
    const row = this.getStmt.get(sessionId) as ChatSessionProjectRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  public assign(sessionId: string, projectId: string, now = new Date().toISOString()): ChatSessionProjectRecord {
    this.upsertStmt.run({
      sessionId,
      projectId,
      assignedAt: now,
    });
    return mapRow(this.getStmt.get(sessionId) as unknown as ChatSessionProjectRow);
  }

  public unassign(sessionId: string): boolean {
    const existing = this.get(sessionId);
    if (!existing) {
      return false;
    }
    this.deleteStmt.run(sessionId);
    return true;
  }

  public listBySessionIds(sessionIds: string[]): Map<string, ChatSessionProjectRecord> {
    if (sessionIds.length === 0) {
      return new Map();
    }
    const rows = this.listBySessionIdsStmt.all({
      sessionIdsJson: JSON.stringify(sessionIds),
    }) as unknown as ChatSessionProjectRow[];
    return new Map(rows.map((row) => [row.session_id, mapRow(row)]));
  }
}

function mapRow(row: ChatSessionProjectRow): ChatSessionProjectRecord {
  return {
    sessionId: row.session_id,
    projectId: row.project_id,
    assignedAt: row.assigned_at,
  };
}
