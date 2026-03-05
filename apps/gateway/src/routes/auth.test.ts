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
});
