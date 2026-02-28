import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const skillsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/skills", async (_request, reply) => {
    return reply.send({ items: fastify.gateway.listSkills() });
  });

  fastify.post("/api/v1/skills/reload", async (_request, reply) => {
    const items = await fastify.gateway.reloadSkills();
    return reply.send({ items });
  });

  fastify.post("/api/v1/skills/resolve-activation", async (request, reply) => {
    const schema = z.object({
      text: z.string().min(1),
      explicitSkills: z.array(z.string()).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const decision = fastify.gateway.resolveSkillActivation(parsed.data);
    return reply.send(decision);
  });
};