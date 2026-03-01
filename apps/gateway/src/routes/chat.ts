import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const projectViewSchema = z.object({
  view: z.enum(["active", "archived", "all"]).default("active"),
  limit: z.coerce.number().int().positive().max(1000).default(300),
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  workspacePath: z.string().min(1),
  color: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  workspacePath: z.string().min(1).optional(),
  color: z.string().optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const deleteProjectQuerySchema = z.object({
  mode: z.enum(["hard", "soft"]).default("hard"),
});

const listChatSessionsSchema = z.object({
  scope: z.enum(["mission", "external", "all"]).optional(),
  projectId: z.string().min(1).optional(),
  q: z.string().optional(),
  view: z.enum(["active", "archived", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
  cursor: z.string().optional(),
});

const sessionParamsSchema = z.object({
  sessionId: z.string().min(1),
});

const createSessionSchema = z.object({
  title: z.string().optional(),
  projectId: z.string().optional(),
});

const updateSessionSchema = z.object({
  title: z.string().optional(),
});

const assignProjectSchema = z.object({
  projectId: z.string().optional(),
});

const bindingSchema = z.object({
  transport: z.enum(["llm", "integration"]),
  connectionId: z.string().optional(),
  target: z.string().optional(),
  writable: z.boolean().optional(),
});

const listMessagesSchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(200),
  cursor: z.string().optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1),
  parts: z.array(z.union([
    z.object({
      type: z.literal("text"),
      text: z.string().min(1),
    }),
    z.object({
      type: z.literal("image_ref"),
      attachmentId: z.string().min(1),
      mimeType: z.string().optional(),
      detail: z.enum(["low", "high", "auto"]).optional(),
    }),
    z.object({
      type: z.literal("audio_ref"),
      attachmentId: z.string().min(1),
      mimeType: z.string().optional(),
    }),
    z.object({
      type: z.literal("video_ref"),
      attachmentId: z.string().min(1),
      mimeType: z.string().optional(),
    }),
    z.object({
      type: z.literal("file_ref"),
      attachmentId: z.string().min(1),
      mimeType: z.string().optional(),
    }),
  ])).optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  useMemory: z.boolean().optional(),
  attachments: z.array(z.string()).optional(),
  mode: z.enum(["chat", "cowork", "code"]).optional(),
  webMode: z.enum(["auto", "off", "quick", "deep"]).optional(),
  memoryMode: z.enum(["auto", "on", "off"]).optional(),
  thinkingLevel: z.enum(["minimal", "standard", "extended"]).optional(),
  commandText: z.string().optional(),
  prefsOverride: z.object({
    mode: z.enum(["chat", "cowork", "code"]).optional(),
    providerId: z.string().optional(),
    model: z.string().optional(),
    webMode: z.enum(["auto", "off", "quick", "deep"]).optional(),
    memoryMode: z.enum(["auto", "on", "off"]).optional(),
    thinkingLevel: z.enum(["minimal", "standard", "extended"]).optional(),
    toolAutonomy: z.enum(["safe_auto", "manual"]).optional(),
    visionFallbackModel: z.string().optional(),
  }).optional(),
});

const prefsPatchSchema = z.object({
  mode: z.enum(["chat", "cowork", "code"]).optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  webMode: z.enum(["auto", "off", "quick", "deep"]).optional(),
  memoryMode: z.enum(["auto", "on", "off"]).optional(),
  thinkingLevel: z.enum(["minimal", "standard", "extended"]).optional(),
  toolAutonomy: z.enum(["safe_auto", "manual"]).optional(),
  visionFallbackModel: z.string().optional(),
});

const commandParseSchema = z.object({
  commandText: z.string().min(1),
});

const researchRunSchema = z.object({
  query: z.string().min(1),
  mode: z.enum(["quick", "deep"]).default("quick"),
  providerId: z.string().optional(),
  model: z.string().optional(),
});

const researchParamsSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
});

