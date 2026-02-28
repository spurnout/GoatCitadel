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
};
