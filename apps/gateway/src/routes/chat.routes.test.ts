import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { chatRoutes } from "./chat.js";

describe("chat routes additional coverage", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("creates sessions and returns pagination cursors", async () => {
    const listChatSessions = vi.fn(() => ([
      {
        sessionId: "sess-2",
        updatedAt: "2026-03-05T10:00:02.000Z",
      },
      {
        sessionId: "sess-1",
        updatedAt: "2026-03-05T10:00:01.000Z",
      },
    ]));
    const createChatSession = vi.fn(() => ({
      sessionId: "sess-new",
      title: "Fresh chat",
    }));
    app = Fastify();
    app.decorate("gateway", {
      listChatSessions,
      createChatSession,
    } as never);
    await app.register(chatRoutes);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/chat/sessions?limit=2",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      nextCursor: "2026-03-05T10:00:01.000Z|sess-1",
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions",
      payload: {
        title: "Fresh chat",
      },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createChatSession).toHaveBeenCalledWith({ title: "Fresh chat" });
  });

  it("streams chat message chunks over SSE", async () => {
    const sendChatMessageStream = vi.fn(async function* () {
      yield { type: "delta", value: "Hello" };
      yield { type: "done" };
    });
    app = Fastify();
    app.decorate("gateway", {
      sendChatMessageStream,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/messages/stream",
      payload: {
        content: "Hello",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("\"type\":\"delta\"");
    expect(sendChatMessageStream).toHaveBeenCalledWith("sess-1", expect.objectContaining({ content: "Hello" }));
  });
});
