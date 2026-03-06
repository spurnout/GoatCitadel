import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { toolsInvokeRoute } from "./tools-invoke.js";

describe("tools invoke route", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("blocks mutating browser actions without verification", async () => {
    const invokeTool = vi.fn();
    app = Fastify();
    app.decorate("gateway", {
      invokeTool,
      isFeatureEnabled: vi.fn((flag: string) => flag === "computerUseGuardrailsV1Enabled"),
    } as never);
    await app.register(toolsInvokeRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tools/invoke",
      payload: {
        toolName: "browser.interact",
        args: {
          steps: [{ action: "click" }],
        },
        agentId: "agent-1",
        sessionId: "session-1",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(invokeTool).not.toHaveBeenCalled();
  });

  it("passes validated requests to the gateway with safety metadata", async () => {
    const invokeTool = vi.fn(async (input) => ({ ok: true, input }));
    app = Fastify();
    app.decorate("gateway", {
      invokeTool,
      isFeatureEnabled: vi.fn((flag: string) => flag === "computerUseGuardrailsV1Enabled"),
    } as never);
    await app.register(toolsInvokeRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tools/invoke",
      payload: {
        toolName: "browser.interact",
        args: {
          steps: [{ action: "click" }],
          verifyStep: true,
          confirmBeforeSubmit: true,
        },
        agentId: "agent-1",
        sessionId: "session-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(invokeTool).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.objectContaining({
        __gcSafety: {
          verified: true,
          confirmed: true,
          enforced: true,
        },
      }),
    }));
  });
});
