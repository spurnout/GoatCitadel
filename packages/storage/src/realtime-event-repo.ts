import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { RealtimeEvent } from "@personal-ai/contracts";

interface RealtimeEventRow {
  event_id: string;
  event_type: string;
  source: string;
  payload_json: string;
  created_at: string;
}

export class RealtimeEventRepository {
  private readonly insertStmt;
  private readonly listStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO realtime_events (
        event_id, event_type, source, payload_json, created_at
      ) VALUES (
        @eventId, @eventType, @source, @payloadJson, @createdAt
      )
    `);

    this.listStmt = db.prepare(`
      SELECT * FROM realtime_events
      WHERE (@cursor IS NULL OR created_at < @cursor)
      ORDER BY created_at DESC
      LIMIT @limit
    `);
  }

  public append(
    eventType: string,
    source: string,
    payload: Record<string, unknown>,
    createdAt = new Date().toISOString(),
  ): RealtimeEvent {
    const eventId = randomUUID();
    this.insertStmt.run({
      eventId,
      eventType,
      source,
      payloadJson: JSON.stringify(payload),
      createdAt,
    });

    return {
      eventId,
      eventType,
      source,
      timestamp: createdAt,
      payload,
    };
  }

  public list(limit: number, cursor?: string): RealtimeEvent[] {
    const rows = this.listStmt.all({
      limit,
      cursor: cursor ?? null,
    }) as unknown as RealtimeEventRow[];

    return rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      source: row.source,
      timestamp: row.created_at,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }));
  }
}
