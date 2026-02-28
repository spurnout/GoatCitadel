import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export const sessionsListRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/sessions", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const items = fastify.gateway.listSessions(parsed.data.limit, parsed.data.cursor);
    const last = items[items.length - 1];
    const nextCursor = items.length === parsed.data.limit && last
      ? `${last.updatedAt}|${last.sessionId}`
      : undefined;

    return reply.send({ items, nextCursor });
  });

  fastify.get("/api/v1/sessions/:sessionId", async (request, reply) => {
    const sessionId = (request.params as { sessionId: string }).sessionId;
    return reply.send(fastify.gateway.getSession(sessionId));
  });

  fastify.get("/api/v1/sessions/:sessionId/transcript", async (request, reply) => {
    const sessionId = (request.params as { sessionId: string }).sessionId;
    const events = await fastify.gateway.getTranscript(sessionId);
    return reply.send({ items: events });
  });
};
