import type { FastifyPluginAsync } from "fastify";

export const npuRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/npu/status", async (_request, reply) => {
    return reply.send(fastify.gateway.getNpuStatus());
  });

  fastify.get("/api/v1/npu/models", async (_request, reply) => {
    try {
      const items = await fastify.gateway.listNpuModels();
      return reply.send({ items });
    } catch (error) {
      return reply.code(503).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/npu/start", async (_request, reply) => {
    try {
      return reply.send(await fastify.gateway.startNpuRuntime());
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/npu/stop", async (_request, reply) => {
    try {
      return reply.send(await fastify.gateway.stopNpuRuntime());
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/npu/refresh", async (_request, reply) => {
    try {
      return reply.send(await fastify.gateway.refreshNpuRuntime());
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
};
