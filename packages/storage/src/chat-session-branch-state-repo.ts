import type { DatabaseSync } from "node:sqlite";

export interface ChatSessionBranchStateRecord {
  sessionId: string;
  activeLeafTurnId: string;
  updatedAt: string;
}

interface ChatSessionBranchStateRow {
  session_id: string;
  active_leaf_turn_id: string;
  updated_at: string;
}

export class ChatSessionBranchStateRepository {
  private readonly getStmt;
  private readonly upsertStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare(`
      SELECT *
      FROM chat_session_branch_state
      WHERE session_id = ?
    `);
    this.upsertStmt = db.prepare(`
      INSERT INTO chat_session_branch_state (session_id, active_leaf_turn_id, updated_at)
      VALUES (@sessionId, @activeLeafTurnId, @updatedAt)
      ON CONFLICT(session_id) DO UPDATE SET
        active_leaf_turn_id = excluded.active_leaf_turn_id,
        updated_at = excluded.updated_at
    `);
  }

  public get(sessionId: string): ChatSessionBranchStateRecord | undefined {
    const row = this.getStmt.get(sessionId) as ChatSessionBranchStateRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  public setActiveLeaf(
    sessionId: string,
    activeLeafTurnId: string,
    now = new Date().toISOString(),
  ): ChatSessionBranchStateRecord {
    this.upsertStmt.run({
      sessionId,
      activeLeafTurnId,
      updatedAt: now,
    });
    const row = this.getStmt.get(sessionId) as ChatSessionBranchStateRow | undefined;
    if (!row) {
      throw new Error(`chat session branch state row missing for session ${sessionId}`);
    }
    return mapRow(row);
  }
}

function mapRow(row: ChatSessionBranchStateRow): ChatSessionBranchStateRecord {
  return {
    sessionId: row.session_id,
    activeLeafTurnId: row.active_leaf_turn_id,
    updatedAt: row.updated_at,
  };
}
