import { describe, expect, it } from "vitest";
import type { ChatMessageRecord } from "@goatcitadel/contracts";
import { buildConversationCompactionSummary } from "./chat-compaction.js";

function createMessage(input: Pick<ChatMessageRecord, "role" | "content"> & { messageId: string }): ChatMessageRecord {
  return {
    messageId: input.messageId,
    sessionId: "sess-1",
    role: input.role,
    actorType: input.role === "assistant" ? "agent" : "user",
    actorId: input.role === "assistant" ? "assistant" : "operator",
    content: input.content,
    timestamp: "2026-03-12T10:00:00.000Z",
  };
}

describe("buildConversationCompactionSummary", () => {
  it("preserves decisions, failures, and notable artifacts", () => {
    const summary = buildConversationCompactionSummary([
      createMessage({
        messageId: "m1",
        role: "user",
        content: "We decided to keep the fallback on `browser.search` and avoid changing C:\\code\\personal-ai\\apps\\gateway\\src\\services\\chat-agent-orchestrator.ts.",
      }),
      createMessage({
        messageId: "m2",
        role: "assistant",
        content: "The last attempt failed with TIMEOUT and the blocked source https://example.com/report. Retry with a different host instead.",
      }),
      createMessage({
        messageId: "m3",
        role: "user",
        content: "Please implement the fix but do not remove the prior rejection path.",
      }),
    ]);

    expect(summary).toContain("Compacted conversation context.");
    expect(summary).toContain("Decisions and constraints:");
    expect(summary).toContain("Failed attempts and issues:");
    expect(summary).toContain("Notable artifacts:");
    expect(summary).toContain("browser.search");
    expect(summary).toContain("C:\\code\\personal-ai\\apps\\gateway\\src\\services\\chat-agent-orchestrator.ts");
    expect(summary).toContain("https://example.com/report");
    expect(summary).toContain("TIMEOUT");
    expect(summary).toContain("Recent context:");
  });

  it("returns undefined for empty or whitespace-only messages", () => {
    const summary = buildConversationCompactionSummary([
      createMessage({ messageId: "m1", role: "user", content: "   " }),
      createMessage({ messageId: "m2", role: "assistant", content: "\n\t" }),
    ]);

    expect(summary).toBeUndefined();
  });
});
