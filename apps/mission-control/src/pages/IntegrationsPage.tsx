import { useEffect, useMemo, useRef, useState } from "react";
import {
  createIntegrationConnection,
  disableIntegrationPlugin,
  deleteIntegrationConnection,
  enableIntegrationPlugin,
  evaluateUiChangeRisk,
  fetchIntegrationCatalog,
  fetchIntegrationConnections,
  fetchIntegrationFormSchema,
  fetchIntegrationPlugins,
  fetchObsidianIntegrationStatus,
  installIntegrationPlugin,
  patchObsidianIntegrationConfig,
  searchObsidianNotes,
  testObsidianIntegration,
  captureObsidianInboxEntry,
  updateIntegrationConnection,
  type IntegrationCatalogEntry,
  type IntegrationConnection,
  type ObsidianIntegrationStatus,
} from "../api/client";
import { ChangeReviewPanel } from "../components/ChangeReviewPanel";
import { PageGuideCard } from "../components/PageGuideCard";
import { SelectOrCustom } from "../components/SelectOrCustom";
import { ConfigFormBuilder } from "../components/ConfigFormBuilder";
import { ConfirmModal } from "../components/ConfirmModal";
import { CardSkeleton } from "../components/CardSkeleton";
import { HelpHint } from "../components/HelpHint";
import { GCSelect, GCSwitch } from "../components/ui";
import { useAction } from "../hooks/useAction";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";
import { pageCopy } from "../content/copy";

type IntegrationKind = IntegrationCatalogEntry["kind"] | "all";
type UiRiskLevel = "safe" | "warning" | "critical";
type UiRiskItem = { field: string; level: UiRiskLevel; hint?: string };

const KIND_OPTIONS: Array<{ value: IntegrationKind; label: string }> = [
  { value: "all", label: "All scopes" },
  { value: "channel", label: "Channels" },
  { value: "model_provider", label: "Model providers" },
  { value: "productivity", label: "Productivity apps" },
  { value: "automation", label: "Automation" },
  { value: "platform", label: "Platform integrations" },
];

const STATUS_OPTIONS: Array<{
  value: IntegrationConnection["status"];
  label: string;
  description: string;
}> = [
  { value: "connected", label: "Connected (ready)", description: "Live and expected to work." },
  { value: "paused", label: "Paused", description: "Kept for later, not used right now." },
  { value: "disconnected", label: "Disconnected", description: "Configured but intentionally offline." },
  { value: "error", label: "Error", description: "Needs fix before use." },
];

const KIND_DESCRIPTIONS: Record<Exclude<IntegrationKind, "all">, string> = {
  channel: "Routes messages to and from chat channels.",
  model_provider: "Adds an LLM provider endpoint and credentials.",
  productivity: "Connects docs, files, or office workflows.",
  automation: "Connects external automation systems.",
  platform: "Connects platform-level services and APIs.",
};

