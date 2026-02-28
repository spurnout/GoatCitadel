import { useEffect, useMemo, useState } from "react";
import {
  bootstrapOnboarding,
  completeOnboarding,
  fetchOnboardingState,
  type OnboardingCompleteResponse,
  type RuntimeSettingsResponse,
} from "../api/client";
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
  { providerId: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1-mini" },
  { providerId: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-3-7-sonnet-latest" },
  { providerId: "google", label: "Google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.0-flash" },
  { providerId: "glm", label: "GLM (Z.AI)", baseUrl: "https://api.z.ai/api/paas/v4", defaultModel: "glm-5" },
  { providerId: "moonshot", label: "Moonshot (Kimi API)", baseUrl: "https://api.moonshot.ai/v1", defaultModel: "kimi-k2.5" },
  { providerId: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4.1-mini" },
  { providerId: "lmstudio", label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", defaultModel: "local-model" },
  { providerId: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", defaultModel: "llama3.1" },
];

const BUDGET_OPTIONS: Array<RuntimeSettingsResponse["budgetMode"]> = ["saver", "balanced", "power"];

const ALLOWLIST_PRESETS: Array<{ id: string; label: string; hosts: string[] }> = [
  { id: "strict", label: "Strict (none)", hosts: [] },
  { id: "local", label: "Local only", hosts: ["127.0.0.1", "localhost"] },
  { id: "common", label: "Common cloud + local", hosts: ["127.0.0.1", "localhost", "api.openai.com", "openrouter.ai"] },
];

const STEP_TITLES = [
  "Gateway Access",
  "LLM Provider",
  "Runtime Defaults",
  "Mesh (Optional)",
  "Review & Apply",
] as const;

type StepId = 0 | 1 | 2 | 3 | 4;

export function OnboardingPage({ onCompleted }: { onCompleted?: () => void } = {}) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [step, setStep] = useState<StepId>(0);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Awaited<ReturnType<typeof fetchOnboardingState>> | null>(null);

  const [authMode, setAuthMode] = useState<"none" | "token" | "basic">("none");
  const [allowLoopbackBypass, setAllowLoopbackBypass] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");

  const [activeProviderId, setActiveProviderId] = useState("openai");
  const [activeModel, setActiveModel] = useState("gpt-4.1-mini");
  const [providerLabel, setProviderLabel] = useState("OpenAI");
  const [providerBaseUrl, setProviderBaseUrl] = useState("https://api.openai.com/v1");
  const [providerDefaultModel, setProviderDefaultModel] = useState("gpt-4.1-mini");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerApiKeyEnv, setProviderApiKeyEnv] = useState("");

  const [defaultToolProfile, setDefaultToolProfile] = useState("minimal");
  const [budgetMode, setBudgetMode] = useState<RuntimeSettingsResponse["budgetMode"]>("balanced");
  const [allowlistPreset, setAllowlistPreset] = useState("strict");
  const [networkAllowlistText, setNetworkAllowlistText] = useState("");

  const [meshEnabled, setMeshEnabled] = useState(false);
  const [meshMode, setMeshMode] = useState<"lan" | "wan" | "tailnet">("lan");
  const [meshNodeId, setMeshNodeId] = useState("");
  const [meshMdns, setMeshMdns] = useState(true);
  const [meshStaticPeers, setMeshStaticPeers] = useState("");
  const [meshRequireMtls, setMeshRequireMtls] = useState(true);
  const [meshTailnetEnabled, setMeshTailnetEnabled] = useState(false);

  const [markComplete, setMarkComplete] = useState(true);

  const providerOptions = useMemo<SelectOption[]>(() => {
    const fromState = (state?.settings.llm.providers ?? []).map((provider) => ({
      value: provider.providerId,
      label: `${provider.providerId} (${provider.baseUrl})`,
    }));
    const fromTemplates = PROVIDER_TEMPLATES.map((template) => ({
      value: template.providerId,
      label: `${template.providerId} (${template.baseUrl})`,
    }));
    return [...fromState, ...fromTemplates];
  }, [state]);

  const modelOptions = useMemo<SelectOption[]>(() => {
    const values = [
      activeModel,
      providerDefaultModel,
      ...(state?.settings.llm.providers.map((provider) => provider.defaultModel) ?? []),
      ...PROVIDER_TEMPLATES.map((template) => template.defaultModel),
    ].filter(Boolean);
    return [...new Set(values)].map((value) => ({ value, label: value }));
  }, [activeModel, providerDefaultModel, state]);

  const providerLabelOptions = useMemo<SelectOption[]>(() => {
    const values = [
      providerLabel,
      ...(state?.settings.llm.providers.map((provider) => provider.label) ?? []),
      ...PROVIDER_TEMPLATES.map((template) => template.label),
    ].filter(Boolean);
    return [...new Set(values)].map((value) => ({ value, label: value }));
  }, [providerLabel, state]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchOnboardingState();
      setState(next);
      hydrateFromState(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const hydrateFromState = (next: Awaited<ReturnType<typeof fetchOnboardingState>>) => {
    setAuthMode(next.settings.auth.mode);
    setAllowLoopbackBypass(next.settings.auth.allowLoopbackBypass);
    setDefaultToolProfile(next.settings.defaultToolProfile);
    setBudgetMode(next.settings.budgetMode);
    setNetworkAllowlistText(next.settings.networkAllowlist.join("\n"));
    setAllowlistPreset(matchAllowlistPreset(next.settings.networkAllowlist));

    setActiveProviderId(next.settings.llm.activeProviderId);
    setActiveModel(next.settings.llm.activeModel);
    const activeProvider = next.settings.llm.providers.find((provider) => provider.providerId === next.settings.llm.activeProviderId);
    if (activeProvider) {
      setProviderLabel(activeProvider.label);
      setProviderBaseUrl(activeProvider.baseUrl);
      setProviderDefaultModel(activeProvider.defaultModel);
    }

    setMeshEnabled(next.settings.mesh.enabled);
    setMeshMode(next.settings.mesh.mode);
    setMeshNodeId(next.settings.mesh.nodeId);
    setMeshMdns(next.settings.mesh.mdns);
    setMeshStaticPeers(next.settings.mesh.staticPeers.join("\n"));
    setMeshRequireMtls(next.settings.mesh.requireMtls);
    setMeshTailnetEnabled(next.settings.mesh.tailnetEnabled);
  };

  const applyProviderTemplate = (providerId: string) => {
    const existing = state?.settings.llm.providers.find((provider) => provider.providerId === providerId);
    const template = PROVIDER_TEMPLATES.find((candidate) => candidate.providerId === providerId);
    const source = existing ?? template;
    if (!source) {
      return;
    }
    setProviderLabel(source.label);
    setProviderBaseUrl(source.baseUrl);
    setProviderDefaultModel(source.defaultModel);
    if (!activeModel || activeModel === providerDefaultModel) {
      setActiveModel(source.defaultModel);
    }
  };

  const applyAllowlistPreset = (presetId: string) => {
    setAllowlistPreset(presetId);
    const preset = ALLOWLIST_PRESETS.find((item) => item.id === presetId);
    if (preset) {
      setNetworkAllowlistText(preset.hosts.join("\n"));
    }
  };

  const submit = async () => {
    setApplying(true);
    setError(null);
    try {
      const bootstrap = await bootstrapOnboarding({
        defaultToolProfile: defaultToolProfile as "minimal" | "standard" | "coding" | "ops" | "research" | "danger",
        budgetMode,
        networkAllowlist: parseMultiline(networkAllowlistText),
        auth: {
          mode: authMode,
          allowLoopbackBypass,
          token: authMode === "token" ? authToken : undefined,
          basicUsername: authMode === "basic" ? basicUsername : undefined,
          basicPassword: authMode === "basic" ? basicPassword : undefined,
        },
        llm: {
          activeProviderId,
          activeModel,
          upsertProvider: {
            providerId: activeProviderId,
            label: providerLabel || undefined,
            baseUrl: providerBaseUrl || undefined,
            defaultModel: providerDefaultModel || undefined,
            apiKey: providerApiKey || undefined,
            apiKeyEnv: providerApiKeyEnv || undefined,
          },
        },
        mesh: {
          enabled: meshEnabled,
          mode: meshMode,
          nodeId: meshNodeId || undefined,
          mdns: meshMdns,
          staticPeers: parseMultiline(meshStaticPeers),
          requireMtls: meshRequireMtls,
          tailnetEnabled: meshTailnetEnabled,
        },
        markComplete,
        completedBy: "mission-control",
      });

      setState(bootstrap.state);
      hydrateFromState(bootstrap.state);
      if (bootstrap.state.completed) {
        onCompleted?.();
      }
      if (!markComplete) {
        const completed: OnboardingCompleteResponse = await completeOnboarding("mission-control");
        setState(completed.state);
        if (completed.state.completed) {
          onCompleted?.();
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <p>Loading onboarding wizard...</p>;
  }

  return (
    <section>
      <h2>Launch Wizard</h2>
      <p className="office-subtitle">Guided first-time setup for auth, models, runtime defaults, and optional mesh.</p>
      {error ? <p className="error">{error}</p> : null}

      <article className="card">
        <div className="controls-row">
          <strong>Progress</strong>
          <span>{STEP_TITLES[step]}</span>
          <button onClick={() => void load()}>Refresh</button>
        </div>
        <div className="compact-list">
          {state?.checklist.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong> [{item.status}] {item.detail}
            </li>
          ))}
        </div>
      </article>

      {step === 0 ? (
        <article className="card">
          <h3>Step 1: Gateway Access</h3>
          <div className="controls-row">
            <label htmlFor="wizard-auth-mode">Auth mode</label>
            <select
              id="wizard-auth-mode"
              value={authMode}
              onChange={(event) => setAuthMode(event.target.value as "none" | "token" | "basic")}
            >
              <option value="none">none (local trusted)</option>
              <option value="token">token</option>
              <option value="basic">basic</option>
            </select>
          </div>
          <div className="controls-row">
            <label htmlFor="wizard-loopback">Allow loopback bypass</label>
            <input
              id="wizard-loopback"
              type="checkbox"
              checked={allowLoopbackBypass}
              onChange={(event) => setAllowLoopbackBypass(event.target.checked)}
            />
          </div>
          {authMode === "token" ? (
            <div className="controls-row">
              <label htmlFor="wizard-token">Gateway token</label>
              <input
                id="wizard-token"
                type="password"
                value={authToken}
                onChange={(event) => setAuthToken(event.target.value)}
              />
            </div>
          ) : null}
          {authMode === "basic" ? (
            <>
              <div className="controls-row">
                <label htmlFor="wizard-basic-username">Username</label>
                <input
                  id="wizard-basic-username"
                  value={basicUsername}
                  onChange={(event) => setBasicUsername(event.target.value)}
                />
              </div>
              <div className="controls-row">
                <label htmlFor="wizard-basic-password">Password</label>
                <input
                  id="wizard-basic-password"
                  type="password"
                  value={basicPassword}
                  onChange={(event) => setBasicPassword(event.target.value)}
                />
              </div>
            </>
          ) : null}
        </article>
      ) : null}

      {step === 1 ? (
        <article className="card">
          <h3>Step 2: LLM Provider</h3>
          <div className="controls-row">
            <label htmlFor="wizard-provider-id">Provider</label>
            <SelectOrCustom
              id="wizard-provider-id"
              value={activeProviderId}
              onChange={(nextProviderId) => {
                setActiveProviderId(nextProviderId);
                applyProviderTemplate(nextProviderId);
              }}
              options={providerOptions}
              customPlaceholder="Custom provider id"
              customLabel="Custom provider"
            />
          </div>
          <div className="controls-row">
            <label htmlFor="wizard-provider-label">Label</label>
            <SelectOrCustom
              id="wizard-provider-label"
              value={providerLabel}
              onChange={setProviderLabel}
              options={providerLabelOptions}
              customPlaceholder="Provider label"
              customLabel="Custom label"
            />
          </div>
          <div className="controls-row">
            <label htmlFor="wizard-provider-url">Base URL</label>
            <SelectOrCustom
              id="wizard-provider-url"
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
            <label htmlFor="wizard-model">Active model</label>
            <SelectOrCustom
              id="wizard-model"
              value={activeModel}
              onChange={setActiveModel}
              options={modelOptions}
              customPlaceholder="Model id"
              customLabel="Custom model"
            />
          </div>
          <div className="controls-row">
            <label htmlFor="wizard-provider-default-model">Provider default model</label>
            <SelectOrCustom
              id="wizard-provider-default-model"
              value={providerDefaultModel}
              onChange={setProviderDefaultModel}
              options={modelOptions}
              customPlaceholder="Default model id"
              customLabel="Custom default model"
            />
          </div>
          <details className="advanced-panel">
            <summary>Advanced provider auth</summary>
            <div className="controls-row">
              <label htmlFor="wizard-provider-api-key">API key (optional)</label>
              <input
                id="wizard-provider-api-key"
                type="password"
                value={providerApiKey}
                onChange={(event) => setProviderApiKey(event.target.value)}
              />
            </div>
            <div className="controls-row">
              <label htmlFor="wizard-provider-api-key-env">API key env var (optional)</label>
              <input
                id="wizard-provider-api-key-env"
                value={providerApiKeyEnv}
                onChange={(event) => setProviderApiKeyEnv(event.target.value)}
              />
            </div>
          </details>
        </article>
      ) : null}

      {step === 2 ? (
        <article className="card">
          <h3>Step 3: Runtime Defaults</h3>
          <div className="controls-row">
            <label htmlFor="wizard-tool-profile">Tool profile</label>
            <SelectOrCustom
              id="wizard-tool-profile"
              value={defaultToolProfile}
              onChange={setDefaultToolProfile}
              options={TOOL_PROFILE_OPTIONS}
              customPlaceholder="Custom profile"
              customLabel="Custom profile"
            />
          </div>
          <div className="controls-row">
            <label htmlFor="wizard-budget">Budget mode</label>
            <select
              id="wizard-budget"
              value={budgetMode}
              onChange={(event) => setBudgetMode(event.target.value as RuntimeSettingsResponse["budgetMode"])}
            >
              {BUDGET_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
          <div className="controls-row">
            <label htmlFor="wizard-allowlist-preset">Network allowlist preset</label>
            <select
              id="wizard-allowlist-preset"
              value={allowlistPreset}
              onChange={(event) => applyAllowlistPreset(event.target.value)}
            >
              {ALLOWLIST_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">custom</option>
            </select>
          </div>
          <label htmlFor="wizard-allowlist">Network allowlist (one host per line)</label>
          <textarea
            id="wizard-allowlist"
            rows={6}
            className="full-textarea"
            value={networkAllowlistText}
            onChange={(event) => {
              setAllowlistPreset("custom");
              setNetworkAllowlistText(event.target.value);
            }}
          />
        </article>
      ) : null}

      {step === 3 ? (
        <article className="card">
          <h3>Step 4: Mesh (Optional)</h3>
          <div className="controls-row">
            <label htmlFor="wizard-mesh-enabled">Enable mesh</label>
            <input
              id="wizard-mesh-enabled"
              type="checkbox"
              checked={meshEnabled}
              onChange={(event) => setMeshEnabled(event.target.checked)}
            />
          </div>
          {meshEnabled ? (
            <>
              <div className="controls-row">
                <label htmlFor="wizard-mesh-mode">Mode</label>
                <select
                  id="wizard-mesh-mode"
                  value={meshMode}
                  onChange={(event) => setMeshMode(event.target.value as "lan" | "wan" | "tailnet")}
                >
                  <option value="lan">LAN</option>
                  <option value="wan">WAN</option>
                  <option value="tailnet">Tailnet</option>
                </select>
              </div>
              <div className="controls-row">
                <label htmlFor="wizard-mesh-node-id">Node ID</label>
                <input
                  id="wizard-mesh-node-id"
                  value={meshNodeId}
                  onChange={(event) => setMeshNodeId(event.target.value)}
                />
              </div>
              <div className="controls-row">
                <label htmlFor="wizard-mesh-mdns">mDNS discovery</label>
                <input
                  id="wizard-mesh-mdns"
                  type="checkbox"
                  checked={meshMdns}
                  onChange={(event) => setMeshMdns(event.target.checked)}
                />
              </div>
              <div className="controls-row">
                <label htmlFor="wizard-mesh-mtls">Require mTLS</label>
                <input
                  id="wizard-mesh-mtls"
                  type="checkbox"
                  checked={meshRequireMtls}
                  onChange={(event) => setMeshRequireMtls(event.target.checked)}
                />
              </div>
              <div className="controls-row">
                <label htmlFor="wizard-mesh-tailnet">Tailnet mode enabled</label>
                <input
                  id="wizard-mesh-tailnet"
                  type="checkbox"
                  checked={meshTailnetEnabled}
                  onChange={(event) => setMeshTailnetEnabled(event.target.checked)}
                />
              </div>
              <label htmlFor="wizard-mesh-peers">Static peers (one per line)</label>
              <textarea
                id="wizard-mesh-peers"
                rows={4}
                className="full-textarea"
                value={meshStaticPeers}
                onChange={(event) => setMeshStaticPeers(event.target.value)}
              />
            </>
          ) : (
            <p className="office-subtitle">Mesh stays disabled for single-machine mode. You can enable it later.</p>
          )}
        </article>
      ) : null}

      {step === 4 ? (
        <article className="card">
          <h3>Step 5: Review & Apply</h3>
          <p>Ready to apply this onboarding configuration through the gateway API.</p>
          <div className="controls-row">
            <label htmlFor="wizard-mark-complete">Mark onboarding complete</label>
            <input
              id="wizard-mark-complete"
              type="checkbox"
              checked={markComplete}
              onChange={(event) => setMarkComplete(event.target.checked)}
            />
          </div>
          <pre>{JSON.stringify({
            authMode,
            activeProviderId,
            activeModel,
            defaultToolProfile,
            budgetMode,
            networkAllowlist: parseMultiline(networkAllowlistText),
            mesh: {
              enabled: meshEnabled,
              mode: meshMode,
              nodeId: meshNodeId,
              mdns: meshMdns,
              staticPeers: parseMultiline(meshStaticPeers),
              requireMtls: meshRequireMtls,
              tailnetEnabled: meshTailnetEnabled,
            },
          }, null, 2)}</pre>
          <button onClick={() => void submit()} disabled={applying}>
            {applying ? "Applying..." : "Apply onboarding"}
          </button>
        </article>
      ) : null}

      <article className="card">
        <div className="actions">
          <button onClick={() => setStep((current) => Math.max(0, current - 1) as StepId)} disabled={step === 0 || applying}>
            Back
          </button>
          <button onClick={() => setStep((current) => Math.min(4, current + 1) as StepId)} disabled={step === 4 || applying}>
            Next
          </button>
        </div>
      </article>
    </section>
  );
}

function parseMultiline(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
