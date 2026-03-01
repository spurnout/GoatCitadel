import type { DatabaseSync } from "node:sqlite";
import type { ChatCitationRecord, ChatDelegationMode, ChatDelegationRunRecord, ChatDelegationRunStatus, ChatTurnTraceRecord } from "@goatcitadel/contracts";

interface ChatDelegationRunRow {
  run_id: string;
  session_id: string;
  task_id: string;
  objective: string;
  roles_json: string;
  mode: ChatDelegationMode;
  provider_id: string | null;
  model: string | null;
  status: ChatDelegationRunStatus;
  stitched_output: string | null;
  citations_json: string;
  trace_json: string | null;
  started_at: string;
  finished_at: string | null;
}

export class ChatDelegationRunRepository {
  private readonly getStmt;
  private readonly insertStmt;
  private readonly patchStmt;
  private readonly listBySessionStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare("SELECT * FROM chat_delegation_runs WHERE run_id = ?");
    this.insertStmt = db.prepare(`
      INSERT INTO chat_delegation_runs (
        run_id, session_id, task_id, objective, roles_json, mode, provider_id, model, status,
        stitched_output, citations_json, trace_json, started_at, finished_at
      ) VALUES (
        @runId, @sessionId, @taskId, @objective, @rolesJson, @mode, @providerId, @model, @status,
        @stitchedOutput, @citationsJson, @traceJson, @startedAt, @finishedAt
      )
    `);
    this.patchStmt = db.prepare(`
      UPDATE chat_delegation_runs
      SET
        status = @status,
        stitched_output = @stitchedOutput,
        citations_json = @citationsJson,
        trace_json = @traceJson,
        finished_at = @finishedAt
      WHERE run_id = @runId
    `);
    this.listBySessionStmt = db.prepare(`
      SELECT * FROM chat_delegation_runs
      WHERE session_id = @sessionId
      ORDER BY started_at DESC
      LIMIT @limit
    `);
  }

  public get(runId: string): ChatDelegationRunRecord {
    const row = this.getStmt.get(runId) as ChatDelegationRunRow | undefined;
    if (!row) {
      throw new Error(`Delegation run ${runId} not found`);
    }
    return mapRow(row);
  }

  public create(input: {
    runId: string;
    sessionId: string;
    taskId: string;
    objective: string;
    roles: string[];
    mode: ChatDelegationMode;
    providerId?: string;
    model?: string;
    status?: ChatDelegationRunStatus;
    stitchedOutput?: string;
    citations?: ChatCitationRecord[];
    trace?: ChatTurnTraceRecord["routing"];
    startedAt?: string;
    finishedAt?: string;
  }): ChatDelegationRunRecord {
    this.insertStmt.run({
      runId: input.runId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      objective: input.objective,
      rolesJson: JSON.stringify(input.roles),
      mode: input.mode,
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      status: input.status ?? "running",
      stitchedOutput: input.stitchedOutput ?? null,
      citationsJson: JSON.stringify(input.citations ?? []),
      traceJson: input.trace ? JSON.stringify(input.trace) : null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      finishedAt: input.finishedAt ?? null,
    });
    return this.get(input.runId);
  }

  public patch(runId: string, input: {
    status?: ChatDelegationRunStatus;
    stitchedOutput?: string;
    citations?: ChatCitationRecord[];
    trace?: ChatTurnTraceRecord["routing"];
    finishedAt?: string;
  }): ChatDelegationRunRecord {
    const current = this.get(runId);
    this.patchStmt.run({
      runId,
      status: input.status ?? current.status,
      stitchedOutput: input.stitchedOutput !== undefined ? input.stitchedOutput : (current.stitchedOutput ?? null),
      citationsJson: JSON.stringify(input.citations ?? current.citations),
      traceJson: JSON.stringify(input.trace ?? current.trace ?? {}),
      finishedAt: input.finishedAt !== undefined ? input.finishedAt : (current.finishedAt ?? null),
    });
    return this.get(runId);
  }

  public listBySession(sessionId: string, limit = 100): ChatDelegationRunRecord[] {
    const rows = this.listBySessionStmt.all({
      sessionId,
      limit: Math.max(1, Math.min(limit, 1000)),
    }) as unknown as ChatDelegationRunRow[];
    return rows.map(mapRow);
  }
}

function mapRow(row: ChatDelegationRunRow): ChatDelegationRunRecord {
  return {
    runId: row.run_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    objective: row.objective,
    roles: safeJsonParse<string[]>(row.roles_json, []),
    mode: row.mode,
    providerId: row.provider_id ?? undefined,
    model: row.model ?? undefined,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    stitchedOutput: row.stitched_output ?? undefined,
    citations: safeJsonParse<ChatCitationRecord[]>(row.citations_json, []),
    trace: row.trace_json ? safeJsonParse<ChatTurnTraceRecord["routing"]>(row.trace_json, {}) : undefined,
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

