import type { DatabaseSync } from "node:sqlite";
import type { ChatToolRunRecord } from "@goatcitadel/contracts";

interface ChatToolRunRow {
  tool_run_id: string;
  turn_id: string;
  session_id: string;
  tool_name: string;
  status: ChatToolRunRecord["status"];
  approval_id: string | null;
  args_json: string | null;
  result_json: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ChatToolRunCreateInput {
  toolRunId: string;
  turnId: string;
  sessionId: string;
  toolName: string;
  status?: ChatToolRunRecord["status"];
  approvalId?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ChatToolRunPatchInput {
  status?: ChatToolRunRecord["status"];
  approvalId?: string;
  result?: Record<string, unknown>;
  error?: string;
  finishedAt?: string;
}

export class ChatToolRunRepository {
  private readonly getStmt;
  private readonly insertStmt;
  private readonly listByTurnStmt;
  private readonly listBySessionStmt;
  private readonly patchStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare("SELECT * FROM chat_tool_runs WHERE tool_run_id = ?");
    this.insertStmt = db.prepare(`
      INSERT INTO chat_tool_runs (
        tool_run_id, turn_id, session_id, tool_name, status, approval_id, args_json,
        result_json, error, started_at, finished_at
      ) VALUES (
        @toolRunId, @turnId, @sessionId, @toolName, @status, @approvalId, @argsJson,
        @resultJson, @error, @startedAt, @finishedAt
      )
    `);
    this.patchStmt = db.prepare(`
      UPDATE chat_tool_runs
      SET
        status = @status,
        approval_id = @approvalId,
        result_json = @resultJson,
        error = @error,
        finished_at = @finishedAt
      WHERE tool_run_id = @toolRunId
    `);
    this.listByTurnStmt = db.prepare(`
      SELECT * FROM chat_tool_runs
      WHERE turn_id = @turnId
      ORDER BY started_at ASC
    `);
    this.listBySessionStmt = db.prepare(`
      SELECT * FROM chat_tool_runs
      WHERE session_id = @sessionId
      ORDER BY started_at DESC
      LIMIT @limit
    `);
  }

  public get(toolRunId: string): ChatToolRunRecord {
    const row = this.getStmt.get(toolRunId) as ChatToolRunRow | undefined;
    if (!row) {
      throw new Error(`Chat tool run ${toolRunId} not found`);
    }
    return mapRow(row);
  }

  public create(input: ChatToolRunCreateInput): ChatToolRunRecord {
    this.insertStmt.run({
      toolRunId: input.toolRunId,
      turnId: input.turnId,
      sessionId: input.sessionId,
      toolName: input.toolName,
      status: input.status ?? "started",
      approvalId: input.approvalId ?? null,
      argsJson: input.args ? JSON.stringify(input.args) : null,
      resultJson: input.result ? JSON.stringify(input.result) : null,
      error: input.error ?? null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      finishedAt: input.finishedAt ?? null,
    });
    return this.get(input.toolRunId);
  }

  public patch(toolRunId: string, input: ChatToolRunPatchInput): ChatToolRunRecord {
    const current = this.get(toolRunId);
    this.patchStmt.run({
      toolRunId,
      status: input.status ?? current.status,
      approvalId: input.approvalId !== undefined ? input.approvalId : (current.approvalId ?? null),
      resultJson: input.result !== undefined ? JSON.stringify(input.result) : (current.result ? JSON.stringify(current.result) : null),
      error: input.error !== undefined ? input.error : (current.error ?? null),
      finishedAt: input.finishedAt !== undefined ? input.finishedAt : (current.finishedAt ?? null),
    });
    return this.get(toolRunId);
  }

  public listByTurn(turnId: string): ChatToolRunRecord[] {
    const rows = this.listByTurnStmt.all({ turnId }) as unknown as ChatToolRunRow[];
    return rows.map(mapRow);
  }

  public listBySession(sessionId: string, limit = 200): ChatToolRunRecord[] {
    const rows = this.listBySessionStmt.all({
      sessionId,
      limit: Math.max(1, Math.min(limit, 2000)),
    }) as unknown as ChatToolRunRow[];
    return rows.map(mapRow);
  }
}

function mapRow(row: ChatToolRunRow): ChatToolRunRecord {
  return {
    toolRunId: row.tool_run_id,
    turnId: row.turn_id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    status: row.status,
    approvalId: row.approval_id ?? undefined,
    args: row.args_json ? safeJsonParse<Record<string, unknown>>(row.args_json, {}) : undefined,
    result: row.result_json ? safeJsonParse<Record<string, unknown>>(row.result_json, {}) : undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
