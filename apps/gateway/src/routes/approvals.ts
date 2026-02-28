import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const createSchema = z.object({
  kind: z.string().min(1),
  riskLevel: z.enum(["safe", "caution", "danger", "nuclear"]),
  payload: z.record(z.unknown()),
  preview: z.record(z.unknown()),
});

const resolveSchema = z.object({
  decision: z.enum(["approve", "reject", "edit"]),
  editedPayload: z.record(z.unknown()).optional(),
  resolutionNote: z.string().optional(),
  resolvedBy: z.string().min(1),
});

export const approvalsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/approvals", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const approval = await fastify.gateway.createApproval(parsed.data);
    return reply.code(201).send(approval);
  });

  fastify.get("/api/v1/approvals", async (request, reply) => {
    const query = request.query as { status?: "pending" | "approved" | "rejected" | "edited"; limit?: string };
    const limit = query.limit ? Math.min(Math.max(Number(query.limit), 1), 200) : 100;
    const approvals = fastify.gateway.listApprovals(query.status, limit);
    return reply.send({ items: approvals });
  });

  fastify.post("/api/v1/approvals/:approvalId/resolve", async (request, reply) => {
    const approvalId = (request.params as { approvalId: string }).approvalId;
    const parsed = resolveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await fastify.gateway.resolveApproval(approvalId, parsed.data);
    return reply.send(result);
  });

  fastify.get("/api/v1/approvals/:approvalId/replay", async (request, reply) => {
    const approvalId = (request.params as { approvalId: string }).approvalId;
    const query = request.query as { replayedBy?: string };
    const replay = fastify.gateway.getApprovalReplay(approvalId, query.replayedBy ?? "operator");
    return reply.send(replay);
  });
};
