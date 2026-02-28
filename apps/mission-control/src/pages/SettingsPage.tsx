import { useEffect, useMemo, useState } from "react";
import {
  createLlmChatCompletion,
  evaluateUiChangeRisk,
  fetchLlmModels,
  fetchSettings,
  patchSettings,
  type RuntimeSettingsResponse,
} from "../api/client";
import { ChangeReviewPanel } from "../components/ChangeReviewPanel";
import { PageGuideCard } from "../components/PageGuideCard";
import { SelectOrCustom, type SelectOption } from "../components/SelectOrCustom";

const TOOL_PROFILE_OPTIONS: SelectOption[] = [
  { value: "minimal", label: "minimal (safest)" },
  { value: "standard", label: "standard" },
  { value: "coding", label: "coding" },
  { value: "ops", label: "ops" },
  { value: "research", label: "research" },
  { value: "danger", label: "danger (high risk)" },
];

const PROVIDER_TEMPLATES: Array<{
  providerId: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
}> = [
  {
    providerId: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
  },
  {
    providerId: "anthropic",
    label: "Anthropic (compatible endpoint)",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-7-sonnet-latest",
  },
  {
    providerId: "google",
    label: "Google (compatible endpoint)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
  },
  {
    providerId: "minimax",
    label: "MiniMax (compatible endpoint)",
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-Text-01",
  },
  {
    providerId: "vercel",
    label: "Vercel AI Gateway",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    defaultModel: "openai/gpt-4.1-mini",
  },
  {
    providerId: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
  },
  {
    providerId: "ollama",
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3.1",
  },
  {
    providerId: "localai",
    label: "LocalAI",
    baseUrl: "http://127.0.0.1:8080/v1",
    defaultModel: "local-model",
  },
  {
    providerId: "npu-local",
    label: "NPU Local Sidecar",
    baseUrl: "http://127.0.0.1:11440/v1",
    defaultModel: "phi-3.5-mini-instruct",
  },
  {
    providerId: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
  },
  {
    providerId: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
  },
  {
    providerId: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    providerId: "glm",
    label: "GLM (compatible endpoint)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    defaultModel: "glm-5",
  },
  {
    providerId: "moonshot",
    label: "Moonshot (Kimi API)",
    baseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k2.5",
  },
  {
    providerId: "perplexity",
    label: "Perplexity",
    baseUrl: "https://api.perplexity.ai/v1",
    defaultModel: "sonar",
  },
  {
    providerId: "huggingface",
    label: "HuggingFace Inference",
    baseUrl: "https://router.huggingface.co/v1",
    defaultModel: "openai/gpt-oss-120b",
  },
];

const ALLOWLIST_PRESETS: Array<{ id: string; label: string; hosts: string[] }> = [
  { id: "strict", label: "Strict (no outbound hosts)", hosts: [] },
  { id: "local", label: "Local models only", hosts: ["127.0.0.1", "localhost"] },
  {
    id: "common-llm",
    label: "Common providers + local",
    hosts: ["127.0.0.1", "localhost", "api.openai.com", "openrouter.ai"],
  },
];

const CHAT_PROMPT_PRESETS: Array<{ id: string; label: string; prompt: string }> = [
  { id: "hello", label: "Hello smoke test", prompt: "Say hello from OpenAI-compatible chat completions." },
  {
    id: "plan",
    label: "Planning response",
    prompt: "In 5 bullets, propose a safe implementation plan for a new feature.",
  },
  {
    id: "safety",
    label: "Safety check",
    prompt: "Summarize one policy risk and one mitigation for executing a risky shell command.",
  },
];

const GATEWAY_AUTH_STORAGE_KEY = "goatcitadel.gateway.auth";

