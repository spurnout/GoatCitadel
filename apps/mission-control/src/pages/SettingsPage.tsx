import { useEffect, useMemo, useState } from "react";
import {
  createLlmChatCompletion,
  fetchLlmModels,
  fetchSettings,
  patchSettings,
  type RuntimeSettingsResponse,
} from "../api/client";

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
  const [models, setModels] = useState<Array<{ id: string; ownedBy?: string; created?: number }>>([]);
  const [chatPrompt, setChatPrompt] = useState("Say hello from OpenAI-compatible chat completions.");
  const [chatResponse, setChatResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const providerOptions = useMemo(() => settings?.llm.providers ?? [], [settings]);

  const load = () => {
    void fetchSettings()
      .then((res) => {
        setSettings(res);
        setProfile(res.defaultToolProfile);
        setBudgetMode((res.budgetMode as "saver" | "balanced" | "power") || "balanced");
        setNetworkAllowlistText(res.networkAllowlist.join("\n"));

        setActiveProviderId(res.llm.activeProviderId);
        setActiveModel(res.llm.activeModel);
        setProviderId(res.llm.activeProviderId);

        const activeProvider = res.llm.providers.find((provider) => provider.providerId === res.llm.activeProviderId);
        if (activeProvider) {
          setProviderLabel(activeProvider.label);
          setProviderBaseUrl(activeProvider.baseUrl);
          setProviderDefaultModel(activeProvider.defaultModel);
        }
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const onSaveRuntime = async () => {
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

  const onSaveLlm = async () => {
    try {
      const next = await patchSettings({
        llm: {
          activeProviderId,
          activeModel,
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

  if (!settings) {
    return <p>Loading settings...</p>;
  }

  return (
    <section>
      <h2>Settings</h2>
      {error ? <p className="error">{error}</p> : null}

      <article className="card">
        <p>Environment: {settings.environment}</p>
        <p>Workspace: {settings.workspaceDir}</p>
      </article>

      <article className="card">
        <h3>Runtime Controls</h3>
        <div className="controls-row">
          <label htmlFor="profile">Tool Profile</label>
          <input id="profile" value={profile} onChange={(event) => setProfile(event.target.value)} />
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
        <label htmlFor="allowlist">Network Allowlist (one host/pattern per line)</label>
        <textarea
          id="allowlist"
          rows={6}
          className="full-textarea"
          value={networkAllowlistText}
          onChange={(event) => setNetworkAllowlistText(event.target.value)}
        />
        <button onClick={onSaveRuntime}>Save Runtime Settings</button>
      </article>

      <article className="card">
        <h3>LLM (OpenAI-Compatible, Chat Completions)</h3>
        <p>This uses `/v1/chat/completions` only. Legacy `/v1/completions` is intentionally not used.</p>

        <div className="controls-row">
          <label htmlFor="activeProvider">Active Provider</label>
          <select
            id="activeProvider"
            value={activeProviderId}
            onChange={(event) => setActiveProviderId(event.target.value)}
          >
            {providerOptions.map((provider) => (
              <option key={provider.providerId} value={provider.providerId}>
                {provider.providerId} ({provider.baseUrl})
              </option>
            ))}
          </select>
        </div>

        <div className="controls-row">
          <label htmlFor="activeModel">Active Model</label>
          <input id="activeModel" value={activeModel} onChange={(event) => setActiveModel(event.target.value)} />
          <button onClick={onLoadModels}>Load Models</button>
        </div>
        {models.length > 0 ? (
          <ul className="compact-list">
            {models.map((model) => (
              <li key={model.id}>{model.id}</li>
            ))}
          </ul>
        ) : null}

        <h4>Add / Update Provider</h4>
        <div className="controls-row">
          <label htmlFor="providerId">Provider ID</label>
          <input id="providerId" value={providerId} onChange={(event) => setProviderId(event.target.value)} />
        </div>
        <div className="controls-row">
          <label htmlFor="providerLabel">Label</label>
          <input id="providerLabel" value={providerLabel} onChange={(event) => setProviderLabel(event.target.value)} />
        </div>
        <div className="controls-row">
          <label htmlFor="providerBaseUrl">Base URL</label>
          <input id="providerBaseUrl" value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} />
        </div>
        <div className="controls-row">
          <label htmlFor="providerDefaultModel">Default Model</label>
          <input
            id="providerDefaultModel"
            value={providerDefaultModel}
            onChange={(event) => setProviderDefaultModel(event.target.value)}
          />
        </div>
        <div className="controls-row">
          <label htmlFor="providerApiKey">API Key (optional)</label>
          <input id="providerApiKey" value={providerApiKey} onChange={(event) => setProviderApiKey(event.target.value)} />
        </div>
        <div className="controls-row">
          <label htmlFor="providerApiKeyEnv">API Key Env (optional)</label>
          <input
            id="providerApiKeyEnv"
            value={providerApiKeyEnv}
            onChange={(event) => setProviderApiKeyEnv(event.target.value)}
          />
        </div>
        <button onClick={onSaveLlm}>Save LLM Provider Settings</button>
      </article>

      <article className="card">
        <h3>LLM Test (chat/completions)</h3>
        <textarea
          rows={4}
          className="full-textarea"
          value={chatPrompt}
          onChange={(event) => setChatPrompt(event.target.value)}
        />
        <div className="controls-row">
          <button onClick={onTestChat}>Run Test Prompt</button>
        </div>
        {chatResponse ? <pre>{chatResponse}</pre> : null}
      </article>
    </section>
  );
}
