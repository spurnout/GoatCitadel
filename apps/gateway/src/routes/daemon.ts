import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const logsQuerySchema = z.object({
  tail: z.coerce.number().int().positive().max(2000).default(200),
});

export const daemonRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/daemon/status", async (_request, reply) => {
    return reply.send(fastify.gateway.getDaemonStatus());
  });

  fastify.post("/api/v1/daemon/start", async (_request, reply) => {
    return reply.send(fastify.gateway.daemonStart());
  });

  fastify.post("/api/v1/daemon/stop", async (_request, reply) => {
    return reply.send(fastify.gateway.daemonStop());
  });

  fastify.post("/api/v1/daemon/restart", async (_request, reply) => {
    return reply.send(fastify.gateway.daemonRestart());
  });

  fastify.get("/api/v1/daemon/logs", async (request, reply) => {
    const parsed = logsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send({
      items: fastify.gateway.listDaemonLogs(parsed.data.tail),
    });
  });
};