const delegateBodySchema = z.object({
  objective: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
  mode: z.enum(["sequential", "parallel"]).default("sequential"),
  providerId: z.string().optional(),
  model: z.string().optional(),
});

const delegationRunParamsSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
});

const promptPackImportSchema = z.object({
  content: z.string().min(1),
  name: z.string().optional(),
  sourceLabel: z.string().optional(),
  packId: z.string().optional(),
});

const promptPackListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(2000).default(200),
});

const promptPackParamsSchema = z.object({
  packId: z.string().min(1),
});

const promptPackTestParamsSchema = z.object({
  packId: z.string().min(1),
  testId: z.string().min(1),
});

const promptPackRunBodySchema = z.object({
  sessionId: z.string().optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
});

const promptPackScoreBodySchema = z.object({
  runId: z.string().min(1),
  routingScore: z.coerce.number().int().min(0).max(2),
  honestyScore: z.coerce.number().int().min(0).max(2),
  handoffScore: z.coerce.number().int().min(0).max(2),
  robustnessScore: z.coerce.number().int().min(0).max(2),
  usabilityScore: z.coerce.number().int().min(0).max(2),
  notes: z.string().optional(),
});

const chatToolDecisionSchema = z.object({
  sessionId: z.string().min(1),
  approvalId: z.string().min(1),
});

const attachmentUploadSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().optional(),
  fileName: z.string().min(1),
  mimeType: z.string().default("application/octet-stream"),
  bytesBase64: z.string().min(1),
});

const attachmentParamsSchema = z.object({
  attachmentId: z.string().min(1),
});

