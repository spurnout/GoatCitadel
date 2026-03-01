import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const channelSendSchema = z.object({
  connectionId: z.string().uuid(),
  target: z.string().min(1),
  message: z.string().min(1),
  attachments: z.array(z.object({
    url: z.string().url().optional(),
    title: z.string().optional(),
    mimeType: z.string().optional(),
  })).optional(),
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
});

const gmailReadSchema = z.object({
  connectionId: z.string().uuid(),
  query: z.string().optional(),
  maxResults: z.number().int().positive().max(100).optional(),
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
});

const gmailSendSchema = z.object({
  connectionId: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  bodyHtml: z.string().optional(),
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
});

const calendarListSchema = z.object({
  connectionId: z.string().uuid(),
  calendarId: z.string().optional(),
  fromIso: z.string().datetime().optional(),
  toIso: z.string().datetime().optional(),
  maxResults: z.number().int().positive().max(200).optional(),
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
});

const calendarCreateSchema = z.object({
  connectionId: z.string().uuid(),
  calendarId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  attendees: z.array(z.string().email()).optional(),
  timeZone: z.string().optional(),
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
});

export const commsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/comms/send", async (request, reply) => {
    const parsed = channelSendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send(await fastify.gateway.commsSend(parsed.data));
  });

  fastify.post("/api/v1/comms/gmail/read", async (request, reply) => {
    const parsed = gmailReadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send(await fastify.gateway.commsGmailRead(parsed.data));
  });

  fastify.post("/api/v1/comms/gmail/send", async (request, reply) => {
    const parsed = gmailSendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send(await fastify.gateway.commsGmailSend(parsed.data));
  });

  fastify.post("/api/v1/comms/calendar/list", async (request, reply) => {
    const parsed = calendarListSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send(await fastify.gateway.commsCalendarList(parsed.data));
  });

  fastify.post("/api/v1/comms/calendar/create", async (request, reply) => {
    const parsed = calendarCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send(await fastify.gateway.commsCalendarCreate(parsed.data));
  });
};
