import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type {
  GatewayEventInput,
  GatewayEventResult,
  InboundEventIndexRow,
  TranscriptEvent,
} from "@goatcitadel/contracts";
import type { Storage } from "@goatcitadel/storage";
import { resolveSessionRoute } from "./session-key.js";
import { TokenCostLedger } from "./token-cost-ledger.js";

export interface EventIngestOptions {
  endpoint: string;
  idempotencyKey: string;
  payload: GatewayEventInput;
}

export class EventIngestService {
  private readonly tokenCostLedger: TokenCostLedger;

  public constructor(private readonly storage: Storage) {
    this.tokenCostLedger = new TokenCostLedger(storage.costLedger);
  }

  public async ingest(options: EventIngestOptions): Promise<GatewayEventResult> {
    const now = new Date().toISOString();
    const route = resolveSessionRoute(options.payload.route);
    const payloadHash = hashPayload(options.payload);
    const idempotencyRow: InboundEventIndexRow = {
      endpoint: options.endpoint,
      idempotencyKey: options.idempotencyKey,
      eventId: options.payload.eventId,
      sessionKey: route.sessionKey,
      payloadHash,
      receivedAt: now,
      status: "accepted",
    };

    const transcriptEvent: TranscriptEvent = {
      eventId: options.payload.eventId,
      actionId: randomUUID(),
      idempotencyKey: options.idempotencyKey,
      sessionId: route.sessionId,
      sessionKey: route.sessionKey,
      timestamp: now,
      type:
        options.payload.message.role === "user"
          ? "message.user"
          : "message.assistant",
      actorType: options.payload.actor.type,
      actorId: options.payload.actor.id,
      payload: {
        message: options.payload.message,
        taskId: options.payload.taskId,
      },
      tokenInput: options.payload.usage?.inputTokens,
      tokenOutput: options.payload.usage?.outputTokens,
      costUsd: options.payload.usage?.costUsd,
    };

    try {
      this.storage.db.exec("BEGIN IMMEDIATE");

      const existing = this.storage.idempotency.find(options.endpoint, options.idempotencyKey);
      if (existing) {
        const session = this.storage.sessions.getBySessionKey(existing.sessionKey);
        this.storage.idempotency.markProcessed(
          options.endpoint,
          options.idempotencyKey,
          "deduped",
          now,
        );
        this.storage.db.exec("COMMIT");
        return {
          accepted: true,
          deduped: true,
          session,
          transcriptOffset: 0,
        };
      }

      const inserted = this.storage.idempotency.insertPendingIfAbsent(idempotencyRow);
      if (!inserted) {
        const concurrent = this.storage.idempotency.find(options.endpoint, options.idempotencyKey);
        if (concurrent) {
          const session = this.storage.sessions.getBySessionKey(concurrent.sessionKey);
          this.storage.idempotency.markProcessed(
            options.endpoint,
            options.idempotencyKey,
            "deduped",
            now,
          );
          this.storage.db.exec("COMMIT");
          return {
            accepted: true,
            deduped: true,
            session,
            transcriptOffset: 0,
          };
        }
      }

      this.storage.sessions.upsert({
        sessionId: route.sessionId,
        sessionKey: route.sessionKey,
        kind: route.kind,
        channel: options.payload.route.channel,
        account: options.payload.route.account,
        timestamp: now,
      });

      const transcriptOffset = await this.storage.transcripts.append(transcriptEvent);

      this.storage.sessions.applyUsage({
        sessionId: route.sessionId,
        tokenInput: options.payload.usage?.inputTokens ?? 0,
        tokenOutput: options.payload.usage?.outputTokens ?? 0,
        tokenCachedInput: options.payload.usage?.cachedInputTokens ?? 0,
        costUsd: options.payload.usage?.costUsd ?? 0,
        timestamp: now,
      });

      this.tokenCostLedger.record({
        sessionId: route.sessionId,
        agentId: options.payload.actor.type === "agent" ? options.payload.actor.id : undefined,
        taskId: options.payload.taskId,
        tokenInput: options.payload.usage?.inputTokens,
        tokenOutput: options.payload.usage?.outputTokens,
        tokenCachedInput: options.payload.usage?.cachedInputTokens,
        costUsd: options.payload.usage?.costUsd,
        timestamp: now,
      });

      this.storage.idempotency.markProcessed(
        options.endpoint,
        options.idempotencyKey,
        "accepted",
        now,
      );
      this.storage.db.exec("COMMIT");
      return {
        accepted: true,
        deduped: false,
        session: this.storage.sessions.getBySessionId(route.sessionId),
        transcriptOffset,
      };
    } catch (error) {
      try {
        this.storage.db.exec("ROLLBACK");
      } catch {
        // ignore rollback failures
      }
      throw error;
    }
  }
}

function hashPayload(payload: GatewayEventInput): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
