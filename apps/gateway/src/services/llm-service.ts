import { isIP } from "node:net";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  LlmConfigFile,
  LlmModelRecord,
  LlmProviderConfig,
  LlmProviderSummary,
  LlmRuntimeConfig,
} from "@goatcitadel/contracts";

export interface LlmRuntimeUpdateInput {
  activeProviderId?: string;
  activeModel?: string;
  upsertProvider?: {
    providerId: string;
    label?: string;
    baseUrl?: string;
    defaultModel?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    headers?: Record<string, string>;
  };
}

interface ResolvedProvider {
  provider: LlmProviderConfig;
  apiKey?: string;
}

const DISALLOWED_BASE_HOSTS = new Set([
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal",
  "100.100.100.200",
]);

export class LlmService {
  private readonly providers = new Map<string, LlmProviderConfig>();
  private activeProviderId: string;
  private activeModel: string;

  public constructor(config: LlmConfigFile, private readonly env: NodeJS.ProcessEnv = process.env) {
    for (const provider of config.providers) {
      this.providers.set(provider.providerId, normalizeProvider(provider));
    }

    const active = this.providers.get(config.activeProviderId) ?? this.providers.values().next().value;
    if (!active) {
      throw new Error("LLM configuration must include at least one provider");
    }

    this.activeProviderId = active.providerId;
    this.activeModel = active.defaultModel;
  }

  public listProviders(): LlmProviderSummary[] {
    return Array.from(this.providers.values()).map((provider) => {
      const apiKey = this.resolveApiKey(provider);
      return {
        providerId: provider.providerId,
        label: provider.label,
        baseUrl: provider.baseUrl,
        apiStyle: provider.apiStyle,
        defaultModel: provider.defaultModel,
        hasApiKey: Boolean(apiKey),
        apiKeySource: provider.apiKey ? "inline" : provider.apiKeyEnv ? (this.env[provider.apiKeyEnv] ? "env" : "none") : "none",
      };
    });
  }

  public getRuntimeConfig(): LlmRuntimeConfig {
    return {
      activeProviderId: this.activeProviderId,
      activeModel: this.activeModel,
      providers: this.listProviders(),
    };
  }

  public updateRuntimeConfig(input: LlmRuntimeUpdateInput): LlmRuntimeConfig {
    if (input.upsertProvider) {
      const existing = this.providers.get(input.upsertProvider.providerId);
      const merged: LlmProviderConfig = normalizeProvider({
        providerId: input.upsertProvider.providerId,
        label: input.upsertProvider.label ?? existing?.label ?? input.upsertProvider.providerId,
        baseUrl: input.upsertProvider.baseUrl ?? existing?.baseUrl ?? "http://127.0.0.1:1234/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: input.upsertProvider.defaultModel ?? existing?.defaultModel ?? "gpt-4o-mini",
        apiKey: input.upsertProvider.apiKey ?? existing?.apiKey,
        apiKeyEnv: input.upsertProvider.apiKeyEnv ?? existing?.apiKeyEnv,
        headers: input.upsertProvider.headers ?? existing?.headers,
      });
      this.providers.set(merged.providerId, merged);
    }

    if (input.activeProviderId) {
      const provider = this.providers.get(input.activeProviderId);
      if (!provider) {
        throw new Error(`Unknown LLM provider: ${input.activeProviderId}`);
      }
      this.activeProviderId = provider.providerId;
      if (!input.activeModel) {
        this.activeModel = provider.defaultModel;
      }
    }

    if (input.activeModel) {
      this.activeModel = input.activeModel;
    }

    return this.getRuntimeConfig();
  }

  public exportConfigFile(): LlmConfigFile {
    return {
      activeProviderId: this.activeProviderId,
      providers: Array.from(this.providers.values()).map((provider) => ({
        ...provider,
        apiKey: undefined,
      })),
    };
  }

