import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
});

const runParamsSchema = z.object({
  runId: z.string().min(1),
});

export const durableRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/durable/diagnostics", async () => {
    return fastify.gateway.getDurableDiagnostics();
  });

  fastify.get("/api/v1/durable/runs", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return {
      items: fastify.gateway.listDurableRuns(parsed.data.limit),
    };
  });

  fastify.get("/api/v1/durable/dead-letters", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return {
      items: fastify.gateway.listDurableDeadLetters(parsed.data.limit),
    };
  });

  fastify.get("/api/v1/durable/runs/:runId/checkpoints", async (request, reply) => {
    const params = runParamsSchema.safeParse(request.params);
    const query = listQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          query: query.success ? undefined : query.error.flatten(),
        },
      });
    }
    return {
      items: fastify.gateway.listDurableRunCheckpoints(params.data.runId, query.data.limit),
    };
  });
};

