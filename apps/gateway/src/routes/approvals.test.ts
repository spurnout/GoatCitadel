import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { approvalsRoutes } from "./approvals.js";

describe("approvals routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("blocks approval creation for non-loopback callers", async () => {
    app = Fastify();
    app.decorate("gateway", {
      createApproval: vi.fn(),
    } as never);
    await app.register(approvalsRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/approvals",
      headers: {
        "x-forwarded-for": "100.64.0.9",
      },
      payload: {
        kind: "tool.invoke",
        riskLevel: "danger",
        payload: {},
        preview: {},
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows remote approval creation when override env is enabled", async () => {
    vi.stubEnv("GOATCITADEL_ALLOW_REMOTE_APPROVAL_CREATE", "1");
    const createApproval = vi.fn(async () => ({
      approvalId: "apr_123",
      kind: "tool.invoke",
      status: "pending",
      riskLevel: "danger",
      payload: {},
      preview: {},
      createdAt: new Date().toISOString(),
    }));
    app = Fastify();
    app.decorate("gateway", {
      createApproval,
    } as never);
    await app.register(approvalsRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/approvals",
      headers: {
        "x-forwarded-for": "100.64.0.9",
      },
      payload: {
        kind: "tool.invoke",
        riskLevel: "danger",
        payload: {},
        preview: {},
      },
    });

    expect(response.statusCode).toBe(201);
    expect(createApproval).toHaveBeenCalledTimes(1);
  });
});