  public async listModels(providerId?: string): Promise<LlmModelRecord[]> {
    const resolved = this.resolveProvider(providerId);
    const response = await fetch(`${resolved.provider.baseUrl}/models`, {
      method: "GET",
      headers: this.buildHeaders(resolved),
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });

    if (isRedirect(response.status)) {
      throw new Error(`model listing blocked redirect (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(await buildHttpError("model listing", response));
    }

    const json = (await response.json()) as { data?: Array<Record<string, unknown>> };
    return (json.data ?? []).map((record) => ({
      id: String(record.id ?? ""),
      ownedBy: record.owned_by ? String(record.owned_by) : undefined,
      created: typeof record.created === "number" ? record.created : undefined,
    })).filter((record) => Boolean(record.id));
  }

  public async chatCompletions(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!request.messages || request.messages.length === 0) {
      throw new Error("chat/completions requires at least one message");
    }

    const resolved = this.resolveProvider(request.providerId);
    const model = request.model ?? (resolved.provider.providerId === this.activeProviderId ? this.activeModel : resolved.provider.defaultModel);

    const payload: Record<string, unknown> = {
      model,
      messages: request.messages,
      stream: request.stream ?? false,
    };
    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.top_p !== undefined) payload.top_p = request.top_p;
    if (request.max_tokens !== undefined) payload.max_tokens = request.max_tokens;
    if (request.tools !== undefined) payload.tools = request.tools;
    if (request.tool_choice !== undefined) payload.tool_choice = request.tool_choice;
    if (request.stop !== undefined) payload.stop = request.stop;
    if (request.response_format !== undefined) payload.response_format = request.response_format;
    if (request.metadata !== undefined) payload.metadata = request.metadata;

    const response = await fetch(`${resolved.provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(resolved),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
      redirect: "manual",
    });

    if (isRedirect(response.status)) {
      throw new Error(`chat completion blocked redirect (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(await buildHttpError("chat completion", response));
    }

    return (await response.json()) as ChatCompletionResponse;
  }

  private resolveProvider(providerId?: string): ResolvedProvider {
    const selectedId = providerId ?? this.activeProviderId;
    const provider = this.providers.get(selectedId);
    if (!provider) {
      throw new Error(`Unknown LLM provider: ${selectedId}`);
    }

    const apiKey = this.resolveApiKey(provider);
    return { provider, apiKey };
  }

  private resolveApiKey(provider: LlmProviderConfig): string | undefined {
    if (provider.apiKey && provider.apiKey.trim()) {
      return provider.apiKey.trim();
    }
    if (provider.apiKeyEnv) {
      const envValue = this.env[provider.apiKeyEnv];
      if (envValue && envValue.trim()) {
        return envValue.trim();
      }
    }
    return undefined;
  }

  private buildHeaders(resolved: ResolvedProvider): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(resolved.provider.headers ?? {}),
    };

    if (resolved.apiKey) {
      headers.Authorization = `Bearer ${resolved.apiKey}`;
    }
    return headers;
  }
}

function normalizeProvider(provider: LlmProviderConfig): LlmProviderConfig {
  const base = provider.baseUrl.trim().replace(/\/+$/, "");
  validateProviderBaseUrl(base);
  const withV1 = shouldAppendV1(base) ? `${base}/v1` : base;
  return {
    ...provider,
    baseUrl: withV1,
    apiStyle: "openai-chat-completions",
  };
}

function shouldAppendV1(baseUrl: string): boolean {
  const parsed = new URL(baseUrl);
  const path = parsed.pathname.replace(/\/+$/, "");

  // No path segment -> default to OpenAI-style /v1.
  if (!path || path === "/") {
    return true;
  }

  // Already points at v1 explicitly.
  if (/\/v1$/i.test(path)) {
    return false;
  }

  // Keep provider-specific versioned paths (e.g. /api/paas/v4, /v1beta/openai).
  if (/\/v\d+(?:\.\d+)?$/i.test(path) || /\/openai$/i.test(path)) {
    return false;
  }

  return true;
}

async function buildHttpError(action: string, response: Response): Promise<string> {
  const text = await response.text();
  const snippet = text.slice(0, 400);
  return `${action} failed (${response.status} ${response.statusText}): ${snippet}`;
}

function validateProviderBaseUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid provider baseUrl: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported provider protocol: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new Error("Provider baseUrl must include a hostname");
  }

  if (DISALLOWED_BASE_HOSTS.has(host)) {
    throw new Error(`Provider host ${host} is blocked`);
  }

  if (host === "localhost" || host === "::1" || host === "127.0.0.1") {
    return;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateOrReservedIpv4(host)) {
    throw new Error(`Provider host ${host} is a private/reserved IPv4 address`);
  }
  if (ipVersion === 6 && isBlockedIpv6(host)) {
    throw new Error(`Provider host ${host} is a private/reserved IPv6 address`);
  }

  if (host.endsWith(".local")) {
    throw new Error(`Provider host ${host} is a local network domain`);
  }
}

function isPrivateOrReservedIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}
