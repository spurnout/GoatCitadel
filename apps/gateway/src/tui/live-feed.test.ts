import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealtimeEvent } from "@goatcitadel/contracts";
import { TuiLiveFeed } from "./live-feed.js";

describe("TuiLiveFeed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("records malformed SSE errors so the TUI can show degraded feed status", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: {\"eventType\":\"broken\"\n\n"));
        controller.close();
      },
    }), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = {
      baseUrl: "http://127.0.0.1:8787",
      streamHeaders: () => ({}),
      listEvents: vi.fn(async () => ({ items: [] as RealtimeEvent[] })),
    };
    const feed = new TuiLiveFeed(client as never, 5);

    await feed.start();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(feed.getLastError()).toMatch(/malformed SSE payload/i);
    feed.stop();
  });
});
