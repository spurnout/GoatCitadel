import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const createDeviceRequestSchema = z.object({
  deviceLabel: z.string().trim().min(1).max(120).optional(),
  deviceType: z.enum(["mobile", "desktop", "tablet", "browser", "unknown"]).optional(),
  platform: z.string().trim().min(1).max(120).optional(),
});

const deviceRequestParamsSchema = z.object({
  requestId: z.string().uuid(),
});

const deviceRequestSecretHeaderSchema = z.object({
  "x-goatcitadel-device-request-secret": z.string().trim().min(16).max(256),
});

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

  fastify.post("/api/v1/auth/device-requests", async (request, reply) => {
    const parsed = createDeviceRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const created = await fastify.gateway.createDeviceAccessRequest(parsed.data, {
        requestedOrigin: typeof request.headers.origin === "string" ? request.headers.origin : undefined,
        requestedIp: request.raw.socket.remoteAddress ?? request.ip,
        userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
      });
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({
        error: (error as Error).message,
      });
    }
  });

  fastify.get("/api/v1/auth/device-requests/:requestId/status", async (request, reply) => {
    const params = deviceRequestParamsSchema.safeParse(request.params);
    const headers = deviceRequestSecretHeaderSchema.safeParse(request.headers);
    if (!params.success || !headers.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          headers: headers.success ? undefined : headers.error.flatten(),
        },
      });
    }

    try {
      const status = await fastify.gateway.getDeviceAccessRequestStatus(
        params.data.requestId,
        headers.data["x-goatcitadel-device-request-secret"],
      );
      return reply.send(status);
    } catch (error) {
      return reply.code(404).send({
        error: "Device access request not found.",
      });
    }
  });
};
