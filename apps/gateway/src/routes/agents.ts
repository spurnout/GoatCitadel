import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

const listQuerySchema = z.object({
  view: z.enum(["active", "archived", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(300),
});

const createSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  specialties: z.array(z.string().min(1)).optional(),
  defaultTools: z.array(z.string().min(1)).optional(),
  aliases: z.array(z.string().min(1)).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  specialties: z.array(z.string().min(1)).optional(),
  defaultTools: z.array(z.string().min(1)).optional(),
  aliases: z.array(z.string().min(1)).optional(),
});

const archiveSchema = z.object({
  archivedBy: z.string().min(1).optional(),
  archiveReason: z.string().min(1).max(400).optional(),
}).optional();

const deleteQuerySchema = z.object({
  mode: z.literal("hard"),
});

export const agentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/agents", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const view = parsed.data.view ?? "active";
    const items = fastify.gateway.listAgents(view, parsed.data.limit);
    return reply.send({ items, view });
  });

  fastify.get("/api/v1/agents/:agentId", async (request, reply) => {
    const agentId = (request.params as { agentId: string }).agentId;
    try {
      return reply.send(fastify.gateway.getAgent(agentId));
    } catch (error) {
      return sendAgentError(reply, error);
    }
  });

  fastify.post("/api/v1/agents", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = fastify.gateway.createAgentProfile(parsed.data);
      return reply.code(201).send(created);
    } catch (error) {
      return sendAgentError(reply, error);
    }
  });

  fastify.patch("/api/v1/agents/:agentId", async (request, reply) => {
    const agentId = (request.params as { agentId: string }).agentId;
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.updateAgentProfile(agentId, parsed.data));
    } catch (error) {
      return sendAgentError(reply, error);
    }
  });

  fastify.post("/api/v1/agents/:agentId/archive", async (request, reply) => {
    const agentId = (request.params as { agentId: string }).agentId;
    const parsed = archiveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.archiveAgentProfile(agentId, parsed.data ?? {}));
    } catch (error) {
      return sendAgentError(reply, error);
    }
  });

  fastify.post("/api/v1/agents/:agentId/restore", async (request, reply) => {
    const agentId = (request.params as { agentId: string }).agentId;
    try {
      return reply.send(fastify.gateway.restoreAgentProfile(agentId));
    } catch (error) {
      return sendAgentError(reply, error);
    }
  });

  fastify.delete("/api/v1/agents/:agentId", async (request, reply) => {
    const agentId = (request.params as { agentId: string }).agentId;
    const parsed = deleteQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const deleted = fastify.gateway.hardDeleteAgentProfile(agentId);
      if (!deleted) {
        return reply.code(404).send({ error: `Agent profile ${agentId} not found` });
      }
      return reply.send({ deleted: true, agentId, mode: parsed.data.mode });
    } catch (error) {
      return sendAgentError(reply, error);
    }
  });
};

function sendAgentError(reply: FastifyReply, error: unknown) {
  const message = (error as Error).message;
  if (message.includes("not found")) {
    return reply.code(404).send({ error: message });
  }
  if (message.includes("cannot be hard deleted")) {
    return reply.code(409).send({ error: message });
  }
  if (message.includes("already exists") || message.includes("required")) {
    return reply.code(400).send({ error: message });
  }
  console.error("[agents] route error", error);
  return reply.code(500).send({ error: "Internal server error" });
}
