import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { integrationsRoutes } from "./integrations.js";

describe("integrations inbound route guards", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("rejects channel inbound payloads with oversized content-length", async () => {
    const ingestChannelMessage = vi.fn();
    app = Fastify();
    app.decorate("gateway", {
      ingestChannelMessage,
    } as never);
    await app.register(integrationsRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/channels/discord/inbound",
      headers: {
        "content-length": String(300 * 1024),
      },
      payload: {
        account: "acct-1",
        actorId: "user-1",
        content: "hello",
      },
    });

    expect(response.statusCode).toBe(413);
    expect(ingestChannelMessage).not.toHaveBeenCalled();
  });

  it("accepts bounded inbound payloads and forwards to gateway ingest", async () => {
    const ingestChannelMessage = vi.fn(async () => ({
      accepted: true,
      sessionId: "sess-1",
    }));
    app = Fastify();
    app.decorate("gateway", {
      ingestChannelMessage,
    } as never);
    await app.register(integrationsRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/channels/discord/inbound",
      payload: {
        account: "acct-1",
        actorId: "user-1",
        content: "hello from inbound",
        metadata: {
          source: "test",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(ingestChannelMessage).toHaveBeenCalledWith(
      "discord",
      undefined,
      expect.objectContaining({
        account: "acct-1",
        actorId: "user-1",
        content: "hello from inbound",
      }),
    );
  });
});
