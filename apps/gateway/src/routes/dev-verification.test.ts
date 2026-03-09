import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const storageUpsertMany = vi.fn();
const storageTurnCreate = vi.fn();
const storageSetActiveLeaf = vi.fn();
const storageClose = vi.fn();

vi.mock("@goatcitadel/storage", () => ({
  Storage: class Storage {
    chatMessages = {
      upsertMany: storageUpsertMany,
    };

    chatTurnTraces = {
      create: storageTurnCreate,
    };

    chatSessionBranchState = {
      setActiveLeaf: storageSetActiveLeaf,
    };

    close() {
      storageClose();
    }
  },
}));

import { devVerificationRoutes } from "./dev-verification.js";

describe("dev verification routes", () => {
  let app: FastifyInstance | null = null;
  let tempRoot: string | null = null;

  afterEach(async () => {
    storageUpsertMany.mockReset();
    storageTurnCreate.mockReset();
    storageSetActiveLeaf.mockReset();
    storageClose.mockReset();
    if (app) {
      await app.close();
      app = null;
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it("returns provider readiness when enabled", async () => {
    app = Fastify();
    app.decorate("gateway", {
      isDevDiagnosticsEnabled: () => true,
      getLlmConfig: () => ({
        activeProviderId: "glm",
        activeModel: "glm-5",
        providers: [
          {
            providerId: "glm",
            label: "GLM",
            defaultModel: "glm-5",
          },
          {
            providerId: "openai",
            label: "OpenAI",
            defaultModel: "gpt-5-mini",
          },
        ],
      }),
      getProviderSecretStatus: (providerId: string) => ({
        providerId,
        hasSecret: providerId === "glm",
        source: providerId === "glm" ? "env" : "none",
      }),
      listDevDiagnostics: () => ({
        items: [{ id: "evt-1" }],
      }),
    } as never);
    app.decorate("gatewayConfig", {
      rootDir: "f:/tmp/goatcitadel-dev",
    } as never);
    await app.register(devVerificationRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dev/verification/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      diagnosticsEnabled: true,
      rootDir: "f:/tmp/goatcitadel-dev",
      activeProviderId: "glm",
      activeModel: "glm-5",
      providers: [
        {
          providerId: "glm",
          label: "GLM",
          hasSecret: true,
          source: "env",
          active: true,
          defaultModel: "glm-5",
        },
        {
          providerId: "openai",
          label: "OpenAI",
          hasSecret: false,
          source: "none",
          active: false,
          defaultModel: "gpt-5-mini",
        },
      ],
      latestDiagnosticsCount: 1,
    });
  });

  it("seeds deterministic workspace and sessions", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "goatcitadel-dev-verification-"));
    await mkdir(path.join(tempRoot, "data", "transcripts"), { recursive: true });
    await mkdir(path.join(tempRoot, "data", "audit"), { recursive: true });

    const createWorkspace = vi.fn((input: { name: string; slug: string; description: string }) => ({
      workspaceId: "workspace-1",
      ...input,
    }));
    const createChatSession = vi.fn((input: { title: string; workspaceId: string }) => ({
      sessionId: `session-${createChatSession.mock.calls.length}`,
      ...input,
    }));

    app = Fastify();
    app.decorate("gateway", {
      isDevDiagnosticsEnabled: () => true,
      createWorkspace,
      createChatSession,
    } as never);
    app.decorate("gatewayConfig", {
      rootDir: tempRoot,
      dbPath: path.join(tempRoot, "data", "index.db"),
    } as never);
    await app.register(devVerificationRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dev/verification/seed",
      headers: {
        "Content-Type": "application/json",
      },
      payload: JSON.stringify({
        sessionCount: 3,
        longThreadTurns: 6,
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(createWorkspace).toHaveBeenCalledTimes(1);
    expect(createChatSession).toHaveBeenCalledTimes(3);
    expect(response.json()).toEqual({
      workspaceId: "workspace-1",
      sessionId: "session-3",
      sessionIds: ["session-1", "session-2", "session-3"],
      sessionTitle: "Verification Demo Session",
    });
    expect(storageUpsertMany).toHaveBeenCalledTimes(1);
    expect(storageTurnCreate).toHaveBeenCalled();
    expect(storageSetActiveLeaf).toHaveBeenCalledWith("session-3", expect.any(String));
    expect(storageClose).toHaveBeenCalledTimes(1);
  });

  it("wraps provider exercise failures in a successful response payload", async () => {
    app = Fastify();
    app.decorate("gateway", {
      isDevDiagnosticsEnabled: () => true,
      createChatCompletion: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
      createChatCompletionStream: vi.fn(),
    } as never);
    app.decorate("gatewayConfig", {
      rootDir: "f:/tmp/goatcitadel-dev",
    } as never);
    await app.register(devVerificationRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dev/verification/provider-exercise",
      headers: {
        "Content-Type": "application/json",
      },
      payload: JSON.stringify({
        scenario: "simple",
        providerId: "glm",
        model: "glm-5",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: false,
      providerId: "glm",
      model: "glm-5",
      scenario: "simple",
      error: "provider unavailable",
    });
  });

  it("uses json_object for DeepSeek structured verification payloads", async () => {
    const createChatCompletion = vi.fn(async () => ({
      choices: [{ message: { content: "{\"summary\":\"ok\",\"confidence\":\"high\"}" } }],
    }));

    app = Fastify();
    app.decorate("gateway", {
      isDevDiagnosticsEnabled: () => true,
      createChatCompletion,
      createChatCompletionStream: vi.fn(),
    } as never);
    app.decorate("gatewayConfig", {
      rootDir: "f:/tmp/goatcitadel-dev",
    } as never);
    await app.register(devVerificationRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dev/verification/provider-exercise",
      headers: {
        "Content-Type": "application/json",
      },
      payload: JSON.stringify({
        scenario: "structured",
        providerId: "deepseek",
        model: "deepseek-chat",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "deepseek",
      model: "deepseek-chat",
      response_format: {
        type: "json_object",
      },
    }));
  });

  it("keeps json_schema for non-DeepSeek structured verification payloads", async () => {
    const createChatCompletion = vi.fn(async () => ({
      choices: [{ message: { content: "{\"summary\":\"ok\",\"confidence\":\"high\"}" } }],
    }));

    app = Fastify();
    app.decorate("gateway", {
      isDevDiagnosticsEnabled: () => true,
      createChatCompletion,
      createChatCompletionStream: vi.fn(),
    } as never);
    app.decorate("gatewayConfig", {
      rootDir: "f:/tmp/goatcitadel-dev",
    } as never);
    await app.register(devVerificationRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dev/verification/provider-exercise",
      headers: {
        "Content-Type": "application/json",
      },
      payload: JSON.stringify({
        scenario: "structured",
        providerId: "openai",
        model: "gpt-4.1-mini",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "openai",
      model: "gpt-4.1-mini",
      response_format: expect.objectContaining({
        type: "json_schema",
      }),
    }));
  });
});
