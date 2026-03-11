import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { authPlugin } from "../plugins/auth.js";
import { authRoutes } from "./auth.js";
import type { AuthConfig } from "../config.js";

function baseAuthConfig(mode: AuthConfig["mode"]): AuthConfig {
  return {
    mode,
    allowLoopbackBypass: false,
    token: {
      value: "test-token",
      queryParam: "access_token",
    },
    basic: {
      username: "operator",
      password: "password123",
    },
  };
}

async function buildApp(mode: AuthConfig["mode"]): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate("gateway", {
    createDeviceAccessRequest: async () => ({
      requestId: "request-device-1",
      requestSecret: "request-secret-1",
      approvalId: "approval-device-1",
      status: "pending",
      expiresAt: "2026-03-10T12:00:00.000Z",
      pollAfterMs: 2500,
      message: "Waiting for approval.",
    }),
    getDeviceAccessRequestStatus: async () => ({
      requestId: "request-device-1",
      approvalId: "approval-device-1",
      status: "approved",
      expiresAt: "2026-03-10T12:00:00.000Z",
      resolvedAt: "2026-03-10T11:55:00.000Z",
      deviceToken: "device-bearer",
      deviceTokenExpiresAt: "2026-04-09T11:55:00.000Z",
      message: "Access approved.",
    }),
    validateDeviceAccessToken: () => undefined,
  } as never);
  app.decorate("gatewayConfig", {
    assistant: {
      auth: baseAuthConfig(mode),
    },
  } as never);
  await app.register(authPlugin);
  await app.register(authRoutes);
  return app;
}

describe("auth routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("returns 400 for SSE token bridge in auth mode none", async () => {
    app = await buildApp("none");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sse-token",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "SSE token bridge is not needed when auth mode is none",
    });
  });

  it("issues SSE token in token mode", async () => {
    app = await buildApp("token");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sse-token",
      headers: {
        Authorization: "Bearer test-token",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token: expect.any(String),
      expiresAt: expect.any(String),
      scope: "events:stream",
    });
  });

  it("creates a device approval request without prior auth", async () => {
    app = await buildApp("token");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/device-requests",
      payload: {
        deviceLabel: "LAN laptop",
        deviceType: "desktop",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      requestId: "request-device-1",
      approvalId: "approval-device-1",
      status: "pending",
    });
  });

  it("returns device request status when the request secret matches", async () => {
    app = await buildApp("basic");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/device-requests/ef7d2d5a-f19c-4aa0-b5cf-1a501928ea3f/status",
      headers: {
        "x-goatcitadel-device-request-secret": "request-secret-1",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestId: "request-device-1",
      status: "approved",
      deviceToken: "device-bearer",
    });
  });
});
