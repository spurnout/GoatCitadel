import { useCallback, useEffect, useState } from "react";
import type { RuntimeSettingsResponse } from "../api/client";
import { fetchLlmConfig, fetchLlmModels, previewLlmModels } from "../api/client";
import { useRefreshSubscription } from "./useRefreshSubscription";

export interface ProviderModelCatalogOption {
  providerId: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyRef?: string;
  apiKeySource?: string;
  hasApiKey?: boolean;
  models: string[];
}

export interface ProviderModelPreviewResult {
  items: string[];
  source: "remote" | "fallback";
  warning?: string;
}

export function dedupeProviderModels(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function loadProviderCatalog(): Promise<{
  config: RuntimeSettingsResponse["llm"];
  providers: ProviderModelCatalogOption[];
}> {
  const config = await fetchLlmConfig();
  const providers = await Promise.all(config.providers.map(async (provider) => {
    let remoteModels: string[] = [];
    try {
      const response = await fetchLlmModels(provider.providerId);
      remoteModels = response.items.map((item) => item.id);
    } catch {
      // Keep the provider visible even if live discovery fails.
    }

    return {
      providerId: provider.providerId,
      label: provider.label,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      apiKeyRef: provider.apiKeyRef,
      apiKeySource: provider.apiKeySource,
      hasApiKey: provider.hasApiKey,
      models: dedupeProviderModels([
        provider.defaultModel,
        provider.providerId === config.activeProviderId ? config.activeModel : undefined,
        ...remoteModels,
      ]),
    } satisfies ProviderModelCatalogOption;
  }));

  return {
    config,
    providers,
  };
}

export async function previewProviderModels(input: {
  providerId: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  fallbackModel?: string;
}): Promise<ProviderModelPreviewResult> {
  const response = await previewLlmModels({
    providerId: input.providerId,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    apiKeyEnv: input.apiKeyEnv,
    headers: input.headers,
  });
  return {
    items: dedupeProviderModels([
      input.fallbackModel,
      ...response.items.map((item) => item.id),
    ]),
    source: response.source,
    warning: response.warning,
  };
}

export function useProviderModelCatalog(refreshTopic: "chat" | "system" = "system") {
  const [config, setConfig] = useState<RuntimeSettingsResponse["llm"] | null>(null);
  const [providers, setProviders] = useState<ProviderModelCatalogOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadProviderCatalog();
      setConfig(next.config);
      setProviders(next.providers);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRefreshSubscription(
    refreshTopic,
    async (signal) => {
      const haystack = `${signal.reason} ${signal.eventType ?? ""} ${signal.source ?? ""}`.toLowerCase();
      if (!/\b(llm|provider|model|onboarding|settings)\b/.test(haystack) && signal.eventType !== "fallback_poll") {
        return;
      }
      await reload();
    },
    {
      enabled: true,
      coalesceMs: 900,
      staleMs: 20000,
      pollIntervalMs: 20000,
    },
  );

  return {
    config,
    providers,
    loading,
    error,
    reload,
  };
}