const attachmentContentQuerySchema = z.object({
  disposition: z.enum(["inline", "attachment"]).default("attachment"),
});

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/chat/projects", async (request, reply) => {
    const parsed = projectViewSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send({
      items: fastify.gateway.listChatProjects(parsed.data.view, parsed.data.limit),
      view: parsed.data.view,
    });
  });

  fastify.post("/api/v1/chat/projects", async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = fastify.gateway.createChatProject(parsed.data);
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.patch("/api/v1/chat/projects/:projectId", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = updateProjectSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.updateChatProject(params.data.projectId, body.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/projects/:projectId/archive", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.archiveChatProject(params.data.projectId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/projects/:projectId/restore", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.restoreChatProject(params.data.projectId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.delete("/api/v1/chat/projects/:projectId", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const query = deleteProjectQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          query: query.success ? undefined : query.error.flatten(),
        },
      });
    }
    if (query.data.mode !== "hard") {
      return reply.code(400).send({ error: "Only hard delete is supported for chat projects." });
    }
    const deleted = fastify.gateway.hardDeleteChatProject(params.data.projectId);
    return reply.send({ deleted, projectId: params.data.projectId, mode: "hard" as const });
  });

  fastify.get("/api/v1/chat/sessions", async (request, reply) => {
    const parsed = listChatSessionsSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const items = fastify.gateway.listChatSessions(parsed.data);
    const last = items.at(-1);
    const nextCursor = items.length === parsed.data.limit && last
      ? `${last.updatedAt}|${last.sessionId}`
      : undefined;
    return reply.send({ items, nextCursor });
  });

  fastify.post("/api/v1/chat/sessions", async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = fastify.gateway.createChatSession(parsed.data);
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.patch("/api/v1/chat/sessions/:sessionId", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = updateSessionSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.updateChatSession(params.data.sessionId, body.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/pin", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.pinChatSession(params.data.sessionId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/unpin", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.unpinChatSession(params.data.sessionId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/archive", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.archiveChatSession(params.data.sessionId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/restore", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.restoreChatSession(params.data.sessionId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/project", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = assignProjectSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.assignChatSessionProject(params.data.sessionId, body.data.projectId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/binding", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = bindingSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(
        fastify.gateway.setChatSessionBinding({
          sessionId: params.data.sessionId,
          ...body.data,
        }),
      );
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/chat/sessions/:sessionId/binding", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send({
        item: fastify.gateway.getChatSessionBinding(params.data.sessionId) ?? null,
      });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/chat/sessions/:sessionId/messages", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const query = listMessagesSchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          query: query.success ? undefined : query.error.flatten(),
        },
      });
    }
    try {
      const items = await fastify.gateway.listChatMessages(
        params.data.sessionId,
        query.data.limit,
        query.data.cursor,
      );
      return reply.send({ items });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/messages", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = sendMessageSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      const sent = await fastify.gateway.sendChatMessage(params.data.sessionId, body.data);
      return reply.send(sent);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/agent-send", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = sendMessageSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      const sent = await fastify.gateway.agentSendChatMessage(params.data.sessionId, body.data);
      return reply.send(sent);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/messages/stream", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = sendMessageSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }

    const raw = reply.raw;
    const corsOrigin = reply.getHeader("Access-Control-Allow-Origin");
    const corsCredentials = reply.getHeader("Access-Control-Allow-Credentials");
    const corsVary = reply.getHeader("Vary");
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...(typeof corsOrigin === "string" ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
      ...(typeof corsCredentials === "string" ? { "Access-Control-Allow-Credentials": corsCredentials } : {}),
      ...(typeof corsVary === "string" ? { Vary: corsVary } : {}),
    });
    raw.flushHeaders?.();
    raw.write(": connected\n\n");

    const send = (payload: unknown) => {
      raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const chunk of fastify.gateway.sendChatMessageStream(params.data.sessionId, body.data)) {
        send(chunk);
      }
    } catch (error) {
      send({ type: "error", error: (error as Error).message });
      send({ type: "done" });
    } finally {
      raw.end();
    }
    reply.hijack();
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/agent-send/stream", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = sendMessageSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }

    const raw = reply.raw;
    const corsOrigin = reply.getHeader("Access-Control-Allow-Origin");
    const corsCredentials = reply.getHeader("Access-Control-Allow-Credentials");
    const corsVary = reply.getHeader("Vary");
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...(typeof corsOrigin === "string" ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
      ...(typeof corsCredentials === "string" ? { "Access-Control-Allow-Credentials": corsCredentials } : {}),
      ...(typeof corsVary === "string" ? { Vary: corsVary } : {}),
    });
    raw.flushHeaders?.();
    raw.write(": connected\n\n");

    const send = (payload: unknown) => {
      raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const chunk of fastify.gateway.agentSendChatMessageStream(params.data.sessionId, body.data)) {
        send(chunk);
      }
    } catch (error) {
      send({ type: "error", error: (error as Error).message });
      send({ type: "done" });
    } finally {
      raw.end();
    }
    reply.hijack();
  });

  fastify.get("/api/v1/chat/sessions/:sessionId/prefs", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getChatSessionPrefs(params.data.sessionId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.patch("/api/v1/chat/sessions/:sessionId/prefs", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = prefsPatchSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.updateChatSessionPrefs(params.data.sessionId, body.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/chat/catalog/commands", async (_request, reply) => {
    return reply.send({ items: fastify.gateway.listChatCommandCatalog() });
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/commands/parse", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = commandParseSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(await fastify.gateway.parseChatCommand(params.data.sessionId, body.data.commandText));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/research/run", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = researchRunSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(await fastify.gateway.runChatResearch(params.data.sessionId, body.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/chat/sessions/:sessionId/research/:runId", async (request, reply) => {
    const params = researchParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getChatResearchRun(params.data.sessionId, params.data.runId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/delegate", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = delegateBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(await fastify.gateway.runChatDelegation(params.data.sessionId, body.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/sessions/:sessionId/delegate/stream", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const body = delegateBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }

    const raw = reply.raw;
    const corsOrigin = reply.getHeader("Access-Control-Allow-Origin");
    const corsCredentials = reply.getHeader("Access-Control-Allow-Credentials");
    const corsVary = reply.getHeader("Vary");
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...(typeof corsOrigin === "string" ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
      ...(typeof corsCredentials === "string" ? { "Access-Control-Allow-Credentials": corsCredentials } : {}),
      ...(typeof corsVary === "string" ? { Vary: corsVary } : {}),
    });
    raw.flushHeaders?.();
    raw.write(": connected\n\n");

    const send = (payload: unknown) => {
      raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const chunk of fastify.gateway.runChatDelegationStream(params.data.sessionId, body.data)) {
        send(chunk);
      }
    } catch (error) {
      send({ type: "error", error: (error as Error).message });
      send({ type: "done" });
    } finally {
      raw.end();
    }
    reply.hijack();
  });

  fastify.get("/api/v1/chat/sessions/:sessionId/delegations/:runId", async (request, reply) => {
    const params = delegationRunParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getChatDelegationRun(params.data.sessionId, params.data.runId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/prompt-packs/import", async (request, reply) => {
    const body = promptPackImportSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.importPromptPack(body.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/prompt-packs", async (request, reply) => {
    const query = promptPackListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    return reply.send({
      items: fastify.gateway.listPromptPacks(query.data.limit),
    });
  });

  fastify.get("/api/v1/prompt-packs/:packId/tests", async (request, reply) => {
    const params = promptPackParamsSchema.safeParse(request.params);
    const query = promptPackListQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          query: query.success ? undefined : query.error.flatten(),
        },
      });
    }
    try {
      return reply.send({
        items: fastify.gateway.listPromptPackTests(params.data.packId, query.data.limit),
      });
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/prompt-packs/:packId/tests/:testId/run", async (request, reply) => {
    const params = promptPackTestParamsSchema.safeParse(request.params);
    const body = promptPackRunBodySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      const run = await fastify.gateway.runPromptPackTest(params.data.packId, params.data.testId, body.data);
      return reply.send(run);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/prompt-packs/:packId/tests/:testId/score", async (request, reply) => {
    const params = promptPackTestParamsSchema.safeParse(request.params);
    const body = promptPackScoreBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.scorePromptPackTest({
        packId: params.data.packId,
        testId: params.data.testId,
        runId: body.data.runId,
        routingScore: body.data.routingScore as 0 | 1 | 2,
        honestyScore: body.data.honestyScore as 0 | 1 | 2,
        handoffScore: body.data.handoffScore as 0 | 1 | 2,
        robustnessScore: body.data.robustnessScore as 0 | 1 | 2,
        usabilityScore: body.data.usabilityScore as 0 | 1 | 2,
        notes: body.data.notes,
      }));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/prompt-packs/:packId/report", async (request, reply) => {
    const params = promptPackParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getPromptPackReport(params.data.packId));
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/tools/approve", async (request, reply) => {
    const body = chatToolDecisionSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    try {
      await fastify.gateway.resolveChatToolApproval(body.data.sessionId, body.data.approvalId, "approve");
      return reply.send({ ok: true, approvalId: body.data.approvalId });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/tools/deny", async (request, reply) => {
    const body = chatToolDecisionSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    try {
      await fastify.gateway.resolveChatToolApproval(body.data.sessionId, body.data.approvalId, "reject");
      return reply.send({ ok: true, approvalId: body.data.approvalId });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/chat/attachments", async (request, reply) => {
    const parsed = attachmentUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const uploaded = await fastify.gateway.uploadChatAttachment(parsed.data);
      return reply.code(201).send(uploaded);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/chat/attachments/:attachmentId", async (request, reply) => {
    const params = attachmentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getChatAttachment(params.data.attachmentId));
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/chat/attachments/:attachmentId/content", async (request, reply) => {
    const params = attachmentParamsSchema.safeParse(request.params);
    const query = attachmentContentQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          query: query.success ? undefined : query.error.flatten(),
        },
      });
    }
    try {
      const { record, bytes } = await fastify.gateway.readChatAttachmentContent(params.data.attachmentId);
      reply.header("Content-Type", record.mimeType || "application/octet-stream");
      reply.header(
        "Content-Disposition",
        `${query.data.disposition}; filename="${encodeURIComponent(record.fileName)}"`,
      );
      return reply.send(bytes);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });
};
