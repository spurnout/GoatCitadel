import type { DatabaseSync } from "node:sqlite";
import type { ChatDelegationStepRecord, ChatDelegationStepStatus } from "@goatcitadel/contracts";

interface ChatDelegationStepRow {
  step_id: string;
  run_id: string;
  role: string;
  step_index: number;
  status: ChatDelegationStepStatus;
  output: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export class ChatDelegationStepRepository {
  private readonly getStmt;
  private readonly insertStmt;
  private readonly patchStmt;
  private readonly listByRunStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare("SELECT * FROM chat_delegation_steps WHERE step_id = ?");
    this.insertStmt = db.prepare(`
      INSERT INTO chat_delegation_steps (
        step_id, run_id, role, step_index, status, output, error, started_at, finished_at, duration_ms
      ) VALUES (
        @stepId, @runId, @role, @index, @status, @output, @error, @startedAt, @finishedAt, @durationMs
      )
    `);
    this.patchStmt = db.prepare(`
      UPDATE chat_delegation_steps
      SET
        status = @status,
        output = @output,
        error = @error,
        finished_at = @finishedAt,
        duration_ms = @durationMs
      WHERE step_id = @stepId
    `);
    this.listByRunStmt = db.prepare(`
      SELECT * FROM chat_delegation_steps
      WHERE run_id = @runId
      ORDER BY step_index ASC, started_at ASC
    `);
  }

  public get(stepId: string): ChatDelegationStepRecord {
    const row = this.getStmt.get(stepId) as ChatDelegationStepRow | undefined;
    if (!row) {
      throw new Error(`Delegation step ${stepId} not found`);
    }
    return mapRow(row);
  }

  public create(input: {
    stepId: string;
    runId: string;
    role: string;
    index: number;
    status?: ChatDelegationStepStatus;
    output?: string;
    error?: string;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
  }): ChatDelegationStepRecord {
    this.insertStmt.run({
      stepId: input.stepId,
      runId: input.runId,
      role: input.role,
      index: input.index,
      status: input.status ?? "pending",
      output: input.output ?? null,
      error: input.error ?? null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      finishedAt: input.finishedAt ?? null,
      durationMs: input.durationMs ?? null,
    });
    return this.get(input.stepId);
  }

  public patch(stepId: string, input: {
    status?: ChatDelegationStepStatus;
    output?: string;
    error?: string;
    finishedAt?: string;
    durationMs?: number;
  }): ChatDelegationStepRecord {
    const current = this.get(stepId);
    this.patchStmt.run({
      stepId,
      status: input.status ?? current.status,
      output: input.output !== undefined ? input.output : (current.output ?? null),
      error: input.error !== undefined ? input.error : (current.error ?? null),
      finishedAt: input.finishedAt !== undefined ? input.finishedAt : (current.finishedAt ?? null),
      durationMs: input.durationMs !== undefined ? input.durationMs : (current.durationMs ?? null),
    });
    return this.get(stepId);
  }

  public listByRun(runId: string): ChatDelegationStepRecord[] {
    const rows = this.listByRunStmt.all({ runId }) as unknown as ChatDelegationStepRow[];
    return rows.map(mapRow);
  }
}

function mapRow(row: ChatDelegationStepRow): ChatDelegationStepRecord {
  return {
    stepId: row.step_id,
    runId: row.run_id,
    role: row.role,
    status: row.status,
    index: row.step_index,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
  };
}

