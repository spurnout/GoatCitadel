import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { chatRoutes } from "./chat.js";

describe("chat message routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("lists chat messages with cursor and limit", async () => {
    const listChatMessages = vi.fn(async () => ([
      {
        messageId: "m1",
        sessionId: "sess-1",
        role: "user",
        actorType: "user",
        actorId: "operator",
        content: "hello",
        timestamp: "2026-03-05T01:00:00.000Z",
      },
    ]));
    app = Fastify();
    app.decorate("gateway", {
      listChatMessages,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/chat/sessions/sess-1/messages?limit=10&cursor=m2",
    });
    expect(response.statusCode).toBe(200);
    expect(listChatMessages).toHaveBeenCalledWith("sess-1", 10, "m2");
    expect(response.json()).toMatchObject({
      items: [
        {
          messageId: "m1",
          sessionId: "sess-1",
        },
      ],
    });
  });

  it("sends chat message on happy path", async () => {
    const sendChatMessage = vi.fn(async () => ({
      sessionId: "sess-1",
      userMessage: {
        messageId: "u1",
        sessionId: "sess-1",
        role: "user",
        actorType: "user",
        actorId: "operator",
        content: "Hello",
        timestamp: "2026-03-05T01:00:00.000Z",
      },
      assistantMessage: {
        messageId: "a1",
        sessionId: "sess-1",
        role: "assistant",
        actorType: "agent",
        actorId: "assistant",
        content: "Hi",
        timestamp: "2026-03-05T01:00:01.000Z",
      },
      transport: "llm",
      model: "glm-5",
    }));
    app = Fastify();
    app.decorate("gateway", {
      sendChatMessage,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/messages",
      payload: {
        content: "Hello",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(sendChatMessage).toHaveBeenCalledWith("sess-1", expect.objectContaining({ content: "Hello" }));
    expect(response.json()).toMatchObject({
      sessionId: "sess-1",
      transport: "llm",
    });
  });

  it("returns validation error for missing content", async () => {
    const sendChatMessage = vi.fn();
    app = Fastify();
    app.decorate("gateway", {
      sendChatMessage,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/messages",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });
});
