import type { DatabaseSync } from "node:sqlite";
import type { ChatCitationRecord, ChatTurnTraceRecord, PromptPackRunRecord } from "@goatcitadel/contracts";

interface PromptPackRunRow {
  run_id: string;
  pack_id: string;
  test_id: string;
  session_id: string | null;
  status: PromptPackRunRecord["status"];
  provider_id: string | null;
  model: string | null;
  response_text: string | null;
  trace_json: string | null;
  citations_json: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export class PromptPackRunRepository {
  private readonly getStmt;
  private readonly insertStmt;
  private readonly patchStmt;
  private readonly listByPackStmt;
  private readonly listByTestStmt;
  private readonly deleteByPackStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare("SELECT * FROM prompt_pack_runs WHERE run_id = ?");
    this.insertStmt = db.prepare(`
      INSERT INTO prompt_pack_runs (
        run_id, pack_id, test_id, session_id, status, provider_id, model, response_text,
        trace_json, citations_json, error, started_at, finished_at
      ) VALUES (
        @runId, @packId, @testId, @sessionId, @status, @providerId, @model, @responseText,
        @traceJson, @citationsJson, @error, @startedAt, @finishedAt
      )
    `);
    this.patchStmt = db.prepare(`
      UPDATE prompt_pack_runs
      SET
        status = COALESCE(@status, status),
        response_text = CASE WHEN @hasResponseText = 1 THEN @responseText ELSE response_text END,
        trace_json = CASE WHEN @hasTrace = 1 THEN @traceJson ELSE trace_json END,
        citations_json = CASE WHEN @hasCitations = 1 THEN @citationsJson ELSE citations_json END,
        error = CASE WHEN @hasError = 1 THEN @error ELSE error END,
        finished_at = CASE WHEN @hasFinishedAt = 1 THEN @finishedAt ELSE finished_at END
      WHERE run_id = @runId
    `);
    this.listByPackStmt = db.prepare(`
      SELECT * FROM prompt_pack_runs
      WHERE pack_id = @packId
      ORDER BY started_at DESC
      LIMIT @limit
    `);
    this.listByTestStmt = db.prepare(`
      SELECT * FROM prompt_pack_runs
      WHERE test_id = @testId
      ORDER BY started_at DESC
      LIMIT @limit
    `);
    this.deleteByPackStmt = db.prepare("DELETE FROM prompt_pack_runs WHERE pack_id = ?");
  }

  public get(runId: string): PromptPackRunRecord {
    const row = this.getStmt.get(runId) as PromptPackRunRow | undefined;
    if (!row) {
      throw new Error(`Prompt pack run ${runId} not found`);
    }
    return mapRow(row);
  }

  public create(input: {
    runId: string;
    packId: string;
    testId: string;
    sessionId?: string;
    status?: PromptPackRunRecord["status"];
    providerId?: string;
    model?: string;
    responseText?: string;
    trace?: ChatTurnTraceRecord;
    citations?: ChatCitationRecord[];
    error?: string;
    startedAt?: string;
    finishedAt?: string;
  }): PromptPackRunRecord {
    this.insertStmt.run({
      runId: input.runId,
      packId: input.packId,
      testId: input.testId,
      sessionId: input.sessionId ?? null,
      status: input.status ?? "queued",
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      responseText: input.responseText ?? null,
      traceJson: input.trace ? JSON.stringify(input.trace) : null,
      citationsJson: input.citations ? JSON.stringify(input.citations) : null,
      error: input.error ?? null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      finishedAt: input.finishedAt ?? null,
    });
    return this.get(input.runId);
  }

  public patch(runId: string, input: {
    status?: PromptPackRunRecord["status"];
    responseText?: string;
    trace?: ChatTurnTraceRecord;
    citations?: ChatCitationRecord[];
    error?: string;
    finishedAt?: string;
  }): PromptPackRunRecord {
    const result = this.patchStmt.run({
      runId,
      status: input.status ?? null,
      hasResponseText: input.responseText !== undefined ? 1 : 0,
      responseText: input.responseText ?? null,
      hasTrace: input.trace !== undefined ? 1 : 0,
      traceJson: input.trace !== undefined ? JSON.stringify(input.trace) : null,
      hasCitations: input.citations !== undefined ? 1 : 0,
      citationsJson: input.citations !== undefined ? JSON.stringify(input.citations) : null,
      hasError: input.error !== undefined ? 1 : 0,
      error: input.error ?? null,
      hasFinishedAt: input.finishedAt !== undefined ? 1 : 0,
      finishedAt: input.finishedAt ?? null,
    });
    if (Number(result.changes ?? 0) < 1) {
      throw new Error(`Prompt pack run ${runId} not found`);
    }
    return this.get(runId);
  }

  public listByPack(packId: string, limit = 500): PromptPackRunRecord[] {
    const rows = this.listByPackStmt.all({
      packId,
      limit: Math.max(1, Math.min(limit, 5000)),
    }) as unknown as PromptPackRunRow[];
    return rows.map(mapRow);
  }

  public listByTest(testId: string, limit = 100): PromptPackRunRecord[] {
    const rows = this.listByTestStmt.all({
      testId,
      limit: Math.max(1, Math.min(limit, 5000)),
    }) as unknown as PromptPackRunRow[];
    return rows.map(mapRow);
  }

  public deleteByPack(packId: string): number {
    const result = this.deleteByPackStmt.run(packId);
    return Number(result.changes ?? 0);
  }
}

function mapRow(row: PromptPackRunRow): PromptPackRunRecord {
  return {
    runId: row.run_id,
    packId: row.pack_id,
    testId: row.test_id,
    sessionId: row.session_id ?? undefined,
    status: row.status,
    providerId: row.provider_id ?? undefined,
    model: row.model ?? undefined,
    responseText: row.response_text ?? undefined,
    trace: row.trace_json ? safeJsonParse<ChatTurnTraceRecord | undefined>(row.trace_json, undefined) : undefined,
    citations: row.citations_json ? safeJsonParse<ChatCitationRecord[] | undefined>(row.citations_json, undefined) : undefined,
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
