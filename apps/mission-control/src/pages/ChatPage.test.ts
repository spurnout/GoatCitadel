import { describe, expect, it } from "vitest";
import type { ChatMessageRecord } from "@goatcitadel/contracts";
import { shouldApplyFetchedMessagesAfterStream } from "./ChatPage";

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
    timestamp: "2026-03-06T00:00:00.000Z",
  };
}

describe("shouldApplyFetchedMessagesAfterStream", () => {
  it("rejects stale fetched messages that would wipe a finalized streamed assistant reply", () => {
    const current = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("stream-1", "assistant", "Latest news summary"),
    ];
    const fetched = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
    ];

    expect(shouldApplyFetchedMessagesAfterStream(current, fetched, {
      sessionId: "sess-1",
      placeholderId: "stream-1",
      content: "Latest news summary",
    })).toBe(false);
  });

  it("accepts fetched messages once the persisted assistant reply matches the finalized streamed reply", () => {
    const current = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("stream-1", "assistant", "Latest news summary"),
    ];
    const fetched = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("assistant-1", "assistant", "Latest   news   summary"),
    ];

    expect(shouldApplyFetchedMessagesAfterStream(current, fetched, {
      sessionId: "sess-1",
      placeholderId: "stream-1",
      content: "Latest news summary",
    })).toBe(true);
  });

  it("accepts fetched messages when there is no finalized streamed placeholder to protect", () => {
    const current = [
      makeMessage("user-1", "user", "hello"),
    ];
    const fetched = [
      makeMessage("user-1", "user", "hello"),
      makeMessage("assistant-1", "assistant", "hi"),
    ];

    expect(shouldApplyFetchedMessagesAfterStream(current, fetched, null)).toBe(true);
  });
});
