import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { orchestrationRoutes } from "./orchestration.js";

describe("orchestration routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("validates orchestration plan creation", async () => {
    const createOrchestrationPlan = vi.fn();
    app = Fastify();
    app.decorate("gateway", { createOrchestrationPlan } as never);
    await app.register(orchestrationRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orchestration/plans",
      payload: {
        planId: "plan-1",
        goal: "",
        mode: "auto",
        maxIterations: 3,
        maxRuntimeMinutes: 15,
        maxCostUsd: 1,
        waves: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createOrchestrationPlan).not.toHaveBeenCalled();
  });

  it("runs plans and exposes checkpoints/context", async () => {
    const runOrchestrationPlan = vi.fn(() => ({ runId: "run-1" }));
    const listRunCheckpoints = vi.fn(() => [{ checkpointId: "cp-1" }]);
    const listRunContexts = vi.fn(() => [{ contextId: "ctx-1" }]);
    app = Fastify();
    app.decorate("gateway", {
      runOrchestrationPlan,
      listRunCheckpoints,
      listRunContexts,
    } as never);
    await app.register(orchestrationRoutes);

    const runResponse = await app.inject({
      method: "POST",
      url: "/api/v1/orchestration/plans/plan-1/run",
    });
    expect(runResponse.statusCode).toBe(200);
    expect(runOrchestrationPlan).toHaveBeenCalledWith("plan-1");

    const checkpoints = await app.inject({
      method: "GET",
      url: "/api/v1/orchestration/runs/run-1/checkpoints",
    });
    expect(checkpoints.statusCode).toBe(200);
    expect(checkpoints.json()).toMatchObject({ items: [{ checkpointId: "cp-1" }] });

    const context = await app.inject({
      method: "GET",
      url: "/api/v1/orchestration/runs/run-1/context",
    });
    expect(context.statusCode).toBe(200);
    expect(context.json()).toMatchObject({ items: [{ contextId: "ctx-1" }] });
  });
});
