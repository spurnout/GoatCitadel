import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGatewayAuthState,
  getGatewayAuthStorageMode,
  isTrustedGatewayHost,
  persistGatewayAuthState,
  readStoredGatewayAuthState,
  setGatewayAuthStorageMode,
  streamAgentChatMessage,
} from "./client";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

function installMockWindow(): void {
  const win = {
    location: {
      protocol: "http:",
      hostname: "localhost",
    },
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: win,
  });
}

describe("isTrustedGatewayHost", () => {
  beforeEach(() => {
    installMockWindow();
    clearGatewayAuthState();
    setGatewayAuthStorageMode("session");
  });

  afterEach(() => {
    clearGatewayAuthState();
  });

  it("allows local and private hosts by default", () => {
    expect(isTrustedGatewayHost("localhost")).toBe(true);
    expect(isTrustedGatewayHost("127.0.0.1")).toBe(true);
    expect(isTrustedGatewayHost("10.0.0.15")).toBe(true);
    expect(isTrustedGatewayHost("100.115.92.2")).toBe(true);
    expect(isTrustedGatewayHost("bld.ts.net")).toBe(true);
  });

  it("rejects untrusted public hostnames without explicit allowlist", () => {
    expect(isTrustedGatewayHost("evil.example.com")).toBe(false);
  });

  it("allows explicitly configured hosts", () => {
    expect(isTrustedGatewayHost("gateway.internal", "gateway.internal,.corp.local")).toBe(true);
    expect(isTrustedGatewayHost("api.corp.local", "gateway.internal,.corp.local")).toBe(true);
  });

  it("stores auth session-only by default", () => {
    persistGatewayAuthState({
      mode: "token",
      token: "abc123",
    });

    const stored = readStoredGatewayAuthState();
    expect(stored).toMatchObject({ mode: "token", token: "abc123" });
    expect(getGatewayAuthStorageMode()).toBe("session");
    expect(window.sessionStorage.getItem("goatcitadel.gateway.auth")).toBeTruthy();
    expect(window.localStorage.getItem("goatcitadel.gateway.auth")).toBeNull();
  });

  it("supports persistent remember-me storage when enabled", () => {
    setGatewayAuthStorageMode("persistent");
    persistGatewayAuthState(
      {
        mode: "basic",
        username: "operator",
        password: "secret",
      },
      "persistent",
    );

    expect(getGatewayAuthStorageMode()).toBe("persistent");
    expect(window.sessionStorage.getItem("goatcitadel.gateway.auth")).toBeTruthy();
    expect(window.localStorage.getItem("goatcitadel.gateway.auth")).toBeTruthy();
    expect(readStoredGatewayAuthState()).toMatchObject({
      mode: "basic",
      username: "operator",
      password: "secret",
    });
  });

  it("migrates legacy localStorage auth into session storage", () => {
    window.localStorage.setItem("goatcitadel.gateway.auth", JSON.stringify({
      mode: "token",
      token: "legacy-token",
      tokenQueryParam: "access_token",
    }));

    const migrated = readStoredGatewayAuthState();

    expect(migrated).toMatchObject({ token: "legacy-token" });
    expect(window.sessionStorage.getItem("goatcitadel.gateway.auth")).toContain("legacy-token");
    expect(window.localStorage.getItem("goatcitadel.gateway.auth")).toBeNull();
  });

  it("treats aborted SSE chat streams as silent cancellation", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: "message_start",
              sessionId: "sess-1",
              turnId: "turn-1",
              messageId: "assistant-1",
              branchKind: "append",
            })}\n\n`,
          ));
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const controller = new AbortController();
    const chunks: Array<{ type: string }> = [];

    await expect(streamAgentChatMessage(
      "sess-1",
      { content: "coverage" },
      (chunk) => {
        chunks.push({ type: chunk.type });
        controller.abort();
      },
      { signal: controller.signal },
    )).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([{ type: "message_start" }]);
  });
});
