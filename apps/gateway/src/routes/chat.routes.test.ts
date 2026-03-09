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

  it("streams branch-aware chat message chunks over SSE", async () => {
    const agentSendChatMessageStream = vi.fn(async function* () {
      yield { type: "delta", value: "Hello" };
      yield { type: "done" };
    });
    app = Fastify();
    app.decorate("gateway", {
      agentSendChatMessageStream,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/agent-send/stream",
      payload: {
        content: "Hello",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("\"type\":\"delta\"");
    expect(agentSendChatMessageStream).toHaveBeenCalledWith("sess-1", expect.objectContaining({ content: "Hello" }));
  });

  it("emits an error chunk without a fabricated done chunk when SSE streaming fails", async () => {
    const agentSendChatMessageStream = vi.fn(async function* () {
      throw new Error("stream exploded");
    });
    app = Fastify();
    app.decorate("gateway", {
      agentSendChatMessageStream,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/agent-send/stream",
      payload: {
        content: "Hello",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"error\"");
    expect(response.body).toContain("Check gateway diagnostics and retry");
    expect(response.body).not.toContain("stream exploded");
    expect(response.body).not.toContain("\"type\":\"done\"");
  });

  it("rejects removed legacy chat write routes", async () => {
    app = Fastify();
    app.decorate("gateway", {} as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/messages",
      payload: {
        content: "Hello",
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining("/agent-send"),
    });
  });

  it("wires thread routes and planning-mode prefs through the gateway", async () => {
    const getChatThread = vi.fn(async () => ({
      sessionId: "sess-1",
      activeLeafTurnId: "turn-2",
      selectedTurnId: "turn-2",
      turns: [],
    }));
    const selectChatBranchTurn = vi.fn(async () => ({
      sessionId: "sess-1",
      activeLeafTurnId: "turn-3",
      selectedTurnId: "turn-3",
      turns: [],
    }));
    const updateChatSessionPrefs = vi.fn(() => ({
      sessionId: "sess-1",
      mode: "chat",
      planningMode: "advisory",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "auto",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      visionFallbackModel: undefined,
      proactiveMode: "off",
      autonomyBudget: {
        maxActionsPerHour: 2,
        maxActionsPerTurn: 1,
        cooldownSeconds: 60,
      },
      retrievalMode: "standard",
      reflectionMode: "off",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
    }));
    app = Fastify();
    app.decorate("gateway", {
      getChatThread,
      selectChatBranchTurn,
      updateChatSessionPrefs,
    } as never);
    await app.register(chatRoutes);

    const threadResponse = await app.inject({
      method: "GET",
      url: "/api/v1/chat/sessions/sess-1/thread",
    });
    expect(threadResponse.statusCode).toBe(200);
    expect(getChatThread).toHaveBeenCalledWith("sess-1");

    const selectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/turns/turn-2/select",
    });
    expect(selectResponse.statusCode).toBe(200);
    expect(selectChatBranchTurn).toHaveBeenCalledWith("sess-1", "turn-2");

    const prefsResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/chat/sessions/sess-1/prefs",
      payload: {
        planningMode: "advisory",
      },
    });
    expect(prefsResponse.statusCode).toBe(200);
    expect(updateChatSessionPrefs).toHaveBeenCalledWith("sess-1", { planningMode: "advisory" });
  });

  it("returns 409 for branch-write conflicts on agent send", async () => {
    const agentSendChatMessage = vi.fn(async () => {
      const error = new Error("chat turn conflict");
      error.name = "ChatTurnWriteConflictError";
      throw error;
    });
    app = Fastify();
    app.decorate("gateway", {
      agentSendChatMessage,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/agent-send",
      payload: {
        content: "Hello",
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it("sanitizes non-conflict agent-send failures", async () => {
    const agentSendChatMessage = vi.fn(async () => {
      throw new Error("database exploded");
    });
    app = Fastify();
    app.decorate("gateway", {
      agentSendChatMessage,
    } as never);
    await app.register(chatRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/sessions/sess-1/agent-send",
      payload: {
        content: "Hello",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("Check gateway diagnostics and retry");
    expect(response.body).not.toContain("database exploded");
  });
});
