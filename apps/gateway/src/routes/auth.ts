import type { FastifyPluginAsync } from "fastify";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/auth/sse-token", async (_request, reply) => {
    const authMode = fastify.gatewayConfig.assistant.auth.mode;
    if (authMode === "none") {
      return reply.code(400).send({
        error: "SSE token bridge is not needed when auth mode is none",
      });
    }
    const token = fastify.issueSseToken("events:stream");
    return reply.send(token);
  });
};