export function IntegrationsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [catalog, setCatalog] = useState<IntegrationCatalogEntry[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [plugins, setPlugins] = useState<Awaited<ReturnType<typeof fetchIntegrationPlugins>>["items"]>([]);
  const [pluginSource, setPluginSource] = useState("");
  const [pluginBusyId, setPluginBusyId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<IntegrationKind>("all");
  const [connectionSearch, setConnectionSearch] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<IntegrationConnection["status"]>("connected");
  const [showAdvancedJson, setShowAdvancedJson] = useState(false);
  const [configJson, setConfigJson] = useState("{}");
  const [guidedConfig, setGuidedConfig] = useState<Record<string, unknown>>({});
  const [formSchema, setFormSchema] = useState<IntegrationCatalogEntry["formSchema"]>();
  const [obsidianStatus, setObsidianStatus] = useState<ObsidianIntegrationStatus | null>(null);
  const [obsidianEnabled, setObsidianEnabled] = useState(false);
  const [obsidianVaultPath, setObsidianVaultPath] = useState("");
  const [obsidianMode, setObsidianMode] = useState<"read_append" | "read_only">("read_append");
  const [obsidianAllowedSubpaths, setObsidianAllowedSubpaths] = useState("");
  const [obsidianQuery, setObsidianQuery] = useState("");
  const [obsidianSearchResults, setObsidianSearchResults] = useState<Array<{
    relativePath: string;
    title: string;
    snippet: string;
    score: number;
  }>>([]);
  const [obsidianInboxRequest, setObsidianInboxRequest] = useState("");
  const [obsidianBusy, setObsidianBusy] = useState<null | "save" | "test" | "search" | "capture">(null);
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [changeReview, setChangeReview] = useState<{ overall: UiRiskLevel; items: UiRiskItem[] }>({
    overall: "safe",
    items: [],
  });
  const [deleteTarget, setDeleteTarget] = useState<IntegrationConnection | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const createAction = useAction();
  const deleteAction = useAction();

  const load = (options?: { background?: boolean }): Promise<void> => {
    const background = options?.background ?? false;
    const kind = kindFilter === "all" ? undefined : kindFilter;
    const requestId = ++requestSeq.current;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    return Promise.all([
      fetchIntegrationCatalog(kind),
      fetchIntegrationConnections(kind),
      fetchIntegrationPlugins(),
      fetchObsidianIntegrationStatus(),
    ])
      .then(([catalogRes, connectionRes, pluginRes, obsidianRes]) => {
        if (requestId !== requestSeq.current) {
          return;
        }
        const nextCatalog = catalogRes.items;
        setCatalog(nextCatalog);
        setConnections(connectionRes.items);
        setPlugins(pluginRes.items);
        setObsidianStatus(obsidianRes);
        setObsidianEnabled(obsidianRes.enabled);
        setObsidianVaultPath(obsidianRes.vaultPath);
        setObsidianMode(obsidianRes.mode);
        setObsidianAllowedSubpaths(obsidianRes.allowedSubpaths.join(", "));

        const hasCurrentSelection = selectedCatalogId
          ? nextCatalog.some((entry) => entry.catalogId === selectedCatalogId)
          : false;
        const nextSelection = hasCurrentSelection
          ? selectedCatalogId
          : (nextCatalog[0]?.catalogId ?? "");

        setSelectedCatalogId(nextSelection);
        setError(null);
      })
      .catch((err: Error) => {
        if (requestId === requestSeq.current) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (requestId === requestSeq.current) {
          if (background) {
            setIsRefreshing(false);
          } else {
            setIsInitialLoading(false);
          }
        }
      });
  };

  useEffect(() => {
    load({ background: false });
  }, [kindFilter, refreshKey]);

  useRefreshSubscription(
    "integrations",
    async () => {
      await load({ background: true });
    },
    {
      enabled: !isInitialLoading,
      coalesceMs: 1100,
      staleMs: 20000,
      pollIntervalMs: 15000,
    },
  );

  useEffect(() => {
    if (!selectedCatalogId) {
      setFormSchema(undefined);
      setGuidedConfig({});
      return;
    }
    let cancelled = false;
    void fetchIntegrationFormSchema(selectedCatalogId)
      .then((schema) => {
        if (cancelled) {
          return;
        }
        setFormSchema(schema);
        const defaults = Object.fromEntries(
          schema.fields
            .filter((field) => field.defaultValue !== undefined)
            .map((field) => [field.key, field.defaultValue]),
        );
        setGuidedConfig(defaults);
      })
      .catch(() => {
        if (!cancelled) {
          setFormSchema(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCatalogId]);

  const selectedCatalog = useMemo(
    () => catalog.find((entry) => entry.catalogId === selectedCatalogId),
    [catalog, selectedCatalogId],
  );

  const catalogOptions = useMemo(
    () => catalog.map((entry) => ({
      value: entry.catalogId,
      label: `${entry.label} (${entry.kind})`,
    })),
    [catalog],
  );

  const catalogLabelById = useMemo(
    () => new Map(catalog.map((entry) => [entry.catalogId, entry.label])),
    [catalog],
  );

  const connectionSummary = useMemo(() => {
    const total = connections.length;
    const connected = connections.filter((item) => item.enabled && item.status === "connected").length;
    const paused = connections.filter((item) => item.status === "paused").length;
    const error = connections.filter((item) => item.status === "error").length;
    const disabled = connections.filter((item) => !item.enabled).length;
    return { total, connected, paused, error, disabled };
  }, [connections]);

  const filteredConnections = useMemo(() => {
    const query = connectionSearch.trim().toLowerCase();
    if (!query) {
      return connections;
    }
    return connections.filter((connection) => {
      const catalogLabel = (catalogLabelById.get(connection.catalogId) ?? "").toLowerCase();
      const lastError = (connection.lastError ?? "").toLowerCase();
      return connection.label.toLowerCase().includes(query)
        || connection.catalogId.toLowerCase().includes(query)
        || catalogLabel.includes(query)
        || connection.kind.toLowerCase().includes(query)
        || connection.status.toLowerCase().includes(query)
        || lastError.includes(query);
    });
  }, [catalogLabelById, connectionSearch, connections]);

  const effectiveConfig = useMemo(() => {
    if (showAdvancedJson) {
      try {
        return JSON.parse(configJson) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return guidedConfig;
  }, [configJson, guidedConfig, showAdvancedJson]);

  useEffect(() => {
    const localReview = evaluateLocalRisk({
      selectedCatalog,
      selectedCatalogId,
      configJson: JSON.stringify(effectiveConfig),
      status,
      enabled,
    });

    void evaluateUiChangeRisk({
      pageId: "integrations",
      changes: [
        { field: "integration.kindFilter", from: "all", to: kindFilter },
        { field: "integration.catalogId", from: "", to: selectedCatalogId },
        { field: "integration.status", from: "connected", to: status },
        { field: "integration.enabled", from: true, to: enabled },
        { field: "integration.configJson", from: "{}", to: JSON.stringify(effectiveConfig) },
      ],
    })
      .then((remoteReview) => {
        const merged = mergeRiskItems(
          localReview.items,
          remoteReview.items.map((item) => ({
            field: item.field,
            level: item.level,
            hint: item.hint,
          })),
        );
        setChangeReview({
          overall: deriveOverallRisk(merged),
          items: merged,
        });
      })
      .catch(() => {
        setChangeReview({
          overall: deriveOverallRisk(localReview.items),
          items: localReview.items,
        });
      });
  }, [kindFilter, selectedCatalogId, selectedCatalog, status, enabled, effectiveConfig]);

  const onCreate = async () => {
    if (changeReview.overall === "critical" && !criticalConfirmed) {
      setError("Confirm critical integration changes before creating.");
      return;
    }
    if (!selectedCatalogId) {
      setError("Select a catalog entry first.");
      return;
    }
    let parsedConfig: Record<string, unknown>;
    if (showAdvancedJson) {
      try {
        parsedConfig = JSON.parse(configJson) as Record<string, unknown>;
      } catch {
        setError("Connection config JSON is invalid.");
        return;
      }
    } else {
      parsedConfig = sanitizeGuidedConfig(guidedConfig);
      setConfigJson(JSON.stringify(parsedConfig, null, 2));
    }

    const derivedLabel = label.trim() || (typeof parsedConfig.label === "string" ? parsedConfig.label : "");
    const derivedEnabled = typeof parsedConfig.enabled === "boolean" ? parsedConfig.enabled : enabled;
    const { label: _omitLabel, enabled: _omitEnabled, ...normalizedConfig } = parsedConfig;

    try {
      await createAction.run(async () => {
        await createIntegrationConnection({
          catalogId: selectedCatalogId,
          label: derivedLabel || undefined,
          enabled: derivedEnabled,
          status,
          config: normalizedConfig,
        });
      });
      setLabel("");
      setGuidedConfig({});
      setConfigJson("{}");
      setCriticalConfirmed(false);
      setError(null);
      load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onToggle = async (connection: IntegrationConnection) => {
    try {
      await updateIntegrationConnection(connection.connectionId, {
        enabled: !connection.enabled,
        status: !connection.enabled ? "connected" : "paused",
      });
      load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onInstallPlugin = async () => {
    const source = pluginSource.trim();
    if (!source) {
      setError("Enter a plugin source first.");
      return;
    }
    setPluginBusyId("install");
    try {
      await installIntegrationPlugin({ source });
      setPluginSource("");
      setError(null);
      load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPluginBusyId(null);
    }
  };

  const onTogglePlugin = async (pluginId: string, enabled: boolean) => {
    setPluginBusyId(pluginId);
    try {
      if (enabled) {
        await disableIntegrationPlugin(pluginId);
      } else {
        await enableIntegrationPlugin(pluginId);
      }
      setError(null);
      load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPluginBusyId(null);
    }
  };

  const onDeleteConfirmed = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteAction.run(async () => {
        await deleteIntegrationConnection(deleteTarget.connectionId);
      });
      setDeleteTarget(null);
      load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onSaveObsidianConfig = async () => {
    setObsidianBusy("save");
    try {
      const allowedSubpaths = obsidianAllowedSubpaths
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const updated = await patchObsidianIntegrationConfig({
        enabled: obsidianEnabled,
        vaultPath: obsidianVaultPath.trim(),
        mode: obsidianMode,
        allowedSubpaths,
      });
      setObsidianEnabled(updated.enabled);
      setObsidianVaultPath(updated.vaultPath);
      setObsidianMode(updated.mode);
      setObsidianAllowedSubpaths(updated.allowedSubpaths.join(", "));
      setError(null);
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setObsidianBusy(null);
    }
  };

  const onTestObsidian = async () => {
    setObsidianBusy("test");
    try {
      const tested = await testObsidianIntegration();
      setObsidianStatus(tested);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setObsidianBusy(null);
    }
  };

  const onSearchObsidian = async () => {
    const query = obsidianQuery.trim();
    if (!query) {
      setError("Enter a search query for Obsidian notes.");
      return;
    }
    setObsidianBusy("search");
    try {
      const response = await searchObsidianNotes({ query, limit: 8 });
      setObsidianSearchResults(response.items);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setObsidianBusy(null);
    }
  };

  const onCaptureObsidianInbox = async () => {
    const requestText = obsidianInboxRequest.trim();
    if (!requestText) {
      setError("Enter a short request to capture in Obsidian inbox.");
      return;
    }
    setObsidianBusy("capture");
    try {
      await captureObsidianInboxEntry({
        id: `GC-IN-${Math.floor(Date.now() / 1000)}`,
        request: requestText,
        type: "feature",
        priority: "medium",
        owner: "Personal Assistant Goat",
        state: "new",
        taskLink: "[[GoatCitadel Tasks]]",
      });
      setObsidianInboxRequest("");
      setError(null);
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setObsidianBusy(null);
    }
  };

  const blockCreate = changeReview.overall === "critical" && !criticalConfirmed;

  return (
    <section>
      <h2>{pageCopy.integrations.title}</h2>
      <p className="office-subtitle">{pageCopy.integrations.subtitle}</p>
      <PageGuideCard
        what={pageCopy.integrations.guide?.what ?? ""}
        when={pageCopy.integrations.guide?.when ?? ""}
        mostCommonAction={pageCopy.integrations.guide?.mostCommonAction}
        actions={pageCopy.integrations.guide?.actions ?? []}
        terms={pageCopy.integrations.guide?.terms}
      />
      {error ? <p className="error">{error}</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing integrations...</p> : null}

      <article className="card">
        <h3>How Connections Work</h3>
        <ol>
          <li>Pick a catalog entry to define what you are connecting.</li>
          <li>Fill guided fields (recommended), then save the connection.</li>
          <li>Leave it connected for live use, or pause it until needed.</li>
        </ol>
        <p className="office-subtitle">
          A connection stores settings and credentials. It only gets used when a workflow or page calls it.
        </p>
        <div className="token-row">
          <span className="token-chip">Configured: {connectionSummary.total}</span>
          <span className="token-chip token-chip-active">Ready: {connectionSummary.connected}</span>
          <span className="token-chip">Paused: {connectionSummary.paused}</span>
          <span className="token-chip">Errors: {connectionSummary.error}</span>
          <span className="token-chip">Disabled: {connectionSummary.disabled}</span>
        </div>
      </article>

      <article className="card">
        <h3>Obsidian (Optional)</h3>
        <p className="office-subtitle">
          Use this only if you want GoatCitadel to read and append markdown notes in your local Obsidian vault.
          Leave disabled if you do not use Obsidian.
        </p>
        <ol>
          <li>Set the local vault path and save config.</li>
          <li>Run Test connection to confirm the vault is reachable.</li>
          <li>Optionally capture quick inbox requests into your Obsidian workflow.</li>
        </ol>
        <div className="controls-row">
          <GCSwitch
            checked={obsidianEnabled}
            onCheckedChange={setObsidianEnabled}
            label="Enable Obsidian integration"
          />
          <label htmlFor="obsidianVaultPath">Vault path</label>
          <input
            id="obsidianVaultPath"
            value={obsidianVaultPath}
            onChange={(event) => setObsidianVaultPath(event.target.value)}
            placeholder="F:\\AI Obsidian\\AI Info"
          />
        </div>
        <div className="controls-row">
          <label htmlFor="obsidianMode">Access mode</label>
          <GCSelect
            id="obsidianMode"
            value={obsidianMode}
            onChange={(value) => setObsidianMode(value as "read_append" | "read_only")}
            options={[
              { value: "read_append", label: "read_append (recommended)" },
              { value: "read_only", label: "read_only" },
            ]}
          />
          <label htmlFor="obsidianAllowedSubpaths">Allowed subpaths (comma-separated)</label>
          <input
            id="obsidianAllowedSubpaths"
            value={obsidianAllowedSubpaths}
            onChange={(event) => setObsidianAllowedSubpaths(event.target.value)}
            placeholder="GoatCitadel, GoatCitadel/Inbox"
          />
          <button type="button" disabled={obsidianBusy === "save"} onClick={() => void onSaveObsidianConfig()}>
            {obsidianBusy === "save" ? "Saving..." : "Save Obsidian config"}
          </button>
          <button type="button" disabled={obsidianBusy === "test"} onClick={() => void onTestObsidian()}>
            {obsidianBusy === "test" ? "Testing..." : "Test connection"}
          </button>
        </div>
        {obsidianStatus ? (
          <div className="token-row">
            <span className={`token-chip ${obsidianStatus.vaultReachable ? "token-chip-active" : ""}`}>
              {obsidianStatus.vaultReachable ? "Vault reachable" : "Vault unreachable"}
            </span>
            <span className="token-chip">Mode: {obsidianStatus.mode}</span>
            <span className="token-chip">Last check: {new Date(obsidianStatus.checkedAt).toLocaleString()}</span>
            {obsidianStatus.lastOperationAt ? (
              <span className="token-chip">Last operation: {new Date(obsidianStatus.lastOperationAt).toLocaleString()}</span>
            ) : null}
          </div>
        ) : null}
        {!obsidianStatus?.enabled ? (
          <p className="table-subtext">
            Obsidian is currently disabled. This is safe default behavior.
          </p>
        ) : null}
        {obsidianStatus?.enabled && !obsidianStatus.vaultReachable ? (
          <p className="error">
            Obsidian is enabled but vault is not reachable. Check your local path and permissions.
          </p>
        ) : null}
        {obsidianStatus?.lastError ? (
          <p className="error">Last Obsidian error: {obsidianStatus.lastError}</p>
        ) : null}
        <details className="advanced-panel">
          <summary>Quick Obsidian operations</summary>
          <div className="controls-row">
            <label htmlFor="obsidianQuery">Search notes</label>
            <input
              id="obsidianQuery"
              value={obsidianQuery}
              onChange={(event) => setObsidianQuery(event.target.value)}
              placeholder="Prompt Lab"
            />
            <button type="button" disabled={obsidianBusy === "search"} onClick={() => void onSearchObsidian()}>
              {obsidianBusy === "search" ? "Searching..." : "Search"}
            </button>
          </div>
          {obsidianSearchResults.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Note</th>
                  <th>Snippet</th>
                </tr>
              </thead>
              <tbody>
                {obsidianSearchResults.map((item) => (
                  <tr key={item.relativePath}>
                    <td>{item.relativePath}</td>
                    <td>{item.snippet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="table-subtext">No search results yet.</p>
          )}
          <div className="controls-row">
            <label htmlFor="obsidianInboxRequest">Capture inbox request</label>
            <input
              id="obsidianInboxRequest"
              value={obsidianInboxRequest}
              onChange={(event) => setObsidianInboxRequest(event.target.value)}
              placeholder="Investigate score failures in Prompt Lab"
            />
            <button type="button" disabled={obsidianBusy === "capture"} onClick={() => void onCaptureObsidianInbox()}>
              {obsidianBusy === "capture" ? "Capturing..." : "Capture to Obsidian inbox"}
            </button>
          </div>
        </details>
      </article>

      <article className="card">
        <div className="controls-row">
          <label htmlFor="integrationKind">
            Connection type
            <HelpHint
              label="Connection type help"
              text="Filter catalog entries by integration category. This does not remove existing connections."
            />
          </label>
          <GCSelect
            id="integrationKind"
            value={kindFilter}
            onChange={(value) => {
              setKindFilter(value as IntegrationKind);
              setSelectedCatalogId("");
              setFormSchema(undefined);
            }}
            options={KIND_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>
        <p className="office-subtitle">
          {kindFilter === "all"
            ? "Showing all available catalog entries."
            : KIND_DESCRIPTIONS[kindFilter]}
        </p>
      </article>

      <ChangeReviewPanel
        title="Pre-Save Safety Check"
        overall={changeReview.overall}
        items={changeReview.items}
        requireCriticalConfirm
        criticalConfirmed={criticalConfirmed}
        onCriticalConfirmChange={setCriticalConfirmed}
      />

      <article className="card">
        <h3>Create Connection</h3>
        <p className="office-subtitle">
          Start in guided mode. Switch to advanced JSON only if you need unsupported fields.
        </p>
        {isInitialLoading ? <CardSkeleton lines={5} /> : null}
        {!isInitialLoading ? (
          <>
            <div className="controls-row">
              <label>
                Catalog entry
                <HelpHint
                  label="Catalog entry help"
                  text="Catalog entries define expected auth methods, fields, and capabilities for a service."
                />
              </label>
              <SelectOrCustom
                value={selectedCatalogId}
                onChange={setSelectedCatalogId}
                options={catalogOptions}
                customPlaceholder="Select a catalog entry"
                customLabel="Catalog id"
                customOptionLabel="Use custom catalog id"
              />
            </div>
            <div className="controls-row">
              <label>
                Display name (optional)
                <HelpHint
                  label="Connection label help"
                  text="Friendly name shown in lists. If left blank, GoatCitadel uses the catalog name."
                />
              </label>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={selectedCatalog?.label ?? "Connection label"}
              />
              <label>
                Initial status
                <HelpHint
                  label="Initial status help"
                  text="Connected means ready now. Paused/disconnected keeps config saved without active use."
                />
              </label>
              <GCSelect
                value={status}
                onChange={(value) => setStatus(value as IntegrationConnection["status"])}
                options={STATUS_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
              <GCSwitch
                checked={enabled}
                onCheckedChange={setEnabled}
                label="Enable right away"
              />
            </div>
            <p className="office-subtitle">
              {STATUS_OPTIONS.find((option) => option.value === status)?.description}
            </p>
            {selectedCatalog ? (
              <div className="card">
                <p><strong>{selectedCatalog.label}</strong> [{formatMaturity(selectedCatalog.maturity)}]</p>
                <p>{selectedCatalog.description}</p>
                <p className="office-subtitle">
                  Auth: {selectedCatalog.authMethods.join(", ") || "-"}
                  {" | "}
                  Kind: {formatKind(selectedCatalog.kind)}
                </p>
                <p className="office-subtitle">{describeMaturity(selectedCatalog.maturity)}</p>
                {selectedCatalog.docsUrl ? (
                  <p className="office-subtitle">
                    <a href={selectedCatalog.docsUrl} target="_blank" rel="noreferrer">Open integration docs</a>
                  </p>
                ) : null}
                <div className="token-row">
                  {selectedCatalog.capabilities.map((capability) => (
                    <span key={capability} className="token-chip">{capability}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="controls-row">
              <strong>Setup mode</strong>
              <button type="button" className={!showAdvancedJson ? "active" : ""} onClick={() => setShowAdvancedJson(false)}>
                Guided (recommended)
              </button>
              <button type="button" className={showAdvancedJson ? "active" : ""} onClick={() => setShowAdvancedJson(true)}>
                Advanced JSON
              </button>
            </div>
            {!showAdvancedJson ? (
              <ConfigFormBuilder
                schema={formSchema}
                value={guidedConfig}
                onChange={setGuidedConfig}
              />
            ) : (
              <>
                <label htmlFor="connectionConfig">Connection config (JSON)</label>
                <textarea
                  id="connectionConfig"
                  rows={8}
                  className="full-textarea"
                  value={configJson}
                  onChange={(event) => setConfigJson(event.target.value)}
                />
              </>
            )}
            <button onClick={() => void onCreate()} disabled={blockCreate || createAction.pending}>
              {createAction.pending ? "Saving..." : "Save Connection"}
            </button>
          </>
        ) : null}
      </article>

      <article className="card">
        <h3>Configured Connections</h3>
        <p className="office-subtitle">
          Search by name, catalog, status, or error text.
        </p>
        <div className="controls-row">
          <label htmlFor="connectionSearch">Filter</label>
          <input
            id="connectionSearch"
            value={connectionSearch}
            onChange={(event) => setConnectionSearch(event.target.value)}
            placeholder="Search label, catalog, status, error..."
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Catalog</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Enabled</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredConnections.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {connections.length === 0
                    ? "No configured connections yet. Create one above to get started."
                    : "No connections match this filter."}
                </td>
              </tr>
            ) : filteredConnections.map((connection) => (
              <tr key={connection.connectionId}>
                <td>{connection.label}</td>
                <td>
                  {catalogLabelById.get(connection.catalogId) ?? connection.catalogId}
                  <div className="table-subtext">{connection.catalogId}</div>
                </td>
                <td>{formatKind(connection.kind)}</td>
                <td>
                  {formatStatus(connection.status)}
                  {connection.lastError ? <div className="table-subtext">{connection.lastError}</div> : null}
                </td>
                <td>{connection.enabled ? "yes" : "no"}</td>
                <td>{new Date(connection.updatedAt).toLocaleString()}</td>
                <td className="actions">
                  <button onClick={() => void onToggle(connection)}>
                    {connection.enabled ? "Pause" : "Enable"}
                  </button>
                  <button
                    className="danger"
                    onClick={() => setDeleteTarget(connection)}
                    disabled={deleteAction.pending}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="card">
        <h3>Plugin Adapters</h3>
        <p className="office-subtitle">
          Optional adapters for services that are not built in yet. Most users can skip this section.
        </p>
        <details className="advanced-panel">
          <summary>Install new plugin adapter (advanced)</summary>
          <div className="controls-row" style={{ marginTop: 10 }}>
            <input
              value={pluginSource}
              onChange={(event) => setPluginSource(event.target.value)}
              placeholder="Plugin source (file path, URL, or package id)"
            />
            <button onClick={() => void onInstallPlugin()} disabled={pluginBusyId === "install"}>
              {pluginBusyId === "install" ? "Installing..." : "Install Plugin"}
            </button>
          </div>
        </details>
        <table>
          <thead>
            <tr>
              <th>Plugin</th>
              <th>Version</th>
              <th>Capabilities</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {plugins.length === 0 ? (
              <tr>
                <td colSpan={6}>No plugins installed.</td>
              </tr>
            ) : plugins.map((plugin) => (
              <tr key={plugin.pluginId}>
                <td>
                  <strong>{plugin.label}</strong>
                  <div className="office-subtitle">{plugin.pluginId}</div>
                </td>
                <td>{plugin.version}</td>
                <td>{plugin.capabilities.join(", ") || "-"}</td>
                <td>{plugin.enabled ? "enabled" : "disabled"}</td>
                <td>{new Date(plugin.updatedAt).toLocaleString()}</td>
                <td>
                  <button
                    onClick={() => void onTogglePlugin(plugin.pluginId, plugin.enabled)}
                    disabled={pluginBusyId === plugin.pluginId}
                  >
                    {pluginBusyId === plugin.pluginId
                      ? (plugin.enabled ? "Disabling..." : "Enabling...")
                      : (plugin.enabled ? "Disable" : "Enable")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove Integration Connection"
        message={`Remove "${deleteTarget?.label ?? "this connection"}" and its saved configuration?`}
        confirmLabel={deleteAction.pending ? "Removing..." : "Remove"}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void onDeleteConfirmed()}
      />
    </section>
  );
}

function sanitizeGuidedConfig(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      return true;
    }),
  );
}

function evaluateLocalRisk(input: {
  selectedCatalog?: IntegrationCatalogEntry;
  selectedCatalogId: string;
  configJson: string;
  status: IntegrationConnection["status"];
  enabled: boolean;
}): { items: UiRiskItem[] } {
  const items: UiRiskItem[] = [];

  if (!input.selectedCatalogId.trim()) {
    items.push({
      field: "integration.catalogId",
      level: "warning",
      hint: "Choose a catalog entry before creating a connection.",
    });
  }

  if (input.status === "connected" && !input.enabled) {
    items.push({
      field: "integration.enabled",
      level: "warning",
      hint: "Status says connected while enabled is off.",
    });
  }

  if (input.selectedCatalog?.maturity === "planned") {
    items.push({
      field: "integration.maturity",
      level: "warning",
      hint: "Planned integrations may require additional setup before they work.",
    });
  }

  try {
    const parsed = JSON.parse(input.configJson) as Record<string, unknown>;
    const flattened = JSON.stringify(parsed).toLowerCase();
    if (flattened.includes("password") || flattened.includes("apikey") || flattened.includes("secret") || flattened.includes("token")) {
      items.push({
        field: "integration.configJson",
        level: "warning",
        hint: "Config includes secret-like keys. Prefer env-backed references when possible.",
      });
    }
    const urls = extractUrlCandidates(parsed);
    if (urls.some((url) => url.startsWith("http://") && !url.includes("127.0.0.1") && !url.includes("localhost"))) {
      items.push({
        field: "integration.configJson",
        level: "critical",
        hint: "Non-local plain HTTP URL detected in config. Use HTTPS for remote endpoints.",
      });
    }
  } catch {
    items.push({
      field: "integration.configJson",
      level: "critical",
      hint: "Config JSON is invalid and cannot be saved safely.",
    });
  }

  return { items };
}

function extractUrlCandidates(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      out.push(trimmed.toLowerCase());
    }
    return out;
  }
  if (!value || typeof value !== "object") {
    return out;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    extractUrlCandidates(child, out);
  }
  return out;
}

function mergeRiskItems(localItems: UiRiskItem[], remoteItems: UiRiskItem[]): UiRiskItem[] {
  const merged = new Map<string, UiRiskItem>();

  for (const item of [...localItems, ...remoteItems]) {
    const existing = merged.get(item.field);
    if (!existing) {
      merged.set(item.field, item);
      continue;
    }
    const stronger = maxRisk(existing.level, item.level);
    const hint = [existing.hint, item.hint].filter(Boolean).join(" ");
    merged.set(item.field, {
      field: item.field,
      level: stronger,
      hint: hint || undefined,
    });
  }

  return [...merged.values()];
}

function maxRisk(a: UiRiskLevel, b: UiRiskLevel): UiRiskLevel {
  if (a === "critical" || b === "critical") {
    return "critical";
  }
  if (a === "warning" || b === "warning") {
    return "warning";
  }
  return "safe";
}

function deriveOverallRisk(items: UiRiskItem[]): UiRiskLevel {
  if (items.some((item) => item.level === "critical")) {
    return "critical";
  }
  if (items.some((item) => item.level === "warning")) {
    return "warning";
  }
  return "safe";
}

function formatKind(kind: IntegrationCatalogEntry["kind"]): string {
  switch (kind) {
    case "channel":
      return "Channel";
    case "model_provider":
      return "Model provider";
    case "productivity":
      return "Productivity";
    case "automation":
      return "Automation";
    case "platform":
      return "Platform";
    default:
      return kind;
  }
}

function formatStatus(status: IntegrationConnection["status"]): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "paused":
      return "Paused";
    case "error":
      return "Error";
    default:
      return status;
  }
}

function formatMaturity(maturity: IntegrationCatalogEntry["maturity"]): string {
  switch (maturity) {
    case "native":
      return "Native";
    case "plugin":
      return "Plugin";
    case "disabled":
      return "Disabled";
    case "beta":
      return "Beta";
    case "planned":
      return "Planned";
    default:
      return maturity;
  }
}

function describeMaturity(maturity: IntegrationCatalogEntry["maturity"]): string {
  switch (maturity) {
    case "native":
      return "Built-in and supported in this runtime.";
    case "plugin":
      return "Supported through a plugin adapter.";
    case "disabled":
      return "Known integration, currently disabled in this runtime.";
    case "beta":
      return "Available, but still stabilizing.";
    case "planned":
      return "Roadmapped. May need plugin or manual setup before use.";
    default:
      return "";
  }
}
