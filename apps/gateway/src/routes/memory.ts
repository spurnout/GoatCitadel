import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const composeSchema = z.object({
  scope: z.enum(["chat", "orchestration"]),
  prompt: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  workspace: z.string().min(1).optional(),
  maxContextTokens: z.number().int().positive().optional(),
  forceRefresh: z.boolean().optional(),
});

const statsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).default(60),
});

const itemParamsSchema = z.object({
  itemId: z.string().min(1),
});

const listItemsQuerySchema = z.object({
  namespace: z.string().optional(),
  status: z.enum(["active", "forgotten", "all"]).optional(),
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const patchItemSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  pinned: z.boolean().optional(),
  ttlOverrideSeconds: z.number().int().positive().max(31_536_000).nullable().optional(),
  actorId: z.string().optional(),
});

const forgetItemSchema = z.object({
  actorId: z.string().optional(),
});

const forgetManySchema = z.object({
  itemIds: z.array(z.string().min(1)).optional(),
  namespace: z.string().optional(),
  query: z.string().optional(),
  actorId: z.string().optional(),
});

export const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/memory/context/compose", async (request, reply) => {
    const parsed = composeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send(await fastify.gateway.composeMemoryContext(parsed.data));
  });

  fastify.get("/api/v1/memory/context/:contextId", async (request, reply) => {
    const contextId = (request.params as { contextId: string }).contextId;
    try {
      return reply.send(fastify.gateway.getMemoryContext(contextId));
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/memory/qmd/stats", async (request, reply) => {
    const parsed = statsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const to = parsed.data.to ?? new Date().toISOString();
    const from = parsed.data.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stats = fastify.gateway.getMemoryQmdStats(from, to);
    const recent = fastify.gateway.listRecentMemoryContexts(parsed.data.limit);
    return reply.send({
      ...stats,
      recent,
    });
  });

  fastify.get("/api/v1/memory/items", async (request, reply) => {
    const parsed = listItemsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      return reply.send({
        items: fastify.gateway.listMemoryItems(parsed.data),
      });
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  fastify.patch("/api/v1/memory/items/:itemId", async (request, reply) => {
    const params = itemParamsSchema.safeParse(request.params);
    const body = patchItemSchema.safeParse(request.body ?? {});
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
        fastify.gateway.patchMemoryItem(
          params.data.itemId,
          {
            title: body.data.title,
            content: body.data.content,
            metadata: body.data.metadata,
            pinned: body.data.pinned,
            ttlOverrideSeconds: body.data.ttlOverrideSeconds,
          },
          body.data.actorId,
        ),
      );
    } catch (error) {
      const message = (error as Error).message;
      const notFound = message.toLowerCase().includes("not found");
      return reply.code(notFound ? 404 : 409).send({ error: message });
    }
  });

  fastify.post("/api/v1/memory/items/:itemId/forget", async (request, reply) => {
    const params = itemParamsSchema.safeParse(request.params);
    const body = forgetItemSchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.forgetMemoryItem(params.data.itemId, body.data.actorId));
    } catch (error) {
      const message = (error as Error).message;
      const notFound = message.toLowerCase().includes("not found");
      return reply.code(notFound ? 404 : 409).send({ error: message });
    }
  });

  fastify.get("/api/v1/memory/items/:itemId/history", async (request, reply) => {
    const params = itemParamsSchema.safeParse(request.params);
    const query = statsQuerySchema.safeParse(request.query);
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
        items: fastify.gateway.listMemoryItemHistory(params.data.itemId, query.data.limit),
      });
    } catch (error) {
      const message = (error as Error).message;
      const notFound = message.toLowerCase().includes("not found");
      return reply.code(notFound ? 404 : 409).send({ error: message });
    }
  });

  fastify.post("/api/v1/memory/forget", async (request, reply) => {
    const body = forgetManySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.forgetMemory(body.data));
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });
};
