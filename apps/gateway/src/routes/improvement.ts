import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const reportListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(260).default(24),
});

const runListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(300).default(40),
});

const reportParamsSchema = z.object({
  reportId: z.string().min(1),
});

const runParamsSchema = z.object({
  runId: z.string().min(1),
});

const replayRunParamsSchema = z.object({
  replayRunId: z.string().min(1),
});

const tuneParamsSchema = z.object({
  tuneId: z.string().min(1),
});

const manualReplayBodySchema = z.object({
  sampleSize: z.coerce.number().int().positive().max(2000).optional(),
});

const replayOverrideStepSchema = z.object({
  stepKey: z.string().min(1),
  overrideKind: z.enum(["tool_output", "prompt_patch", "policy_decision"]),
  override: z.record(z.unknown()).default({}),
});

const replayDraftBodySchema = z.object({
  overrides: z.array(replayOverrideStepSchema).default([]),
});

export const improvementRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/improvement/reports", async (request, reply) => {
    const parsed = reportListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send({
      items: fastify.gateway.listImprovementReports(parsed.data.limit),
    });
  });

  fastify.get("/api/v1/improvement/reports/:reportId", async (request, reply) => {
    const params = reportParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getImprovementReport(params.data.reportId));
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/improvement/replay/run", async (request, reply) => {
    const parsed = manualReplayBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      return reply.send(await fastify.gateway.runImprovementReplayManually(parsed.data));
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/improvement/replay/runs", async (request, reply) => {
    const parsed = runListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return reply.send({
      items: fastify.gateway.listDecisionReplayRuns(parsed.data.limit),
    });
  });

  fastify.get("/api/v1/improvement/replay/runs/:runId", async (request, reply) => {
    const params = runParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getDecisionReplayRun(params.data.runId));
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/improvement/autotune/:tuneId/approve", async (request, reply) => {
    const params = tuneParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.approveDecisionAutoTune(params.data.tuneId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/improvement/autotune/:tuneId/revert", async (request, reply) => {
    const params = tuneParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.revertDecisionAutoTune(params.data.tuneId));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/replay/runs/:runId/draft", async (request, reply) => {
    const params = runParamsSchema.safeParse(request.params);
    const body = replayDraftBodySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.createReplayOverrideDraft(params.data.runId, body.data.overrides));
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/replay/runs/:runId/execute", async (request, reply) => {
    const params = runParamsSchema.safeParse(request.params);
    const body = replayDraftBodySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
    }
    try {
      return reply.send(fastify.gateway.executeReplayOverride(params.data.runId, body.data.overrides));
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/replay/:replayRunId/diff", async (request, reply) => {
    const params = replayRunParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      return reply.send(fastify.gateway.getReplayDiffSummary(params.data.replayRunId));
    } catch (error) {
      const message = (error as Error).message;
      const notFound = message.toLowerCase().includes("not found");
      return reply.code(notFound ? 404 : 409).send({ error: message });
    }
  });
};
