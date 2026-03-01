import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const transcribeSchema = z.object({
  bytesBase64: z.string().min(1),
  mimeType: z.string().optional(),
  language: z.string().optional(),
});

const talkCreateSchema = z.object({
  mode: z.enum(["push_to_talk", "wake"]).optional(),
  sessionId: z.string().optional(),
});

const talkParamsSchema = z.object({
  id: z.string().min(1),
});

export const voiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/voice/transcribe", async (request, reply) => {
    const parsed = transcribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      return reply.send(await fastify.gateway.transcribeVoice(parsed.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/voice/talk/sessions", async (request, reply) => {
    const parsed = talkCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      return reply.code(201).send(fastify.gateway.startTalkSession(parsed.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/voice/talk/sessions/:id/stop", async (request, reply) => {
    const params = talkParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.stopTalkSession(params.data.id));
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/voice/wake/start", async (_request, reply) => {
    return reply.send(fastify.gateway.startVoiceWake());
  });

  fastify.post("/api/v1/voice/wake/stop", async (_request, reply) => {
    return reply.send(fastify.gateway.stopVoiceWake());
  });

  fastify.get("/api/v1/voice/status", async (_request, reply) => {
    return reply.send(fastify.gateway.getVoiceStatus());
  });
};
