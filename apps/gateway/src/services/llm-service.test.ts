import { describe, expect, it } from "vitest";
import type { LlmConfigFile } from "@goatcitadel/contracts";
import { LlmService } from "./llm-service.js";

describe("LlmService", () => {
  it("blocks private metadata endpoints as provider baseUrl", () => {
    const config: LlmConfigFile = {
      activeProviderId: "bad",
      providers: [
        {
          providerId: "bad",
          label: "bad",
          baseUrl: "http://169.254.169.254/latest",
          apiStyle: "openai-chat-completions",
          defaultModel: "test",
        },
      ],
    };

    expect(() => new LlmService(config)).toThrowError(/blocked/i);
  });

  it("allows loopback providers for local runtime", () => {
    const config: LlmConfigFile = {
      activeProviderId: "local",
      providers: [
        {
          providerId: "local",
          label: "local",
          baseUrl: "http://127.0.0.1:1234/v1",
          apiStyle: "openai-chat-completions",
          defaultModel: "test",
        },
      ],
    };

    const service = new LlmService(config);
    expect(service.getRuntimeConfig().activeProviderId).toBe("local");
  });

  it("does not export plaintext apiKey values", () => {
    const config: LlmConfigFile = {
      activeProviderId: "openai",
      providers: [
        {
          providerId: "openai",
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          apiStyle: "openai-chat-completions",
          defaultModel: "gpt-4.1-mini",
          apiKey: "secret",
        },
      ],
    };

    const service = new LlmService(config);
    const exported = service.exportConfigFile();
    expect(exported.providers[0]?.apiKey).toBeUndefined();
  });

  it("keeps provider-specific versioned base paths (z.ai v4) intact", () => {
    const config: LlmConfigFile = {
      activeProviderId: "glm",
      providers: [
        {
          providerId: "glm",
          label: "GLM",
          baseUrl: "https://api.z.ai/api/paas/v4",
          apiStyle: "openai-chat-completions",
          defaultModel: "glm-5",
        },
      ],
    };

    const service = new LlmService(config);
    const provider = service.listProviders().find((item) => item.providerId === "glm");
    expect(provider?.baseUrl).toBe("https://api.z.ai/api/paas/v4");
  });

  it("adds /v1 for bare OpenAI-style roots", () => {
    const config: LlmConfigFile = {
      activeProviderId: "custom",
      providers: [
        {
          providerId: "custom",
          label: "Custom",
          baseUrl: "https://example.com",
          apiStyle: "openai-chat-completions",
          defaultModel: "x",
        },
      ],
    };

    const service = new LlmService(config);
    const provider = service.listProviders().find((item) => item.providerId === "custom");
    expect(provider?.baseUrl).toBe("https://example.com/v1");
  });
});
