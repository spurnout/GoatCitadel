import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { OnboardingBootstrapResult, OnboardingState } from "@goatcitadel/contracts";

interface GatewayAuthInput {
  mode: "none" | "token" | "basic";
  token?: string;
  username?: string;
  password?: string;
}

interface ProviderTemplate {
  providerId: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
}

const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { providerId: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1-mini" },
  { providerId: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-3-7-sonnet-latest" },
  { providerId: "google", label: "Google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.0-flash" },
  { providerId: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4.1-mini" },
  { providerId: "lmstudio", label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", defaultModel: "local-model" },
  { providerId: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", defaultModel: "llama3.1" },
];

const TOOL_PROFILES = ["minimal", "standard", "coding", "ops", "research", "danger"] as const;
const BUDGET_MODES = ["saver", "balanced", "power"] as const;
const MESH_MODES = ["lan", "wan", "tailnet"] as const;

async function run(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    output.write("\nGoatCitadel Onboarding Wizard (TUI)\n");
    output.write("This wizard calls gateway onboarding APIs; no direct file edits are made here.\n\n");

    const gatewayBaseUrl = await ask(rl, "Gateway URL", process.env.GOATCITADEL_GATEWAY_URL ?? "http://127.0.0.1:8787");
    const authMode = await askChoice(rl, "Gateway auth mode", ["none", "token", "basic"] as const, "none");

    const auth: GatewayAuthInput = { mode: authMode };
    if (authMode === "token") {
      auth.token = await ask(rl, "Gateway token");
    } else if (authMode === "basic") {
      auth.username = await ask(rl, "Gateway username");
      auth.password = await ask(rl, "Gateway password");
    }

    const initialState = await requestJson<OnboardingState>(
      gatewayBaseUrl,
      "/api/v1/onboarding/state",
      { method: "GET" },
      auth,
    );

    output.write("\nCurrent checklist:\n");
    for (const item of initialState.checklist) {
      output.write(`- ${item.label}: ${item.status}${item.detail ? ` (${item.detail})` : ""}\n`);
    }
    output.write("\n");

    const providerTemplateDefault = PROVIDER_TEMPLATES.some(
      (entry) => entry.providerId === initialState.settings.llm.activeProviderId,
    )
      ? initialState.settings.llm.activeProviderId
      : "custom";

    const providerTemplate = await askChoice(
      rl,
      "Provider template",
      [...PROVIDER_TEMPLATES.map((entry) => entry.providerId), "custom"] as const,
      providerTemplateDefault as (typeof PROVIDER_TEMPLATES)[number]["providerId"] | "custom",
    );

    const activeProvider = initialState.settings.llm.providers.find(
      (provider) => provider.providerId === initialState.settings.llm.activeProviderId,
    );
    const template = PROVIDER_TEMPLATES.find((entry) => entry.providerId === providerTemplate);

    const providerId = await ask(
      rl,
      "Provider ID",
      providerTemplate === "custom" ? (activeProvider?.providerId ?? "custom-provider") : providerTemplate,
    );
    const providerLabel = await ask(
      rl,
      "Provider label",
      providerTemplate === "custom"
        ? (activeProvider?.label ?? providerId)
        : (template?.label ?? activeProvider?.label ?? providerId),
    );
    const providerBaseUrl = await ask(
      rl,
      "Provider base URL",
      providerTemplate === "custom"
        ? (activeProvider?.baseUrl ?? "http://127.0.0.1:1234/v1")
        : (template?.baseUrl ?? activeProvider?.baseUrl ?? "http://127.0.0.1:1234/v1"),
    );
    const providerDefaultModel = await ask(
      rl,
      "Provider default model",
      providerTemplate === "custom"
        ? (activeProvider?.defaultModel ?? initialState.settings.llm.activeModel)
        : (template?.defaultModel ?? activeProvider?.defaultModel ?? initialState.settings.llm.activeModel),
    );
    const activeModel = await ask(rl, "Active model", initialState.settings.llm.activeModel || providerDefaultModel);
    const providerApiKey = await ask(rl, "Provider API key (optional)", "");
    const saveProviderApiKeyToSecureStore = providerApiKey
      ? await askYesNo(rl, "Save provider key to OS secure store?", true)
      : false;
    const providerApiKeyEnv = await ask(rl, "Provider API key env var (optional)", "");

    const defaultToolProfile = await askChoice(
      rl,
      "Default tool profile",
      TOOL_PROFILES,
      clampOption(initialState.settings.defaultToolProfile, TOOL_PROFILES, "minimal"),
    );
    const budgetMode = await askChoice(
      rl,
      "Budget mode",
      BUDGET_MODES,
      clampOption(initialState.settings.budgetMode, BUDGET_MODES, "balanced"),
    );
    const networkAllowlist = await askMultiline(
      rl,
      "Network allowlist hosts (comma-separated, blank for none)",
      initialState.settings.networkAllowlist.join(", "),
    );

    const meshEnabled = await askYesNo(rl, "Enable mesh?", initialState.settings.mesh.enabled);
    const meshMode = meshEnabled
      ? await askChoice(
        rl,
        "Mesh mode",
        MESH_MODES,
        clampOption(initialState.settings.mesh.mode, MESH_MODES, "lan"),
      )
      : initialState.settings.mesh.mode;
    const meshNodeId = meshEnabled
      ? await ask(rl, "Mesh node ID", initialState.settings.mesh.nodeId)
      : initialState.settings.mesh.nodeId;
    const meshMdns = meshEnabled
      ? await askYesNo(rl, "Mesh mDNS discovery?", initialState.settings.mesh.mdns)
      : initialState.settings.mesh.mdns;
    const meshStaticPeers = meshEnabled
      ? await askMultiline(rl, "Mesh static peers (comma-separated)", initialState.settings.mesh.staticPeers.join(", "))
      : initialState.settings.mesh.staticPeers;
    const meshRequireMtls = meshEnabled
      ? await askYesNo(rl, "Mesh require mTLS?", initialState.settings.mesh.requireMtls)
      : initialState.settings.mesh.requireMtls;
    const meshTailnetEnabled = meshEnabled
      ? await askYesNo(rl, "Mesh tailnet enabled?", initialState.settings.mesh.tailnetEnabled)
      : initialState.settings.mesh.tailnetEnabled;

    const markComplete = await askYesNo(rl, "Mark onboarding complete now?", true);
    const completedBy = await ask(rl, "Completed by", "tui-operator");

    const bootstrap = await requestJson<OnboardingBootstrapResult>(
      gatewayBaseUrl,
      "/api/v1/onboarding/bootstrap",
      {
        method: "POST",
        body: JSON.stringify({
          defaultToolProfile,
          budgetMode,
          networkAllowlist,
          auth: {
            mode: authMode,
            allowLoopbackBypass: initialState.settings.auth.allowLoopbackBypass,
            token: authMode === "token" ? auth.token : undefined,
            basicUsername: authMode === "basic" ? auth.username : undefined,
            basicPassword: authMode === "basic" ? auth.password : undefined,
          },
          llm: {
            activeProviderId: providerId,
            activeModel,
            upsertProvider: {
              providerId,
              label: providerLabel,
              baseUrl: providerBaseUrl,
              defaultModel: providerDefaultModel,
              apiKey: saveProviderApiKeyToSecureStore ? (providerApiKey || undefined) : undefined,
              apiKeyEnv: providerApiKeyEnv || undefined,
            },
          },
          mesh: {
            enabled: meshEnabled,
            mode: meshMode,
            nodeId: meshNodeId,
            mdns: meshMdns,
            staticPeers: meshStaticPeers,
            requireMtls: meshRequireMtls,
            tailnetEnabled: meshTailnetEnabled,
          },
          markComplete,
          completedBy,
        }),
      },
      auth,
    );

    output.write("\nOnboarding applied.\n");
    output.write(`- appliedAt: ${bootstrap.appliedAt}\n`);
    output.write(`- completed: ${bootstrap.state.completed ? "yes" : "no"}\n`);
    for (const item of bootstrap.state.checklist) {
      output.write(`- ${item.label}: ${item.status}\n`);
    }
    if (providerApiKey && !saveProviderApiKeyToSecureStore) {
      output.write("- provider key was not saved to secure store; set an env var if needed.\n");
    }

    output.write("\nDone.\n");
  } finally {
    rl.close();
  }
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue !== undefined && defaultValue !== "" ? ` [${defaultValue}]` : "";
  const raw = await rl.question(`${label}${suffix}: `);
  const value = raw.trim();
  if (!value && defaultValue !== undefined) {
    return defaultValue;
  }
  return value;
}

async function askChoice<const T extends readonly string[]>(
  rl: ReturnType<typeof createInterface>,
  label: string,
  options: T,
  defaultValue: T[number],
): Promise<T[number]> {
  output.write(`\n${label}:\n`);
  options.forEach((option, index) => {
    output.write(`  ${index + 1}) ${option}${option === defaultValue ? " (default)" : ""}\n`);
  });
  const answer = await ask(rl, "Choose number or value", defaultValue);
  const asNumber = Number(answer);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1] as T[number];
  }
  const direct = options.find((option) => option === answer);
  return (direct ?? defaultValue) as T[number];
}

async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: boolean,
): Promise<boolean> {
  const answer = (await ask(rl, `${label} (y/n)`, defaultValue ? "y" : "n")).toLowerCase();
  if (answer === "y" || answer === "yes" || answer === "true" || answer === "1") {
    return true;
  }
  if (answer === "n" || answer === "no" || answer === "false" || answer === "0") {
    return false;
  }
  return defaultValue;
}

async function askMultiline(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: string,
): Promise<string[]> {
  const raw = await ask(rl, label, defaultValue);
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  auth: GatewayAuthInput,
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if ((init.method ?? "GET").toUpperCase() !== "GET") {
    headers.set("Idempotency-Key", randomUUID());
  }
  if (auth.mode === "token" && auth.token?.trim()) {
    headers.set("Authorization", `Bearer ${auth.token.trim()}`);
  }
  if (auth.mode === "basic" && auth.username && auth.password) {
    headers.set("Authorization", `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${body}`);
  }
  return (await response.json()) as T;
}

function clampOption<const T extends readonly string[]>(
  value: string,
  options: T,
  fallback: T[number],
): T[number] {
  return (options.find((option) => option === value) ?? fallback) as T[number];
}

run().catch((error) => {
  console.error("Onboarding wizard failed.");
  console.error(error);
  process.exitCode = 1;
});
