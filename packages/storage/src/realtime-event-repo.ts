import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { RealtimeEvent } from "@goatcitadel/contracts";

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
  private readonly pruneStmt;
  private readonly pruneOlderThanStmt;
  private appendCount = 0;

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
      WHERE (
        @cursorCreatedAt IS NULL
        OR created_at < @cursorCreatedAt
        OR (created_at = @cursorCreatedAt AND event_id < @cursorEventId)
      )
      ORDER BY created_at DESC, event_id DESC
      LIMIT @limit
    `);

    this.pruneStmt = db.prepare(`
      DELETE FROM realtime_events
      WHERE event_id IN (
        SELECT event_id FROM realtime_events
        ORDER BY created_at DESC, event_id DESC
        LIMIT -1 OFFSET @maxRows
      )
    `);
    this.pruneOlderThanStmt = db.prepare(`
      DELETE FROM realtime_events
      WHERE created_at < @cutoff
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
    this.appendCount += 1;
    if (this.appendCount % 100 === 0) {
      this.pruneStmt.run({ maxRows: 10000 });
    }

    return {
      eventId,
      eventType,
      source,
      timestamp: createdAt,
      payload,
    };
  }

  public list(limit: number, cursor?: string): RealtimeEvent[] {
    const parsedCursor = parseCompositeCursor(cursor);
    const rows = this.listStmt.all({
      limit,
      cursorCreatedAt: parsedCursor?.timestamp ?? null,
      cursorEventId: parsedCursor?.key ?? null,
    }) as unknown as RealtimeEventRow[];

    return rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      source: row.source,
      timestamp: row.created_at,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }));
  }

  public pruneOlderThan(cutoffIso: string): number {
    const before = this.db.prepare("SELECT COUNT(*) AS count FROM realtime_events WHERE created_at < ?")
      .get(cutoffIso) as { count: number } | undefined;
    const count = Number(before?.count ?? 0);
    if (count <= 0) {
      return 0;
    }
    this.pruneOlderThanStmt.run({ cutoff: cutoffIso });
    return count;
  }
}

interface CompositeCursor {
  timestamp: string;
  key: string;
}

function parseCompositeCursor(cursor?: string): CompositeCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  const separator = cursor.lastIndexOf("|");
  if (separator <= 0) {
    return {
      timestamp: cursor,
      key: "",
    };
  }

  const timestamp = cursor.slice(0, separator);
  const key = cursor.slice(separator + 1);
  if (!timestamp || !key) {
    return undefined;
  }

  return { timestamp, key };
}
