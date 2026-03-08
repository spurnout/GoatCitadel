import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { voiceRoutes } from "./voice.js";

describe("voice routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("returns voice status and managed runtime status", async () => {
    const getVoiceStatus = vi.fn(async () => ({
      stt: {
        state: "stopped",
        provider: "whisper.cpp",
        modelId: "base.en",
        runtimeReady: false,
        updatedAt: "2026-03-08T00:00:00.000Z",
      },
      talk: {
        state: "stopped",
        updatedAt: "2026-03-08T00:00:00.000Z",
      },
      wake: {
        enabled: false,
        state: "stopped",
        model: "openwakeword",
        updatedAt: "2026-03-08T00:00:00.000Z",
      },
    }));
    const getVoiceRuntimeStatus = vi.fn(async () => ({
      provider: "whisper.cpp",
      source: "managed",
      readiness: "missing",
      binaryReady: false,
      ffmpegReady: false,
      installedModels: [],
      catalog: [],
    }));
    app = Fastify();
    app.decorate("gateway", {
      getVoiceStatus,
      getVoiceRuntimeStatus,
    } as never);
    await app.register(voiceRoutes);

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/v1/voice/status",
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(getVoiceStatus).toHaveBeenCalled();

    const runtimeResponse = await app.inject({
      method: "GET",
      url: "/api/v1/voice/runtime",
    });
    expect(runtimeResponse.statusCode).toBe(200);
    expect(getVoiceRuntimeStatus).toHaveBeenCalled();
  });

  it("installs, selects, and removes managed voice models", async () => {
    const installVoiceRuntime = vi.fn(async () => ({
      provider: "whisper.cpp",
      source: "managed",
      readiness: "ready",
      binaryReady: true,
      ffmpegReady: true,
      selectedModelId: "base.en",
      installedModels: [],
      catalog: [],
    }));
    const selectVoiceRuntimeModel = vi.fn(async (modelId: string) => ({
      provider: "whisper.cpp",
      source: "managed",
      readiness: "ready",
      binaryReady: true,
      ffmpegReady: true,
      selectedModelId: modelId,
      installedModels: [],
      catalog: [],
    }));
    const removeVoiceRuntimeModel = vi.fn(async () => ({
      provider: "whisper.cpp",
      source: "managed",
      readiness: "ready",
      binaryReady: true,
      ffmpegReady: true,
      selectedModelId: "small.en",
      installedModels: [],
      catalog: [],
    }));

    app = Fastify();
    app.decorate("gateway", {
      installVoiceRuntime,
      selectVoiceRuntimeModel,
      removeVoiceRuntimeModel,
    } as never);
    await app.register(voiceRoutes);

    const installResponse = await app.inject({
      method: "POST",
      url: "/api/v1/voice/runtime/install",
      payload: {
        modelId: "base.en",
        activate: true,
      },
    });
    expect(installResponse.statusCode).toBe(200);
    expect(installVoiceRuntime).toHaveBeenCalledWith({
      modelId: "base.en",
      activate: true,
    });

    const selectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/voice/runtime/models/base.en/select",
    });
    expect(selectResponse.statusCode).toBe(200);
    expect(selectVoiceRuntimeModel).toHaveBeenCalledWith("base.en");

    const removeResponse = await app.inject({
      method: "DELETE",
      url: "/api/v1/voice/runtime/models/base.en",
    });
    expect(removeResponse.statusCode).toBe(200);
    expect(removeVoiceRuntimeModel).toHaveBeenCalledWith("base.en");
  });
});
