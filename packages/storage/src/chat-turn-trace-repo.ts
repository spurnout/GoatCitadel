import type { DatabaseSync } from "node:sqlite";
import type { ChatCitationRecord, ChatMode, ChatThinkingLevel, ChatTurnTraceRecord, ChatWebMode, ChatMemoryMode } from "@goatcitadel/contracts";

interface ChatTurnTraceRow {
  turn_id: string;
  session_id: string;
  user_message_id: string;
  assistant_message_id: string | null;
  status: ChatTurnTraceRecord["status"];
  mode: ChatMode;
  model: string | null;
  web_mode: ChatWebMode;
  memory_mode: ChatMemoryMode;
  thinking_level: ChatThinkingLevel;
  routing_json: string;
  retrieval_json: string | null;
  reflection_json: string | null;
  proactive_json: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ChatTurnTraceCreateInput {
  turnId: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId?: string;
  status?: ChatTurnTraceRecord["status"];
  mode: ChatMode;
  model?: string;
  webMode: ChatWebMode;
  memoryMode: ChatMemoryMode;
  thinkingLevel: ChatThinkingLevel;
  routing?: ChatTurnTraceRecord["routing"];
  retrieval?: ChatTurnTraceRecord["retrieval"];
  reflection?: ChatTurnTraceRecord["reflection"];
  proactive?: ChatTurnTraceRecord["proactive"];
  startedAt?: string;
  finishedAt?: string;
}

export interface ChatTurnTracePatchInput {
  assistantMessageId?: string;
  status?: ChatTurnTraceRecord["status"];
  model?: string;
  routing?: ChatTurnTraceRecord["routing"];
  retrieval?: ChatTurnTraceRecord["retrieval"];
  reflection?: ChatTurnTraceRecord["reflection"];
  proactive?: ChatTurnTraceRecord["proactive"];
  finishedAt?: string;
}

export class ChatTurnTraceRepository {
  private readonly getStmt;
  private readonly insertStmt;
  private readonly patchStmt;
  private readonly listBySessionStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare("SELECT * FROM chat_turn_traces WHERE turn_id = ?");
    this.insertStmt = db.prepare(`
      INSERT INTO chat_turn_traces (
        turn_id, session_id, user_message_id, assistant_message_id, status, mode, model,
        web_mode, memory_mode, thinking_level, routing_json, retrieval_json, reflection_json, proactive_json, started_at, finished_at
      ) VALUES (
        @turnId, @sessionId, @userMessageId, @assistantMessageId, @status, @mode, @model,
        @webMode, @memoryMode, @thinkingLevel, @routingJson, @retrievalJson, @reflectionJson, @proactiveJson, @startedAt, @finishedAt
      )
    `);
    this.patchStmt = db.prepare(`
      UPDATE chat_turn_traces
      SET
        assistant_message_id = @assistantMessageId,
        status = @status,
        model = @model,
        routing_json = @routingJson,
        retrieval_json = @retrievalJson,
        reflection_json = @reflectionJson,
        proactive_json = @proactiveJson,
        finished_at = @finishedAt
      WHERE turn_id = @turnId
    `);
    this.listBySessionStmt = db.prepare(`
      SELECT * FROM chat_turn_traces
      WHERE session_id = @sessionId
      ORDER BY started_at DESC
      LIMIT @limit
    `);
  }

  public get(turnId: string): ChatTurnTraceRecord {
    const row = this.getStmt.get(turnId) as ChatTurnTraceRow | undefined;
    if (!row) {
      throw new Error(`Chat turn trace ${turnId} not found`);
    }
    return mapRow(row);
  }

  public create(input: ChatTurnTraceCreateInput): ChatTurnTraceRecord {
    this.insertStmt.run({
      turnId: input.turnId,
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId ?? null,
      status: input.status ?? "running",
      mode: input.mode,
      model: input.model ?? null,
      webMode: input.webMode,
      memoryMode: input.memoryMode,
      thinkingLevel: input.thinkingLevel,
      routingJson: JSON.stringify(input.routing ?? {}),
      retrievalJson: input.retrieval ? JSON.stringify(input.retrieval) : null,
      reflectionJson: input.reflection ? JSON.stringify(input.reflection) : null,
      proactiveJson: input.proactive ? JSON.stringify(input.proactive) : null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      finishedAt: input.finishedAt ?? null,
    });
    return this.get(input.turnId);
  }

  public patch(turnId: string, input: ChatTurnTracePatchInput): ChatTurnTraceRecord {
    const current = this.get(turnId);
    this.patchStmt.run({
      turnId,
      assistantMessageId: input.assistantMessageId !== undefined
        ? input.assistantMessageId
        : (current.assistantMessageId ?? null),
      status: input.status ?? current.status,
      model: input.model !== undefined ? input.model : (current.model ?? null),
      routingJson: JSON.stringify(input.routing ?? current.routing),
      retrievalJson: JSON.stringify(input.retrieval ?? current.retrieval ?? null),
      reflectionJson: JSON.stringify(input.reflection ?? current.reflection ?? null),
      proactiveJson: JSON.stringify(input.proactive ?? current.proactive ?? null),
      finishedAt: input.finishedAt !== undefined ? input.finishedAt : (current.finishedAt ?? null),
    });
    return this.get(turnId);
  }

  public listBySession(sessionId: string, limit = 100): ChatTurnTraceRecord[] {
    const rows = this.listBySessionStmt.all({
      sessionId,
      limit: Math.max(1, Math.min(limit, 1000)),
    }) as unknown as ChatTurnTraceRow[];
    return rows.map(mapRow);
  }
}

function mapRow(row: ChatTurnTraceRow): ChatTurnTraceRecord {
  return {
    turnId: row.turn_id,
    sessionId: row.session_id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id ?? undefined,
    status: row.status,
    mode: row.mode,
    model: row.model ?? undefined,
    webMode: row.web_mode,
    memoryMode: row.memory_mode,
    thinkingLevel: row.thinking_level,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    toolRuns: [],
    citations: [],
    routing: safeJsonParse<ChatTurnTraceRecord["routing"]>(row.routing_json, {}),
    retrieval: safeJsonParse<ChatTurnTraceRecord["retrieval"] | undefined>(row.retrieval_json ?? "", undefined),
    reflection: safeJsonParse<ChatTurnTraceRecord["reflection"] | undefined>(row.reflection_json ?? "", undefined),
    proactive: safeJsonParse<ChatTurnTraceRecord["proactive"] | undefined>(row.proactive_json ?? "", undefined),
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function attachTurnTraceDetails(
  trace: ChatTurnTraceRecord,
  details: {
    toolRuns?: ChatTurnTraceRecord["toolRuns"];
    citations?: ChatCitationRecord[];
  },
): ChatTurnTraceRecord {
  return {
    ...trace,
    toolRuns: details.toolRuns ?? trace.toolRuns,
    citations: details.citations ?? trace.citations,
  };
}
