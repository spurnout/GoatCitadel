import { describe, expect, it } from "vitest";
import type { LlmConfigFile } from "@goatcitadel/contracts";
import { LlmService } from "./llm-service.js";
import { SecretStoreService } from "./secret-store-service.js";

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

    expect(() => new LlmService(config, process.env, { secretStore: createNoopSecretStore() })).toThrowError(/blocked/i);
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

    const service = new LlmService(config, process.env, { secretStore: createNoopSecretStore() });
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

    const service = new LlmService(config, process.env, { secretStore: createNoopSecretStore() });
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

    const service = new LlmService(config, process.env, { secretStore: createNoopSecretStore() });
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

    const service = new LlmService(config, process.env, { secretStore: createNoopSecretStore() });
    const provider = service.listProviders().find((item) => item.providerId === "custom");
    expect(provider?.baseUrl).toBe("https://example.com/v1");
  });

  it("enforces network allowlist for outbound model calls", async () => {
    const config: LlmConfigFile = {
      activeProviderId: "openai",
      providers: [
        {
          providerId: "openai",
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          apiStyle: "openai-chat-completions",
          defaultModel: "gpt-4.1-mini",
        },
      ],
    };

    const service = new LlmService(config, process.env, {
      secretStore: createNoopSecretStore(),
      networkAllowlist: [],
    });
    await expect(service.listModels()).rejects.toThrowError(/allowlist/i);
  });

  it("probes keychain only for the active provider when building runtime settings", () => {
    const config: LlmConfigFile = {
      activeProviderId: "openai",
      providers: [
        {
          providerId: "openai",
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          apiStyle: "openai-chat-completions",
          defaultModel: "gpt-4.1-mini",
        },
        {
          providerId: "moonshot",
          label: "Moonshot",
          baseUrl: "https://api.moonshot.ai/v1",
          apiStyle: "openai-chat-completions",
          defaultModel: "kimi-k2.5",
        },
      ],
    };

    const secretStore = createTrackedSecretStore({
      openai: "openai-secret",
      moonshot: "moonshot-secret",
    });
    const service = new LlmService(config, process.env, { secretStore });

    const first = service.getRuntimeConfig({
      includeKeychainForActiveProvider: true,
      useCache: true,
    });
    expect(secretStore.getCalls()).toBe(1);
    expect(first.providers.find((provider) => provider.providerId === "openai")?.apiKeySource).toBe("keychain");
    expect(first.providers.find((provider) => provider.providerId === "moonshot")?.apiKeySource).toBe("none");

    const second = service.getRuntimeConfig({
      includeKeychainForActiveProvider: true,
      useCache: true,
    });
    expect(secretStore.getCalls()).toBe(1);
    expect(second.providers.find((provider) => provider.providerId === "openai")?.apiKeySource).toBe("keychain");

    const explicitMoonshot = service.getProviderSecretStatus("moonshot", {
      includeKeychain: true,
      useCache: false,
    });
    expect(secretStore.getCalls()).toBe(2);
    expect(explicitMoonshot.apiKeySource).toBe("keychain");
  });
});

function createNoopSecretStore(): SecretStoreService {
  return {
    isAvailable: () => false,
    setProviderApiKey: () => undefined,
    getProviderApiKey: () => undefined,
    deleteProviderApiKey: () => undefined,
    status: (providerId: string) => ({ providerId, hasSecret: false, source: "none" }),
  } as unknown as SecretStoreService;
}

function createTrackedSecretStore(initial: Record<string, string>): SecretStoreService & {
  getCalls: () => number;
} {
  const secrets = new Map<string, string>(Object.entries(initial));
  let gets = 0;

  return {
    isAvailable: () => true,
    setProviderApiKey: (providerId: string, apiKey: string) => {
      secrets.set(providerId, apiKey);
    },
    getProviderApiKey: (providerId: string) => {
      gets += 1;
      return secrets.get(providerId);
    },
    deleteProviderApiKey: (providerId: string) => {
      secrets.delete(providerId);
    },
    status: (providerId: string) => ({
      providerId,
      hasSecret: secrets.has(providerId),
      source: secrets.has(providerId) ? "keychain" : "none",
    }),
    getCalls: () => gets,
  } as unknown as SecretStoreService & { getCalls: () => number };
}
