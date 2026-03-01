import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const bodySchema = z.object({
  toolName: z.string().min(1),
  args: z.record(z.unknown()),
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().optional(),
  consentContext: z.object({
    operatorId: z.string().optional(),
    source: z.enum(["ui", "tui", "agent"]).optional(),
    reason: z.string().optional(),
  }).optional(),
  dryRun: z.boolean().optional(),
});

export const toolsInvokeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/tools/invoke", async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await fastify.gateway.invokeTool(parsed.data);
    return reply.send(result);
  });
};
