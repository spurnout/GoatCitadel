import type { SessionMeta } from "@personal-ai/contracts";
import type { DatabaseSync } from "node:sqlite";

interface SessionRow {
  session_id: string;
  session_key: string;
  kind: "dm" | "group" | "thread";
  channel: string;
  account: string;
  display_name: string | null;
  routing_hints_json: string | null;
  last_activity_at: string;
  updated_at: string;
  health: SessionMeta["health"];
  token_input: number;
  token_output: number;
  token_cached_input: number;
  token_total: number;
  cost_usd_total: number;
  budget_state: SessionMeta["budgetState"];
}

export interface SessionUpsertInput {
  sessionId: string;
  sessionKey: string;
  kind: SessionMeta["kind"];
  channel: string;
  account: string;
  displayName?: string;
  routingHints?: Record<string, string>;
  timestamp: string;
}

export interface SessionUsageDelta {
  sessionId: string;
  tokenInput: number;
  tokenOutput: number;
  tokenCachedInput: number;
  costUsd: number;
  timestamp: string;
}

export class SessionRepository {
  private readonly getByKeyStmt;
  private readonly getByIdStmt;
  private readonly upsertStmt;
  private readonly applyUsageStmt;
  private readonly listStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getByKeyStmt = db.prepare("SELECT * FROM sessions WHERE session_key = ?");
    this.getByIdStmt = db.prepare("SELECT * FROM sessions WHERE session_id = ?");
    this.upsertStmt = db.prepare(`
      INSERT INTO sessions (
        session_id, session_key, kind, channel, account, display_name, routing_hints_json,
        last_activity_at, updated_at
      ) VALUES (@sessionId, @sessionKey, @kind, @channel, @account, @displayName, @routingHintsJson, @timestamp, @timestamp)
      ON CONFLICT(session_key) DO UPDATE SET
        display_name = excluded.display_name,
        routing_hints_json = excluded.routing_hints_json,
        last_activity_at = excluded.last_activity_at,
        updated_at = excluded.updated_at
    `);
    this.applyUsageStmt = db.prepare(`
      UPDATE sessions
      SET
        token_input = token_input + @tokenInput,
        token_output = token_output + @tokenOutput,
        token_cached_input = token_cached_input + @tokenCachedInput,
        token_total = token_total + (@tokenInput + @tokenOutput),
        cost_usd_total = cost_usd_total + @costUsd,
        last_activity_at = @timestamp,
        updated_at = @timestamp
      WHERE session_id = @sessionId
    `);
    this.listStmt = db.prepare(`
      SELECT * FROM sessions
      WHERE (@cursor IS NULL OR updated_at < @cursor)
      ORDER BY updated_at DESC
      LIMIT @limit
    `);
  }

  public upsert(input: SessionUpsertInput): SessionMeta {
    this.upsertStmt.run({
      sessionId: input.sessionId,
      sessionKey: input.sessionKey,
      kind: input.kind,
      channel: input.channel,
      account: input.account,
      displayName: input.displayName ?? null,
      routingHintsJson: input.routingHints ? JSON.stringify(input.routingHints) : null,
      timestamp: input.timestamp,
    });

    return this.getBySessionKey(input.sessionKey);
  }

  public applyUsage(delta: SessionUsageDelta): void {
    this.applyUsageStmt.run(
      delta as unknown as Record<string, string | number | null>,
    );
  }

  public getBySessionKey(sessionKey: string): SessionMeta {
    const row = this.getByKeyStmt.get(sessionKey) as SessionRow | undefined;
    if (!row) {
      throw new Error(`Session not found for key: ${sessionKey}`);
    }

    return mapSessionRow(row);
  }

  public getBySessionId(sessionId: string): SessionMeta {
    const row = this.getByIdStmt.get(sessionId) as SessionRow | undefined;
    if (!row) {
      throw new Error(`Session not found for id: ${sessionId}`);
    }

    return mapSessionRow(row);
  }

  public list(limit: number, cursor?: string): SessionMeta[] {
    const rows = this.listStmt.all({
      limit,
      cursor: cursor ?? null,
    }) as unknown as SessionRow[];

    return rows.map(mapSessionRow);
  }
}

function mapSessionRow(row: SessionRow): SessionMeta {
  return {
    sessionId: row.session_id,
    sessionKey: row.session_key,
    kind: row.kind,
    channel: row.channel,
    account: row.account,
    displayName: row.display_name ?? undefined,
    routingHints: row.routing_hints_json ? (JSON.parse(row.routing_hints_json) as Record<string, string>) : undefined,
    lastActivityAt: row.last_activity_at,
    updatedAt: row.updated_at,
    health: row.health,
    tokenInput: row.token_input,
    tokenOutput: row.token_output,
    tokenCachedInput: row.token_cached_input,
    tokenTotal: row.token_total,
    costUsdTotal: row.cost_usd_total,
    budgetState: row.budget_state,
  };
}
