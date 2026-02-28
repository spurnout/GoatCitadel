import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const memoryQuerySchema = z.object({
  dir: z.string().default("memory"),
});

const authUpdateSchema = z.object({
  mode: z.enum(["none", "token", "basic"]).optional(),
  allowLoopbackBypass: z.boolean().optional(),
  token: z.string().optional(),
  basicUsername: z.string().optional(),
  basicPassword: z.string().optional(),
});

const updateSettingsSchema = z.object({
  defaultToolProfile: z.string().min(1).optional(),
  budgetMode: z.enum(["saver", "balanced", "power"]).optional(),
  networkAllowlist: z.array(z.string().min(1)).optional(),
  auth: authUpdateSchema.optional(),
  llm: z.object({
    activeProviderId: z.string().min(1).optional(),
    activeModel: z.string().min(1).optional(),
    upsertProvider: z.object({
      providerId: z.string().min(1),
      label: z.string().min(1).optional(),
      baseUrl: z.string().url().optional(),
      defaultModel: z.string().min(1).optional(),
      apiKey: z.string().min(1).optional(),
      apiKeyEnv: z.string().min(1).optional(),
      headers: z.record(z.string()).optional(),
    }).optional(),
  }).optional(),
  mesh: z.object({
    enabled: z.boolean().optional(),
    mode: z.enum(["lan", "wan", "tailnet"]).optional(),
    nodeId: z.string().min(1).optional(),
    mdns: z.boolean().optional(),
    staticPeers: z.array(z.string().min(1)).optional(),
    requireMtls: z.boolean().optional(),
    tailnetEnabled: z.boolean().optional(),
  }).optional(),
});

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/dashboard/state", async (_request, reply) => {
    return reply.send(fastify.gateway.getDashboardState());
  });

  fastify.get("/api/v1/system/vitals", async (_request, reply) => {
    return reply.send(fastify.gateway.getSystemVitals());
  });

  fastify.get("/api/v1/cron/jobs", async (_request, reply) => {
    return reply.send({ items: fastify.gateway.listCronJobs() });
  });

  fastify.get("/api/v1/operators", async (_request, reply) => {
    return reply.send({ items: fastify.gateway.listOperators() });
  });

  fastify.get("/api/v1/agents", async (_request, reply) => {
    return reply.send({ items: fastify.gateway.listAgents() });
  });

  fastify.get("/api/v1/memory/files", async (request, reply) => {
    const parsed = memoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const items = await fastify.gateway.listMemoryFiles(parsed.data.dir);
    return reply.send({ items });
  });

  fastify.get("/api/v1/settings", async (_request, reply) => {
    return reply.send(fastify.gateway.getSettings());
  });

  fastify.patch("/api/v1/settings", async (request, reply) => {
    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      return reply.send(fastify.gateway.updateSettings(parsed.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/auth/settings", async (_request, reply) => {
    return reply.send(fastify.gateway.getAuthRuntimeSettings());
  });

  fastify.patch("/api/v1/auth/settings", async (request, reply) => {
    const parsed = authUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      return reply.send(fastify.gateway.updateSettings({ auth: parsed.data }).auth);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
};
