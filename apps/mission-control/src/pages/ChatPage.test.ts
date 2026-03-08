import { describe, expect, it } from "vitest";
import type { ChatMessageRecord } from "@goatcitadel/contracts";
import {
  formatSessionLabel,
  looksMachineSessionLabel,
  shouldApplyFetchedMessagesAfterStream,
} from "./ChatPage";

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

function makeSession(
  overrides: Partial<Parameters<typeof formatSessionLabel>[0]> = {},
): Parameters<typeof formatSessionLabel>[0] {
  return {
    sessionId: "sess_123456",
    sessionKey: "mission:operator:chat_123456",
    workspaceId: "default",
    scope: "mission",
    title: undefined,
    pinned: false,
    lifecycleStatus: "active",
    archivedAt: undefined,
    projectId: undefined,
    projectName: undefined,
    channel: "mission",
    account: "operator",
    updatedAt: "2026-03-06T00:00:00.000Z",
    lastActivityAt: "2026-03-06T00:00:00.000Z",
    tokenTotal: 0,
    costUsdTotal: 0,
    ...overrides,
  };
}

describe("chat session rail labels", () => {
  it("detects machine-generated labels", () => {
    expect(looksMachineSessionLabel(undefined, "mission:operator:chat_123456")).toBe(true);
    expect(looksMachineSessionLabel("mission:operator:chat_123456", "mission:operator:chat_123456")).toBe(true);
    expect(looksMachineSessionLabel("external:slack:thread_1")).toBe(true);
    expect(looksMachineSessionLabel(":operator:chat_abcdef")).toBe(true);
    expect(looksMachineSessionLabel("Release checklist", "mission:operator:chat_123456")).toBe(false);
  });

  it("formats human and fallback labels for the session rail", () => {
    expect(formatSessionLabel(makeSession({
      title: "Release checklist",
    }))).toBe("Release checklist");

    expect(formatSessionLabel(makeSession({
      title: "mission:operator:chat_123456",
    }))).toBe("Mission chat - 123456");

    expect(formatSessionLabel(makeSession({
      sessionId: "sess_654321",
      sessionKey: "external:slack:thread_1",
      scope: "external",
      title: "external:slack:thread_1",
      channel: "slack",
      account: "ops",
    }))).toBe("External chat - slack / ops");
  });
});

describe("shouldApplyFetchedMessagesAfterStream", () => {
  it("rejects stale fetched messages that would wipe a finalized streamed assistant reply", () => {
    const current = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("assistant-1", "assistant", "Latest news summary"),
    ];
    const fetched = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
    ];

    expect(shouldApplyFetchedMessagesAfterStream(current, fetched, {
      sessionId: "sess-1",
      placeholderId: "stream-1",
      messageId: "assistant-1",
      content: "Latest news summary",
    })).toBe(false);
  });

  it("rejects fetched messages with matching content but the wrong assistant message id", () => {
    const current = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("assistant-1", "assistant", "Latest news summary"),
    ];
    const fetched = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("assistant-older", "assistant", "Latest   news   summary"),
    ];

    expect(shouldApplyFetchedMessagesAfterStream(current, fetched, {
      sessionId: "sess-1",
      placeholderId: "stream-1",
      messageId: "assistant-1",
      content: "Latest news summary",
    })).toBe(false);
  });

  it("accepts fetched messages once the persisted assistant reply matches the finalized streamed message id", () => {
    const current = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("assistant-1", "assistant", "Latest news summary"),
    ];
    const fetched = [
      makeMessage("user-1", "user", "what's going on with Kristi Noem lately?"),
      makeMessage("assistant-1", "assistant", "Latest   news   summary"),
    ];

    expect(shouldApplyFetchedMessagesAfterStream(current, fetched, {
      sessionId: "sess-1",
      placeholderId: "stream-1",
      messageId: "assistant-1",
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
