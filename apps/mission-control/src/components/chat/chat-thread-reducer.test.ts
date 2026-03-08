import { describe, expect, it } from "vitest";
import type {
  ChatCitationRecord,
  ChatMessageRecord,
  ChatThreadResponse,
  ChatThreadTurnRecord,
  ChatToolRunRecord,
  ChatTurnTraceRecord,
} from "@goatcitadel/contracts";
import {
  isThreadMutatingStreamChunk,
  type PendingStreamTurnSeed,
  updateThreadFromStreamChunk,
} from "./chat-thread-reducer";

function makeMessage(
  messageId: string,
  role: "user" | "assistant",
  content: string,
): ChatMessageRecord {
  return {
    messageId,
    sessionId: "sess-1",
    role,
    actorType: role === "user" ? "user" : "agent",
    actorId: role === "user" ? "operator" : "assistant",
    content,
    timestamp: "2026-03-07T00:00:00.000Z",
  };
}

function makeToolRun(toolRunId = "tool-1"): ChatToolRunRecord {
  return {
    toolRunId,
    turnId: "turn-1",
    sessionId: "sess-1",
    toolName: "web.search",
    status: "started",
    startedAt: "2026-03-07T00:00:00.000Z",
  };
}

function makeCitation(): ChatCitationRecord {
  return {
    citationId: "citation-1",
    url: "https://example.com",
    title: "Example",
    snippet: "Snippet",
    sourceType: "web",
  };
}

function makeTrace(overrides: Partial<ChatTurnTraceRecord> = {}): ChatTurnTraceRecord {
  return {
    turnId: "turn-1",
    sessionId: "sess-1",
    userMessageId: "user-1",
    branchKind: "append",
    status: "running",
    mode: "chat",
    webMode: "auto",
    memoryMode: "auto",
    thinkingLevel: "standard",
    startedAt: "2026-03-07T00:00:00.000Z",
    toolRuns: [],
    citations: [],
    routing: {},
    ...overrides,
  };
}

function makeTurn(overrides: Partial<ChatThreadTurnRecord> = {}): ChatThreadTurnRecord {
  return {
    turnId: "turn-1",
    branchKind: "append",
    userMessage: makeMessage("user-1", "user", "hello"),
    assistantMessage: makeMessage("assistant-1", "assistant", ""),
    trace: makeTrace(),
    toolRuns: [],
    citations: [],
    branch: {
      siblingTurnIds: ["turn-1"],
      activeSiblingIndex: 0,
      siblingCount: 1,
      isSelectedPath: true,
      newestLeafTurnId: "turn-1",
    },
    ...overrides,
  };
}

function makeThread(overrides: Partial<ChatThreadResponse> = {}): ChatThreadResponse {
  return {
    sessionId: "sess-1",
    activeLeafTurnId: "turn-1",
    selectedTurnId: "turn-1",
    turns: [makeTurn()],
    ...overrides,
  };
}

function makeSeed(overrides: Partial<PendingStreamTurnSeed> = {}): PendingStreamTurnSeed {
  return {
    userMessage: makeMessage("user-1", "user", "hello"),
    branchKind: "append",
    mode: "send",
    ...overrides,
  };
}

describe("chat-thread-reducer", () => {
  it("creates an optimistic turn from message_start", () => {
    const next = updateThreadFromStreamChunk(
      null,
      {
        type: "message_start",
        sessionId: "sess-1",
        turnId: "turn-1",
        messageId: "assistant-1",
        branchKind: "append",
      },
      makeSeed(),
      "sess-1",
      null,
    );

    expect(next?.turns).toHaveLength(1);
    expect(next?.turns[0]?.assistantMessage?.messageId).toBe("assistant-1");
    expect(next?.activeLeafTurnId).toBe("turn-1");
  });

  it("ignores message_start when no seed is available", () => {
    const current = makeThread();
    const next = updateThreadFromStreamChunk(
      current,
      {
        type: "message_start",
        sessionId: "sess-1",
        turnId: "turn-2",
        messageId: "assistant-2",
        branchKind: "append",
      },
      null,
      "sess-1",
      null,
    );

    expect(next).toBe(current);
  });

  it("applies delta and message_done chunks to the matching turn", () => {
    const current = makeThread();
    const withDelta = updateThreadFromStreamChunk(
      current,
      {
        type: "delta",
        sessionId: "sess-1",
        turnId: "turn-1",
        messageId: "assistant-1",
        delta: "partial",
      },
      null,
      "sess-1",
      null,
    );
    const done = updateThreadFromStreamChunk(
      withDelta,
      {
        type: "message_done",
        sessionId: "sess-1",
        turnId: "turn-1",
        messageId: "assistant-1",
        content: "final answer",
      },
      null,
      "sess-1",
      null,
    );

    expect(withDelta?.turns[0]?.assistantMessage?.content).toBe("partial");
    expect(done?.turns[0]?.assistantMessage?.content).toBe("final answer");
  });

  it("applies tool, citation, capability, and trace updates", () => {
    const current = makeThread();
    const toolRun = makeToolRun();
    const citation = makeCitation();
    const withTool = updateThreadFromStreamChunk(
      current,
      {
        type: "tool_start",
        sessionId: "sess-1",
        turnId: "turn-1",
        toolRun,
      },
      null,
      "sess-1",
      null,
    );
    const withCitation = updateThreadFromStreamChunk(
      withTool,
      {
        type: "citation",
        sessionId: "sess-1",
        turnId: "turn-1",
        citation,
      },
      null,
      "sess-1",
      null,
    );
    const withSuggestion = updateThreadFromStreamChunk(
      withCitation,
      {
        type: "capability_upgrade_suggestion",
        sessionId: "sess-1",
        turnId: "turn-1",
        capabilityUpgradeSuggestions: [{
          kind: "existing_but_disabled",
          title: "Enable web",
          summary: "Enable web tools",
          reason: "Search needed",
          recommendedAction: "switch_tool_profile",
          requiresUserApproval: true,
        }],
      },
      null,
      "sess-1",
      null,
    );
    const trace = makeTrace({
      status: "completed",
      assistantMessageId: "assistant-1",
      toolRuns: [toolRun],
      citations: [citation],
    });
    const withTrace = updateThreadFromStreamChunk(
      withSuggestion,
      {
        type: "trace_update",
        sessionId: "sess-1",
        turnId: "turn-1",
        trace,
      },
      null,
      "sess-1",
      null,
    );

    expect(withTool?.turns[0]?.toolRuns).toHaveLength(1);
    expect(withCitation?.turns[0]?.citations).toHaveLength(1);
    expect(withSuggestion?.turns[0]?.trace.capabilityUpgradeSuggestions).toHaveLength(1);
    expect(withTrace?.turns[0]?.trace.status).toBe("completed");
  });

  it("returns the same object for no-op or irrelevant chunks", () => {
    const current = makeThread();
    const usageChunk = {
      type: "usage" as const,
      sessionId: "sess-1",
      turnId: "turn-1",
      usage: { inputTokens: 1 },
    };
    const wrongSession = {
      type: "delta" as const,
      sessionId: "sess-2",
      turnId: "turn-1",
      delta: "ignored",
    };

    expect(isThreadMutatingStreamChunk(usageChunk)).toBe(false);
    expect(updateThreadFromStreamChunk(current, usageChunk, null, "sess-1", null)).toBe(current);
    expect(updateThreadFromStreamChunk(current, wrongSession, null, "sess-1", null)).toBe(current);
  });
});
