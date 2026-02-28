import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  cursor: z.string().optional(),
});

const streamQuerySchema = z.object({
  replay: z.coerce.number().int().nonnegative().max(500).default(50),
});

export const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/events", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const items = fastify.gateway.listRealtimeEvents(parsed.data.limit, parsed.data.cursor);
    const last = items[items.length - 1];
    const nextCursor = items.length === parsed.data.limit && last
      ? `${last.timestamp}|${last.eventId}`
      : undefined;
    return reply.send({ items, nextCursor });
  });

  fastify.get("/api/v1/events/stream", async (request, reply) => {
    const parsed = streamQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const raw = reply.raw;
    const requestOrigin = request.headers.origin;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": requestOrigin || "*",
      Vary: "Origin",
    });
    raw.flushHeaders?.();
    raw.write(": connected\n\n");

    const send = (payload: unknown) => {
      raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const replay = fastify.gateway.listRealtimeEvents(parsed.data.replay).reverse();
    for (const event of replay) {
      send(event);
    }

    const unsubscribe = fastify.gateway.subscribeRealtime((event) => {
      try {
        send(event);
      } catch {
        cleanup();
      }
    });

    const keepAlive = setInterval(() => {
      try {
        raw.write(": keep-alive\n\n");
      } catch {
        cleanup();
      }
    }, 25000);

    let closed = false;
    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(keepAlive);
      unsubscribe();
      try {
        raw.end();
      } catch {
        // ignore
      }
    };

    request.raw.on("close", cleanup);
    request.raw.on("aborted", cleanup);
    reply.hijack();
  });
};