export function SettingsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [settings, setSettings] = useState<RuntimeSettingsResponse | null>(null);
  const [profile, setProfile] = useState("");
  const [budgetMode, setBudgetMode] = useState<"saver" | "balanced" | "power">("balanced");
  const [networkAllowlistText, setNetworkAllowlistText] = useState("");

  const [activeProviderId, setActiveProviderId] = useState("");
  const [activeModel, setActiveModel] = useState("");
  const [providerId, setProviderId] = useState("custom");
  const [providerLabel, setProviderLabel] = useState("Custom");
  const [providerBaseUrl, setProviderBaseUrl] = useState("http://127.0.0.1:1234/v1");
  const [providerDefaultModel, setProviderDefaultModel] = useState("local-model");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerApiKeyEnv, setProviderApiKeyEnv] = useState("");
  const [authMode, setAuthMode] = useState<"none" | "token" | "basic">("none");
  const [allowLoopbackBypass, setAllowLoopbackBypass] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [models, setModels] = useState<Array<{ id: string; ownedBy?: string; created?: number }>>([]);
  const [chatPrompt, setChatPrompt] = useState("Say hello from OpenAI-compatible chat completions.");
  const [chatPromptPresetId, setChatPromptPresetId] = useState("hello");
  const [chatUseMemory, setChatUseMemory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allowlistPreset, setAllowlistPreset] = useState("strict");
  const [chatResponse, setChatResponse] = useState("");
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [changeReview, setChangeReview] = useState<{
    overall: "safe" | "warning" | "critical";
    items: Array<{ field: string; level: "safe" | "warning" | "critical"; hint?: string }>;
  }>({
    overall: "safe",
    items: [],
  });
  const [error, setError] = useState<string | null>(null);

  const providerOptions = useMemo(() => settings?.llm.providers ?? [], [settings]);
  const providerSelectOptions = useMemo<SelectOption[]>(() => {
    const fromSettings = providerOptions.map((provider) => ({
      value: provider.providerId,
      label: `${provider.providerId} (${provider.baseUrl})`,
    }));
    const fromTemplates = PROVIDER_TEMPLATES.map((template) => ({
      value: template.providerId,
      label: `${template.providerId} (${template.baseUrl})`,
    }));
    return [...fromSettings, ...fromTemplates];
  }, [providerOptions]);

  const activeModelOptions = useMemo<SelectOption[]>(() => {
    const items = [
      ...models.map((model) => model.id),
      ...providerOptions.map((provider) => provider.defaultModel),
      providerDefaultModel,
      activeModel,
    ].filter(Boolean) as string[];

    return [...new Set(items)].map((item) => ({ value: item, label: item }));
  }, [activeModel, models, providerDefaultModel, providerOptions]);

  const providerLabelOptions = useMemo<SelectOption[]>(() => {
    const builtins = PROVIDER_TEMPLATES.map((template) => ({
      value: template.label,
      label: template.label,
    }));
    const existing = providerOptions.map((provider) => ({
      value: provider.label,
      label: provider.label,
    }));
    return [...builtins, ...existing];
  }, [providerOptions]);

  const load = () => {
    void fetchSettings()
      .then((res) => {
        setSettings(res);
        setProfile(res.defaultToolProfile);
        setBudgetMode((res.budgetMode as "saver" | "balanced" | "power") || "balanced");
        setNetworkAllowlistText(res.networkAllowlist.join("\n"));
        setAllowlistPreset(matchAllowlistPreset(res.networkAllowlist));
        setAuthMode(res.auth.mode);
        setAllowLoopbackBypass(res.auth.allowLoopbackBypass);

        setActiveProviderId(res.llm.activeProviderId);
        setActiveModel(res.llm.activeModel);
        setProviderId(res.llm.activeProviderId);

        const activeProvider = res.llm.providers.find((provider) => provider.providerId === res.llm.activeProviderId);
        if (activeProvider) {
          setProviderLabel(activeProvider.label);
          setProviderBaseUrl(activeProvider.baseUrl);
          setProviderDefaultModel(activeProvider.defaultModel);
        }

        setChatPromptPresetId("hello");
        hydrateStoredAuthCredentials();
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    const changes = [
      { field: "defaultToolProfile", from: settings.defaultToolProfile, to: profile },
      { field: "budgetMode", from: settings.budgetMode, to: budgetMode },
      { field: "networkAllowlist", from: settings.networkAllowlist.join("\n"), to: networkAllowlistText },
      { field: "authMode", from: settings.auth.mode, to: authMode },
      { field: "providerBaseUrl", from: settings.llm.providers.find((p) => p.providerId === providerId)?.baseUrl ?? "", to: providerBaseUrl },
    ];
    void evaluateUiChangeRisk({
      pageId: "settings",
      changes,
    })
      .then((res) => {
        setChangeReview({
          overall: res.overall,
          items: res.items.map((item) => ({
            field: item.field,
            level: item.level,
            hint: item.hint,
          })),
        });
      })
      .catch(() => {
        setChangeReview({
          overall: "warning",
          items: [{
            field: "settings",
            level: "warning",
            hint: "Unable to load server risk hints.",
          }],
        });
      });
  }, [settings, profile, budgetMode, networkAllowlistText, authMode, providerId, providerBaseUrl]);

  const onSaveRuntime = async () => {
    if (changeReview.overall === "critical" && !criticalConfirmed) {
      setError("Confirm critical changes before saving.");
      return;
    }
    try {
      const allowlist = networkAllowlistText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const next = await patchSettings({
        defaultToolProfile: profile,
        budgetMode,
        networkAllowlist: allowlist,
      });
      setSettings(next);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onSaveActiveLlm = async () => {
    if (changeReview.overall === "critical" && !criticalConfirmed) {
      setError("Confirm critical changes before saving.");
      return;
    }
    try {
      const next = await patchSettings({
        llm: {
          activeProviderId,
          activeModel,
        },
      });
      setSettings(next);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onSaveProvider = async () => {
    if (changeReview.overall === "critical" && !criticalConfirmed) {
      setError("Confirm critical changes before saving.");
      return;
    }
    try {
      const next = await patchSettings({
        llm: {
          upsertProvider: {
            providerId,
            label: providerLabel || undefined,
            baseUrl: providerBaseUrl || undefined,
            defaultModel: providerDefaultModel || undefined,
            apiKey: providerApiKey || undefined,
            apiKeyEnv: providerApiKeyEnv || undefined,
          },
        },
      });
      setSettings(next);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onLoadModels = async () => {
    try {
      const res = await fetchLlmModels(activeProviderId || undefined);
      setModels(res.items);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onTestChat = async () => {
    try {
      const res = await createLlmChatCompletion({
        providerId: activeProviderId || undefined,
        model: activeModel || undefined,
        messages: [{ role: "user", content: chatPrompt }],
        memory: chatUseMemory ? { mode: "qmd", enabled: true } : { mode: "off", enabled: false },
      });
      const text = res.choices?.[0]?.message?.content;
      if (typeof text === "string") {
        setChatResponse(text);
      } else {
        setChatResponse(JSON.stringify(res, null, 2));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const hydrateStoredAuthCredentials = () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(GATEWAY_AUTH_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        token?: string;
        username?: string;
        password?: string;
      };
      setAuthToken(parsed.token ?? "");
      setBasicUsername(parsed.username ?? "");
      setBasicPassword(parsed.password ?? "");
    } catch {
      // ignore parse failures
    }
  };

  const onSaveAuth = async () => {
    if (changeReview.overall === "critical" && !criticalConfirmed) {
      setError("Confirm critical changes before saving.");
      return;
    }
    try {
      const next = await patchSettings({
        auth: {
          mode: authMode,
          allowLoopbackBypass,
          token: authToken,
          basicUsername: basicUsername,
          basicPassword: basicPassword,
        },
      });
      setSettings(next);
      persistGatewayAuthClient({
        mode: authMode,
        token: authToken,
        username: basicUsername,
        password: basicPassword,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const applyProviderTemplate = (nextProviderId: string) => {
    const current = providerOptions.find((provider) => provider.providerId === nextProviderId);
    const template = PROVIDER_TEMPLATES.find((item) => item.providerId === nextProviderId);

    if (current) {
      setProviderLabel(current.label);
      setProviderBaseUrl(current.baseUrl);
      setProviderDefaultModel(current.defaultModel);
      return;
    }

    if (template) {
      setProviderLabel(template.label);
      setProviderBaseUrl(template.baseUrl);
      setProviderDefaultModel(template.defaultModel);
    }
  };

  if (!settings) {
    return <p>Loading forge settings...</p>;
  }

  const blockSaves = changeReview.overall === "critical" && !criticalConfirmed;

  return (
    <section>
      <h2>Forge</h2>
      <p className="office-subtitle">Tune policy, budgets, and model providers for GoatCitadel.</p>
      <PageGuideCard
        what="Forge controls runtime safety, budgets, auth, and model-provider setup."
        when="Use this for initial setup and whenever you need to adjust operating posture."
        actions={[
          "Set auth mode and confirm client credentials.",
          "Adjust tool profile/budget/allowlist for safety and cost.",
          "Configure active provider and run a test prompt.",
        ]}
        terms={[
          { term: "Tool profile", meaning: "Predefined tool capability tier from minimal to danger." },
          { term: "Allowlist", meaning: "Hosts permitted for outbound tool and provider calls." },
        ]}
      />
      {error ? <p className="error">{error}</p> : null}
      <ChangeReviewPanel
        title="Pending Configuration Risk"
        overall={changeReview.overall}
        items={changeReview.items}
        requireCriticalConfirm
        criticalConfirmed={criticalConfirmed}
        onCriticalConfirmChange={setCriticalConfirmed}
      />

      <article className="card">
        <p>Environment: {settings.environment}</p>
        <p>Workspace: {settings.workspaceDir}</p>
      </article>

      <article className="card">
        <h3>Gateway Access Control</h3>
        <p>Use auth modes for local/online hosting. Mission Control stores your client creds locally in this browser.</p>
        <div className="controls-row">
          <label htmlFor="authMode">Auth Mode</label>
          <select
            id="authMode"
            value={authMode}
            onChange={(event) => setAuthMode(event.target.value as "none" | "token" | "basic")}
          >
            <option value="none">none (local trusted)</option>
            <option value="token">token</option>
            <option value="basic">basic</option>
          </select>
        </div>
        <div className="controls-row">
          <label htmlFor="allowLoopbackBypass">Allow loopback bypass</label>
          <input
            id="allowLoopbackBypass"
            type="checkbox"
            checked={allowLoopbackBypass}
            onChange={(event) => setAllowLoopbackBypass(event.target.checked)}
          />
        </div>
        {authMode === "token" ? (
          <div className="controls-row">
            <label htmlFor="authToken">Gateway token</label>
            <input
              id="authToken"
              type="password"
              value={authToken}
              onChange={(event) => setAuthToken(event.target.value)}
            />
          </div>
        ) : null}
        {authMode === "basic" ? (
          <>
            <div className="controls-row">
              <label htmlFor="basicUsername">Username</label>
              <input
                id="basicUsername"
                value={basicUsername}
                onChange={(event) => setBasicUsername(event.target.value)}
              />
            </div>
            <div className="controls-row">
              <label htmlFor="basicPassword">Password</label>
              <input
                id="basicPassword"
                type="password"
                value={basicPassword}
                onChange={(event) => setBasicPassword(event.target.value)}
              />
            </div>
          </>
        ) : null}
        <p className="office-subtitle">
          Server status: token configured: {settings.auth.tokenConfigured ? "yes" : "no"} | basic configured: {settings.auth.basicConfigured ? "yes" : "no"}
        </p>
        <button onClick={onSaveAuth} disabled={blockSaves}>Save Access Control</button>
      </article>

      <article className="card">
        <h3>Runtime Controls</h3>
        <div className="controls-row">
          <label htmlFor="profile">Tool Profile</label>
          <SelectOrCustom
            id="profile"
            value={profile}
            onChange={setProfile}
            options={TOOL_PROFILE_OPTIONS}
            customPlaceholder="Custom tool profile"
            customLabel="Custom profile"
          />
        </div>
        <div className="controls-row">
          <label htmlFor="budgetMode">Budget Mode</label>
          <select
            id="budgetMode"
            value={budgetMode}
            onChange={(event) => setBudgetMode(event.target.value as "saver" | "balanced" | "power")}
          >
            <option value="saver">saver</option>
            <option value="balanced">balanced</option>
            <option value="power">power</option>
          </select>
        </div>
        <details className="advanced-panel">
          <summary>Advanced runtime options</summary>
          <div className="controls-row">
            <label htmlFor="allowlistPreset">Allowlist Preset</label>
            <select
              id="allowlistPreset"
              value={allowlistPreset}
              onChange={(event) => {
                const nextPreset = event.target.value;
                setAllowlistPreset(nextPreset);
                const preset = ALLOWLIST_PRESETS.find((item) => item.id === nextPreset);
                if (preset) {
                  setNetworkAllowlistText(preset.hosts.join("\n"));
                }
              }}
            >
              {ALLOWLIST_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">custom</option>
            </select>
          </div>
          <label htmlFor="allowlist">Network Allowlist (one host/pattern per line)</label>
          <textarea
            id="allowlist"
            rows={6}
            className="full-textarea"
            value={networkAllowlistText}
            onChange={(event) => {
              setAllowlistPreset("custom");
              setNetworkAllowlistText(event.target.value);
            }}
          />
        </details>
        <button onClick={onSaveRuntime} disabled={blockSaves}>Save Runtime Controls</button>
      </article>

      <article className="card">
        <h3>LLM (OpenAI-Compatible, Chat Completions)</h3>
        <p>This uses `/v1/chat/completions` only. Legacy `/v1/completions` is intentionally not used.</p>

        <div className="controls-row">
          <label htmlFor="activeProvider">Active Provider</label>
          <SelectOrCustom
            id="activeProvider"
            value={activeProviderId}
            onChange={(nextProviderId) => {
              setActiveProviderId(nextProviderId);
              applyProviderTemplate(nextProviderId);
            }}
            options={providerSelectOptions}
            customPlaceholder="Custom provider id"
            customLabel="Custom active provider"
          />
        </div>

        <div className="controls-row">
          <label htmlFor="activeModel">Active Model</label>
          <SelectOrCustom
            id="activeModel"
            value={activeModel}
            onChange={setActiveModel}
            options={activeModelOptions}
            customPlaceholder="Custom model id"
            customLabel="Custom active model"
          />
          <button onClick={onLoadModels}>Load Models</button>
        </div>
        {models.length > 0 ? (
          <ul className="compact-list">
            {models.map((model) => (
              <li key={model.id}>{model.id}</li>
            ))}
          </ul>
        ) : null}
        <button onClick={onSaveActiveLlm} disabled={blockSaves}>Save Active Provider/Model</button>

        <button onClick={() => setShowAdvanced((current) => !current)}>
          {showAdvanced ? "Hide advanced provider settings" : "Show advanced provider settings"}
        </button>
        {showAdvanced ? (
          <div className="advanced-block">
            <h4>Add / Update Provider</h4>
            <div className="controls-row">
              <label htmlFor="providerId">Provider ID</label>
              <SelectOrCustom
                id="providerId"
                value={providerId}
                onChange={(nextProviderId) => {
                  setProviderId(nextProviderId);
                  applyProviderTemplate(nextProviderId);
                }}
                options={providerSelectOptions}
                customPlaceholder="e.g. corp-gateway"
                customLabel="Custom provider id"
              />
            </div>
            <div className="controls-row">
              <label htmlFor="providerLabel">Label</label>
              <SelectOrCustom
                id="providerLabel"
                value={providerLabel}
                onChange={setProviderLabel}
                options={providerLabelOptions}
                customPlaceholder="Provider display label"
                customLabel="Custom label"
              />
            </div>
            <div className="controls-row">
              <label htmlFor="providerBaseUrl">Base URL</label>
              <SelectOrCustom
                id="providerBaseUrl"
                value={providerBaseUrl}
                onChange={setProviderBaseUrl}
                options={PROVIDER_TEMPLATES.map((template) => ({
                  value: template.baseUrl,
                  label: template.baseUrl,
                }))}
                customPlaceholder="https://host/v1"
                customLabel="Custom base URL"
              />
            </div>
            <div className="controls-row">
              <label htmlFor="providerDefaultModel">Default Model</label>
              <SelectOrCustom
                id="providerDefaultModel"
                value={providerDefaultModel}
                onChange={setProviderDefaultModel}
                options={activeModelOptions}
                customPlaceholder="Default model id"
                customLabel="Custom default model"
              />
            </div>
            <div className="controls-row">
              <label htmlFor="providerApiKey">API Key (optional)</label>
              <input
                id="providerApiKey"
                type="password"
                value={providerApiKey}
                onChange={(event) => setProviderApiKey(event.target.value)}
              />
            </div>
            <div className="controls-row">
              <label htmlFor="providerApiKeyEnv">API Key Env (optional)</label>
              <SelectOrCustom
                id="providerApiKeyEnv"
                value={providerApiKeyEnv}
                onChange={setProviderApiKeyEnv}
                options={[
                  { value: "OPENAI_API_KEY", label: "OPENAI_API_KEY" },
                  { value: "OPENROUTER_API_KEY", label: "OPENROUTER_API_KEY" },
                ]}
                customPlaceholder="Custom env var name"
                customLabel="Custom env var"
              />
            </div>
            <button onClick={onSaveProvider} disabled={blockSaves}>Save Provider Settings</button>
          </div>
        ) : null}
      </article>

      <article className="card">
        <h3>LLM Test (chat/completions)</h3>
        <p className="office-subtitle">
          Test prompts default to direct model behavior without QMD memory context.
        </p>
        <div className="controls-row">
          <label htmlFor="chatPromptPreset">Prompt Preset</label>
          <select
            id="chatPromptPreset"
            value={chatPromptPresetId}
            onChange={(event) => {
              const nextPreset = event.target.value;
              setChatPromptPresetId(nextPreset);
              const preset = CHAT_PROMPT_PRESETS.find((item) => item.id === nextPreset);
              if (preset) {
                setChatPrompt(preset.prompt);
              }
            }}
          >
            {CHAT_PROMPT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            <option value="custom">custom</option>
          </select>
        </div>
        <textarea
          rows={4}
          className="full-textarea"
          value={chatPrompt}
          onChange={(event) => setChatPrompt(event.target.value)}
        />
        <div className="controls-row">
          <label htmlFor="chatUseMemory">Include memory context (QMD)</label>
          <input
            id="chatUseMemory"
            type="checkbox"
            checked={chatUseMemory}
            onChange={(event) => setChatUseMemory(event.target.checked)}
          />
        </div>
        <div className="controls-row">
          <button onClick={onTestChat}>Run Test Prompt</button>
        </div>
        {chatResponse ? <pre>{chatResponse}</pre> : null}
      </article>
    </section>
  );
}

function matchAllowlistPreset(allowlist: string[]): string {
  for (const preset of ALLOWLIST_PRESETS) {
    if (preset.hosts.length !== allowlist.length) {
      continue;
    }
    const left = [...preset.hosts].sort().join("|");
    const right = [...allowlist].sort().join("|");
    if (left === right) {
      return preset.id;
    }
  }
  return "custom";
}

function persistGatewayAuthClient(input: {
  mode: "none" | "token" | "basic";
  token?: string;
  username?: string;
  password?: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload = {
    mode: input.mode,
    token: input.token?.trim() || undefined,
    username: input.username?.trim() || undefined,
    password: input.password || undefined,
    tokenQueryParam: "access_token",
  };
  window.localStorage.setItem(GATEWAY_AUTH_STORAGE_KEY, JSON.stringify(payload));
}
