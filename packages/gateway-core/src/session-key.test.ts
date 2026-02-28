import { describe, expect, it } from "vitest";
import { resolveSessionRoute } from "./session-key.js";

describe("resolveSessionRoute", () => {
  it("builds deterministic DM key", () => {
    const route = resolveSessionRoute({
      channel: "telegram",
      account: "me",
      peer: "alice",
    });

    expect(route.kind).toBe("dm");
    expect(route.sessionKey).toBe("telegram:me:alice");
    expect(route.sessionId).toMatch(/^sess_/);
  });

  it("builds deterministic group key", () => {
    const route = resolveSessionRoute({
      channel: "slack",
      account: "me",
      room: "eng",
    });

    expect(route.kind).toBe("group");
    expect(route.sessionKey).toBe("slack:me:eng");
  });

  it("builds deterministic thread key", () => {
    const route = resolveSessionRoute({
      channel: "slack",
      account: "me",
      room: "eng",
      threadId: "123",
    });

    expect(route.kind).toBe("thread");
    expect(route.sessionKey).toBe("slack:me:eng:123");
  });
});