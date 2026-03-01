import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { eventsRoutes } from "./events.js";

describe("events stream route", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("returns CORS headers for allowed origins on SSE stream responses", async () => {
    app = Fastify();
    await app.register(cors, {
      origin: (origin, cb) => {
        if (!origin || origin === "http://localhost:5173") {
          cb(null, true);
          return;
        }
        cb(new Error("blocked"), false);
      },
    });
    app.decorate("gateway", {
      listRealtimeEvents: () => [],
      subscribeRealtime: () => () => undefined,
    } as never);
    await app.register(eventsRoutes);

    const address = await app.listen({ host: "127.0.0.1", port: 0 });

    const response = await fetch(`${address}/api/v1/events/stream?replay=1`, {
      headers: {
        Origin: "http://localhost:5173",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader!.read();
    const text = new TextDecoder().decode(chunk.value ?? new Uint8Array());
    expect(text.includes(": connected")).toBe(true);
    await reader!.cancel();
  });
});
