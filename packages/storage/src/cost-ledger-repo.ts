import type { DatabaseSync } from "node:sqlite";

export interface CostLedgerRecord {
  sessionId: string;
  agentId?: string;
  taskId?: string;
  tokenInput: number;
  tokenOutput: number;
  tokenCachedInput: number;
  costUsd: number;
  createdAt: string;
}

export interface CostSummary {
  scope: "session" | "day" | "agent" | "task";
  key: string;
  tokenInput: number;
  tokenOutput: number;
  tokenCachedInput: number;
  tokenTotal: number;
  costUsd: number;
}

export class CostLedgerRepository {
  private readonly insertStmt;
  private readonly summaryByDayStmt;
  private readonly summaryBySessionStmt;
  private readonly summaryByAgentStmt;
  private readonly summaryByTaskStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO cost_ledger (
        session_id, agent_id, task_id, day,
        token_input, token_output, token_cached_input, cost_usd, created_at
      ) VALUES (
        @sessionId, @agentId, @taskId, @day,
        @tokenInput, @tokenOutput, @tokenCachedInput, @costUsd, @createdAt
      )
    `);

    this.summaryByDayStmt = db.prepare(`
      SELECT
        day AS key,
        SUM(token_input) AS token_input,
        SUM(token_output) AS token_output,
        SUM(token_cached_input) AS token_cached_input,
        SUM(cost_usd) AS cost_usd
      FROM cost_ledger
      WHERE day >= @fromDay AND day <= @toDay
      GROUP BY day
      ORDER BY day DESC
    `);

    this.summaryBySessionStmt = db.prepare(`
      SELECT
        session_id AS key,
        SUM(token_input) AS token_input,
        SUM(token_output) AS token_output,
        SUM(token_cached_input) AS token_cached_input,
        SUM(cost_usd) AS cost_usd
      FROM cost_ledger
      WHERE created_at >= @from AND created_at <= @to
      GROUP BY session_id
      ORDER BY SUM(cost_usd) DESC
    `);

    this.summaryByAgentStmt = db.prepare(`
      SELECT
        agent_id AS key,
        SUM(token_input) AS token_input,
        SUM(token_output) AS token_output,
        SUM(token_cached_input) AS token_cached_input,
        SUM(cost_usd) AS cost_usd
      FROM cost_ledger
      WHERE created_at >= @from AND created_at <= @to AND agent_id IS NOT NULL
      GROUP BY agent_id
      ORDER BY SUM(cost_usd) DESC
    `);

    this.summaryByTaskStmt = db.prepare(`
      SELECT
        task_id AS key,
        SUM(token_input) AS token_input,
        SUM(token_output) AS token_output,
        SUM(token_cached_input) AS token_cached_input,
        SUM(cost_usd) AS cost_usd
      FROM cost_ledger
      WHERE created_at >= @from AND created_at <= @to AND task_id IS NOT NULL
      GROUP BY task_id
      ORDER BY SUM(cost_usd) DESC
    `);
  }

  public insert(record: CostLedgerRecord): void {
    const day = record.createdAt.slice(0, 10);
    this.insertStmt.run({
      ...record,
      day,
      agentId: record.agentId ?? null,
      taskId: record.taskId ?? null,
    });
  }

  public summary(scope: CostSummary["scope"], fromIso: string, toIso: string): CostSummary[] {
    if (scope === "day") {
      const rows = this.summaryByDayStmt.all({
        fromDay: fromIso.slice(0, 10),
        toDay: toIso.slice(0, 10),
      }) as unknown as SummaryRow[];
      return rows.map((row) => mapSummaryRow(scope, row));
    }
    if (scope === "session") {
      const rows = this.summaryBySessionStmt.all({ from: fromIso, to: toIso }) as unknown as SummaryRow[];
      return rows.map((row) => mapSummaryRow(scope, row));
    }
    if (scope === "agent") {
      const rows = this.summaryByAgentStmt.all({ from: fromIso, to: toIso }) as unknown as SummaryRow[];
      return rows.map((row) => mapSummaryRow(scope, row));
    }

    const rows = this.summaryByTaskStmt.all({ from: fromIso, to: toIso }) as unknown as SummaryRow[];
    return rows.map((row) => mapSummaryRow(scope, row));
  }
}

interface SummaryRow {
  key: string;
  token_input: number;
  token_output: number;
  token_cached_input: number;
  cost_usd: number;
}

function mapSummaryRow(scope: CostSummary["scope"], row: SummaryRow): CostSummary {
  const tokenInput = Number(row.token_input ?? 0);
  const tokenOutput = Number(row.token_output ?? 0);
  const tokenCachedInput = Number(row.token_cached_input ?? 0);
  return {
    scope,
    key: row.key,
    tokenInput,
    tokenOutput,
    tokenCachedInput,
    tokenTotal: tokenInput + tokenOutput,
    costUsd: Number(row.cost_usd ?? 0),
  };
}
