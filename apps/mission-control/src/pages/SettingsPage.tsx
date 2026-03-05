import { useEffect, useMemo, useState } from "react";
import {
  clearGatewayAuthState,
  createLlmChatCompletion,
  deleteProviderSecret,
  evaluateUiChangeRisk,
  fetchLlmModels,
  getGatewayAuthStorageMode,
  persistGatewayAuthState,
  readStoredGatewayAuthState,
  fetchVoiceStatus,
  fetchProviderSecretStatus,
  fetchSettings,
  patchSettings,
  saveProviderSecret,
  setGatewayAuthStorageMode,
  startVoiceTalkSession,
  startVoiceWake,
  stopVoiceTalkSession,
  stopVoiceWake,
  transcribeVoice,
  type GatewayAuthStorageMode,
  type ProviderSecretStatus,
  type RuntimeSettingsResponse,
} from "../api/client";
import type { VoiceStatus } from "@goatcitadel/contracts";
import { ChangeReviewPanel } from "../components/ChangeReviewPanel";
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { SelectOrCustom, type SelectOption } from "../components/SelectOrCustom";
import { GCSelect, GCSwitch } from "../components/ui";
import { pageCopy } from "../content/copy";

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
    providerId: "genie-ir20",
    label: "Genie IR20 (Tailnet)",
    baseUrl: "http://100.64.0.4:8910/v1",
    defaultModel: "IBM-Granite",
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
    id: "web-research",
    label: "Web research (browser tools + local)",
    hosts: [
      "127.0.0.1",
      "localhost",
      "*.duckduckgo.com",
      "*.google.com",
      "*.bing.com",
      "*.wikipedia.org",
      "*.github.com",
      "*.developer.mozilla.org",
    ],
  },
  {
    id: "common-llm",
    label: "Common providers + local",
    hosts: ["127.0.0.1", "localhost", "api.openai.com", "openrouter.ai"],
  },
  {
    id: "tailnet-genie",
    label: "Tailnet + Genie IR20",
    hosts: ["127.0.0.1", "localhost", "100.64.0.4", "ir20"],
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

export function SettingsPage(_props: { refreshKey?: number }) {
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
  const [providerSecretStatus, setProviderSecretStatus] = useState<ProviderSecretStatus | null>(null);
  const [authMode, setAuthMode] = useState<"none" | "token" | "basic">("none");
  const [allowLoopbackBypass, setAllowLoopbackBypass] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [authStorageMode, setAuthStorageMode] = useState<GatewayAuthStorageMode>("session");
  const [models, setModels] = useState<Array<{ id: string; ownedBy?: string; created?: number }>>([]);
  const [chatPrompt, setChatPrompt] = useState("Say hello from OpenAI-compatible chat completions.");
  const [chatPromptPresetId, setChatPromptPresetId] = useState("hello");
  const [chatUseMemory, setChatUseMemory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allowlistPreset, setAllowlistPreset] = useState("strict");
  const [chatResponse, setChatResponse] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceTalkMode, setVoiceTalkMode] = useState<"push_to_talk" | "wake">("push_to_talk");
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceTranscriptResult, setVoiceTranscriptResult] = useState("");
  const [voiceActionInfo, setVoiceActionInfo] = useState("");
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
  const knownProviderIds = useMemo(() => {
    return new Set(providerOptions.map((provider) => provider.providerId.toLowerCase()));
  }, [providerOptions]);
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
          if (activeProvider.apiKeySource === "env" && activeProvider.apiKeyRef) {
            setProviderApiKeyEnv(activeProvider.apiKeyRef);
          }
        }

        setChatPromptPresetId("hello");
        hydrateStoredAuthCredentials();
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    void fetchVoiceStatus()
      .then((status) => {
        setVoiceStatus(status);
        if (status.talk.mode) {
          setVoiceTalkMode(status.talk.mode);
        }
      })
      .catch(() => {
        setVoiceStatus(null);
      });
  }, []);

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

  useEffect(() => {
    const normalized = providerId.trim();
    const key = normalized.toLowerCase();
    if (!normalized || key === "custom" || !knownProviderIds.has(key)) {
      setProviderSecretStatus(null);
      return;
    }
    void fetchProviderSecretStatus(normalized)
      .then((status) => setProviderSecretStatus(status))
      .catch(() => setProviderSecretStatus(null));
  }, [providerId, knownProviderIds]);

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
            apiKeyEnv: providerApiKeyEnv || undefined,
          },
        },
      });
      setSettings(next);
      if (providerApiKey.trim()) {
        const status = await saveProviderSecret(providerId, providerApiKey.trim());
        setProviderSecretStatus(status);
        setProviderApiKey("");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onSaveProviderKeyToSecureStore = async () => {
    const trimmed = providerApiKey.trim();
    if (!trimmed) {
      setError("Enter a provider API key first.");
      return;
    }
    try {
      const status = await saveProviderSecret(providerId, trimmed);
      setProviderSecretStatus(status);
      setProviderApiKey("");
      const next = await fetchSettings();
      setSettings(next);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDeleteProviderKeyFromSecureStore = async () => {
    try {
      const status = await deleteProviderSecret(providerId);
      setProviderSecretStatus(status);
      const next = await fetchSettings();
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

  const refreshVoiceRuntime = async () => {
    const status = await fetchVoiceStatus();
    setVoiceStatus(status);
    if (status.talk.mode) {
      setVoiceTalkMode(status.talk.mode);
    }
  };

  const onStartVoiceTalk = async () => {
    setVoiceBusy(true);
    try {
      await startVoiceTalkSession({ mode: voiceTalkMode });
      await refreshVoiceRuntime();
      setVoiceActionInfo(`Talk Mode started (${formatTalkModeLabel(voiceTalkMode)}).`);
      setError(null);
    } catch (err) {
      setVoiceActionInfo("");
      setError((err as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  };

  const onStopVoiceTalk = async () => {
    if (!voiceStatus?.talk.activeSessionId) {
      return;
    }
    setVoiceBusy(true);
    try {
      await stopVoiceTalkSession(voiceStatus.talk.activeSessionId);
      await refreshVoiceRuntime();
      setVoiceActionInfo("Talk Mode stopped.");
      setError(null);
    } catch (err) {
      setVoiceActionInfo("");
      setError((err as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  };

  const onStartWake = async () => {
    setVoiceBusy(true);
    try {
      await startVoiceWake();
      await refreshVoiceRuntime();
      setVoiceActionInfo("Wake listener enabled.");
      setError(null);
    } catch (err) {
      setVoiceActionInfo("");
      setError((err as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  };

  const onStopWake = async () => {
    setVoiceBusy(true);
    try {
      await stopVoiceWake();
      await refreshVoiceRuntime();
      setVoiceActionInfo("Wake listener disabled.");
      setError(null);
    } catch (err) {
      setVoiceActionInfo("");
      setError((err as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  };

  const onRunVoiceTranscribeTest = async () => {
    if (!voiceFile) {
      setError("Choose an audio file first.");
      return;
    }
    setVoiceBusy(true);
    try {
      const bytesBase64 = await fileToBase64(voiceFile);
      const result = await transcribeVoice({
        bytesBase64,
        mimeType: voiceFile.type || "audio/wav",
      });
      setVoiceTranscriptResult(result.text);
      await refreshVoiceRuntime();
      setVoiceActionInfo(
        `Transcription completed with ${result.provider}${typeof result.durationMs === "number" ? ` in ${result.durationMs}ms` : ""}.`,
      );
      setError(null);
    } catch (err) {
      setVoiceActionInfo("");
      setError((err as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  };

  const hydrateStoredAuthCredentials = () => {
    const stored = readStoredGatewayAuthState();
    if (!stored) {
      setAuthStorageMode(getGatewayAuthStorageMode());
      return;
    }
    setAuthToken(stored.token ?? "");
    setBasicUsername(stored.username ?? "");
    setBasicPassword(stored.password ?? "");
    setAuthStorageMode(getGatewayAuthStorageMode());
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
      const nextStorageMode = resolveAuthStorageMode(authMode, authStorageMode === "persistent");
      if (authMode === "none") {
        clearGatewayAuthState();
        setGatewayAuthStorageMode(nextStorageMode);
        setAuthStorageMode(nextStorageMode);
        return;
      }
      setGatewayAuthStorageMode(nextStorageMode);
      setAuthStorageMode(nextStorageMode);
      persistGatewayAuthState({
        mode: authMode,
        token: authToken,
        username: basicUsername,
        password: basicPassword,
      }, nextStorageMode);
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

  const applyLocalProviderPreset = (nextProviderId: "lmstudio" | "ollama") => {
    const template = PROVIDER_TEMPLATES.find((item) => item.providerId === nextProviderId);
    if (!template) {
      return;
    }
    setActiveProviderId(nextProviderId);
    setActiveModel(template.defaultModel);
    setProviderId(nextProviderId);
    setProviderLabel(template.label);
    setProviderBaseUrl(template.baseUrl);
    setProviderDefaultModel(template.defaultModel);
    setProviderApiKey("");
    setProviderApiKeyEnv("");
    setShowAdvanced(true);
  };

  if (!settings) {
    return <p>Loading Forge settings...</p>;
  }

  const blockSaves = changeReview.overall === "critical" && !criticalConfirmed;

  return (
    <section>
      <h2>{pageCopy.settings.title}</h2>
      <p className="office-subtitle">{pageCopy.settings.subtitle}</p>
      <PageGuideCard
        what={pageCopy.settings.guide?.what ?? ""}
        when={pageCopy.settings.guide?.when ?? ""}
        actions={pageCopy.settings.guide?.actions ?? []}
        terms={pageCopy.settings.guide?.terms}
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
        <p>Use auth modes for local/online hosting. By default, credentials are session-only and clear when you close the browser.</p>
        <div className="controls-row">
          <label htmlFor="authMode">Auth Mode</label>
          <GCSelect
            id="authMode"
            value={authMode}
            onChange={(value) => setAuthMode(value as "none" | "token" | "basic")}
            options={[
              { value: "none", label: "none (local trusted)" },
              { value: "token", label: "token" },
              { value: "basic", label: "basic" },
            ]}
          />
        </div>
        <div className="controls-row">
          <GCSwitch
            id="allowLoopbackBypass"
            checked={allowLoopbackBypass}
            onCheckedChange={setAllowLoopbackBypass}
            label="Allow loopback bypass"
          />
        </div>
        {authMode !== "none" ? (
          <div className="controls-row">
            <GCSwitch
              id="authRememberMe"
              checked={authStorageMode === "persistent"}
              onCheckedChange={(checked) => setAuthStorageMode(checked ? "persistent" : "session")}
              label="Remember credentials on this browser (less secure)"
            />
          </div>
        ) : null}
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
        <button type="button" onClick={onSaveAuth} disabled={blockSaves}>Save Access Control</button>
      </article>

      <article className="card">
        <h3>
          Voice Runtime
          <HelpHint label="Voice runtime help" text="Talk Mode and Wake use your local voice runtime. Whisper.cpp is the default offline transcription provider." />
        </h3>
        <p className="office-subtitle">Local-first voice controls with no required cloud API key.</p>
        <div className="voice-status-grid">
          <article className="voice-status-card">
            <h4>Speech To Text</h4>
            <p><strong>Provider:</strong> {voiceStatus?.stt.provider ?? "unknown"}</p>
            <p><strong>State:</strong> {voiceStatus?.stt.state ?? "unknown"}</p>
            <p className="table-subtext">{describeVoiceState(voiceStatus?.stt.state)}</p>
            <p className="table-subtext">Updated: {formatVoiceDate(voiceStatus?.stt.updatedAt)}</p>
          </article>
          <article className="voice-status-card">
            <h4>Talk Mode</h4>
            <p><strong>State:</strong> {voiceStatus?.talk.state ?? "unknown"}</p>
            <p><strong>Mode:</strong> {formatTalkModeLabel(voiceStatus?.talk.mode)}</p>
            <p><strong>Active session:</strong> {voiceStatus?.talk.activeSessionId ?? "none"}</p>
            <p className="table-subtext">{describeVoiceState(voiceStatus?.talk.state)}</p>
            <p className="table-subtext">Updated: {formatVoiceDate(voiceStatus?.talk.updatedAt)}</p>
          </article>
          <article className="voice-status-card">
            <h4>Wake Listener</h4>
            <p><strong>Enabled:</strong> {voiceStatus?.wake.enabled ? "yes" : "no"}</p>
            <p><strong>State:</strong> {voiceStatus?.wake.state ?? "unknown"}</p>
            <p><strong>Model:</strong> {voiceStatus?.wake.model ?? "unknown"}</p>
            <p className="table-subtext">{describeVoiceState(voiceStatus?.wake.state)}</p>
            <p className="table-subtext">Updated: {formatVoiceDate(voiceStatus?.wake.updatedAt)}</p>
          </article>
        </div>
        {voiceStatus?.stt.lastError ? (
          <p className="error">Last STT error: {voiceStatus.stt.lastError}</p>
        ) : null}
        {voiceActionInfo ? <p className="status-banner">{voiceActionInfo}</p> : null}
        <article className="voice-help-card">
          <h4>What Each Button Does</h4>
          <ul className="voice-help-list">
            <li><strong>Start Talk Mode:</strong> Creates a talk session and begins live listening flow using the selected mode.</li>
            <li><strong>Stop Talk Mode:</strong> Stops the current talk session and clears active session state.</li>
            <li><strong>Enable Wake:</strong> Turns on wake-word listener mode (for hands-free trigger workflows).</li>
            <li><strong>Disable Wake:</strong> Turns wake-word listener off immediately.</li>
            <li><strong>Refresh Voice Status:</strong> Re-reads current runtime status from gateway without changing state.</li>
            <li><strong>Run Local Transcription:</strong> Uploads your selected audio file for one-shot local STT test.</li>
          </ul>
          <p className="office-subtitle">
            Setup note: local transcription requires <code>GOATCITADEL_WHISPER_CPP_BIN</code> set to your whisper.cpp CLI binary path.
          </p>
        </article>
        <div className="controls-row">
          <label htmlFor="voiceTalkMode">Talk mode</label>
          <GCSelect
            id="voiceTalkMode"
            value={voiceTalkMode}
            onChange={(value) => setVoiceTalkMode(value as "push_to_talk" | "wake")}
            options={[
              { value: "push_to_talk", label: "Push to talk" },
              { value: "wake", label: "Wake triggered" },
            ]}
          />
          <button type="button" onClick={onStartVoiceTalk} disabled={voiceBusy || voiceStatus?.talk.state === "running"}>
            Start Talk Mode
          </button>
          <button type="button" onClick={onStopVoiceTalk} disabled={voiceBusy || voiceStatus?.talk.state !== "running"}>
            Stop Talk Mode
          </button>
        </div>
        <div className="controls-row">
          <button type="button" onClick={onStartWake} disabled={voiceBusy || voiceStatus?.wake.enabled}>
            Enable Wake
          </button>
          <button type="button" onClick={onStopWake} disabled={voiceBusy || !voiceStatus?.wake.enabled}>
            Disable Wake
          </button>
          <button type="button" onClick={() => void refreshVoiceRuntime()} disabled={voiceBusy}>
            Refresh Voice Status
          </button>
        </div>
        <div className="controls-row">
          <label htmlFor="voiceTestFile">Transcription test file</label>
          <input
            id="voiceTestFile"
            type="file"
            accept="audio/*"
            onChange={(event) => setVoiceFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" onClick={onRunVoiceTranscribeTest} disabled={voiceBusy || !voiceFile}>
            Run Local Transcription
          </button>
        </div>
        {voiceTranscriptResult ? (
          <pre>{voiceTranscriptResult}</pre>
        ) : null}
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
          <GCSelect
            id="budgetMode"
            value={budgetMode}
            onChange={(value) => setBudgetMode(value as "saver" | "balanced" | "power")}
            options={[
              { value: "saver", label: "saver" },
              { value: "balanced", label: "balanced" },
              { value: "power", label: "power" },
            ]}
          />
        </div>
        <details className="advanced-panel">
          <summary>Advanced runtime options</summary>
          <div className="controls-row">
            <label htmlFor="allowlistPreset">Allowlist Preset</label>
            <GCSelect
              id="allowlistPreset"
              value={allowlistPreset}
              onChange={(nextPreset) => {
                setAllowlistPreset(nextPreset);
                const preset = ALLOWLIST_PRESETS.find((item) => item.id === nextPreset);
                if (preset) {
                  setNetworkAllowlistText(preset.hosts.join("\n"));
                }
              }}
              options={[
                ...ALLOWLIST_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: preset.label,
                })),
                { value: "custom", label: "custom" },
              ]}
            />
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
        <button type="button" onClick={onSaveRuntime} disabled={blockSaves}>Save Runtime Controls</button>
      </article>

      <article className="card">
        <h3>LLM Providers & Models (OpenAI-Compatible)</h3>
        <p>This uses `/v1/chat/completions` only. Legacy `/v1/completions` is intentionally not used.</p>
        <details className="advanced-panel">
          <summary>Local runtime quick setup: LM Studio + Ollama</summary>
          <p className="office-subtitle"><strong>LM Studio:</strong> load at least one model, then start its local server.</p>
          <p className="office-subtitle">Base URL: <code>http://127.0.0.1:1234/v1</code> | model id: the loaded model name in LM Studio.</p>
          <p className="office-subtitle"><strong>Ollama:</strong> run <code>ollama pull llama3.2</code> and keep Ollama running.</p>
          <p className="office-subtitle">Base URL: <code>http://127.0.0.1:11434/v1</code> | model id: installed tag, for example <code>llama3.2</code>.</p>
          <p className="office-subtitle">If GoatCitadel is remote, replace <code>127.0.0.1</code> with the host IP/tailnet name and include that host in your outbound allowlist.</p>
          <div className="controls-row">
            <button type="button" onClick={() => applyLocalProviderPreset("lmstudio")}>Use LM Studio Preset</button>
            <button type="button" onClick={() => applyLocalProviderPreset("ollama")}>Use Ollama Preset</button>
          </div>
        </details>

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
          <button type="button" onClick={onLoadModels}>Load Models</button>
        </div>
        {models.length > 0 ? (
          <ul className="compact-list">
            {models.map((model) => (
              <li key={model.id}>{model.id}</li>
            ))}
          </ul>
        ) : null}
        <button type="button" onClick={onSaveActiveLlm} disabled={blockSaves}>Save Active Provider/Model</button>

        <button type="button" onClick={() => setShowAdvanced((current) => !current)}>
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
            <p className="office-subtitle">
              Key source: {providerSecretStatus?.source ?? providerOptions.find((provider) => provider.providerId === providerId)?.apiKeySource ?? "none"}
            </p>
            <div className="controls-row">
              <button type="button" onClick={onSaveProviderKeyToSecureStore} disabled={!providerApiKey.trim()}>
                Save Key to Secure Store
              </button>
              <button type="button" onClick={onDeleteProviderKeyFromSecureStore}>
                Remove Secure Key
              </button>
            </div>
            <div className="controls-row">
              <label htmlFor="providerApiKeyEnv">API Key Env (optional)</label>
              <SelectOrCustom
                id="providerApiKeyEnv"
                value={providerApiKeyEnv}
                onChange={setProviderApiKeyEnv}
                options={[
                  { value: "OPENAI_API_KEY", label: "OPENAI_API_KEY" },
                  { value: "ANTHROPIC_API_KEY", label: "ANTHROPIC_API_KEY" },
                  { value: "GOOGLE_API_KEY", label: "GOOGLE_API_KEY" },
                  { value: "GLM_API_KEY", label: "GLM_API_KEY" },
                  { value: "MOONSHOT_API_KEY", label: "MOONSHOT_API_KEY" },
                  { value: "OPENROUTER_API_KEY", label: "OPENROUTER_API_KEY" },
                  { value: "OLLAMA_API_KEY", label: "OLLAMA_API_KEY (optional/proxy only)" },
                  { value: "LMSTUDIO_API_KEY", label: "LMSTUDIO_API_KEY (optional/proxy only)" },
                ]}
                customPlaceholder="Custom env var name"
                customLabel="Custom env var"
              />
            </div>
            <button type="button" onClick={onSaveProvider} disabled={blockSaves}>Save Provider Settings</button>
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
          <GCSelect
            id="chatPromptPreset"
            value={chatPromptPresetId}
            onChange={(nextPreset) => {
              setChatPromptPresetId(nextPreset);
              const preset = CHAT_PROMPT_PRESETS.find((item) => item.id === nextPreset);
              if (preset) {
                setChatPrompt(preset.prompt);
              }
            }}
            options={[
              ...CHAT_PROMPT_PRESETS.map((preset) => ({
                value: preset.id,
                label: preset.label,
              })),
              { value: "custom", label: "custom" },
            ]}
          />
        </div>
        <textarea
          rows={4}
          className="full-textarea"
          value={chatPrompt}
          onChange={(event) => setChatPrompt(event.target.value)}
        />
        <div className="controls-row">
          <GCSwitch
            id="chatUseMemory"
            checked={chatUseMemory}
            onCheckedChange={setChatUseMemory}
            label="Include memory context (QMD)"
          />
        </div>
        <div className="controls-row">
          <button type="button" onClick={onTestChat}>Run Test Prompt</button>
        </div>
        {chatResponse ? <pre>{chatResponse}</pre> : null}
      </article>
    </section>
  );
}

function describeVoiceState(state?: VoiceStatus["stt"]["state"]): string {
  if (state === "running") {
    return "Runtime is currently active.";
  }
  if (state === "error") {
    return "Runtime hit an error and needs attention.";
  }
  if (state === "stopped") {
    return "Runtime is idle.";
  }
  return "State unknown.";
}

function formatTalkModeLabel(mode?: VoiceStatus["talk"]["mode"]): string {
  if (mode === "push_to_talk") {
    return "Push to talk";
  }
  if (mode === "wake") {
    return "Wake triggered";
  }
  return "Not set";
}

function formatVoiceDate(value?: string): string {
  if (!value) {
    return "-";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
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

export function resolveAuthStorageMode(
  authMode: "none" | "token" | "basic",
  rememberCredentials: boolean,
): GatewayAuthStorageMode {
  if (authMode === "none") {
    return "session";
  }
  return rememberCredentials ? "persistent" : "session";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read audio file."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Unable to read audio file."));
    reader.readAsDataURL(file);
  });
}

