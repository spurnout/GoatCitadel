import { useEffect, useMemo, useState } from "react";
import {
  createIntegrationConnection,
  deleteIntegrationConnection,
  evaluateUiChangeRisk,
  fetchIntegrationCatalog,
  fetchIntegrationConnections,
  updateIntegrationConnection,
  type IntegrationCatalogEntry,
  type IntegrationConnection,
} from "../api/client";
import { ChangeReviewPanel } from "../components/ChangeReviewPanel";
import { PageGuideCard } from "../components/PageGuideCard";
import { SelectOrCustom } from "../components/SelectOrCustom";

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

export function IntegrationsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [catalog, setCatalog] = useState<IntegrationCatalogEntry[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [kindFilter, setKindFilter] = useState<IntegrationKind>("all");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<IntegrationConnection["status"]>("connected");
  const [configJson, setConfigJson] = useState("{}");
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [changeReview, setChangeReview] = useState<{ overall: UiRiskLevel; items: UiRiskItem[] }>({
    overall: "safe",
    items: [],
  });
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const kind = kindFilter === "all" ? undefined : kindFilter;
    void Promise.all([
      fetchIntegrationCatalog(kind),
      fetchIntegrationConnections(kind),
    ])
      .then(([catalogRes, connectionRes]) => {
        const nextCatalog = catalogRes.items;
        setCatalog(nextCatalog);
        setConnections(connectionRes.items);

        const hasCurrentSelection = selectedCatalogId
          ? nextCatalog.some((entry) => entry.catalogId === selectedCatalogId)
          : false;
        const nextSelection = hasCurrentSelection
          ? selectedCatalogId
          : (nextCatalog[0]?.catalogId ?? "");

        if (nextSelection !== selectedCatalogId) {
          setSelectedCatalogId(nextSelection);
        }
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [kindFilter, refreshKey]);

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

  useEffect(() => {
    const localReview = evaluateLocalRisk({
      selectedCatalog,
      selectedCatalogId,
      configJson,
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
        { field: "integration.configJson", from: "{}", to: configJson },
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
  }, [kindFilter, selectedCatalogId, selectedCatalog, status, enabled, configJson]);

  const onCreate = async () => {
    if (changeReview.overall === "critical" && !criticalConfirmed) {
      setError("Confirm critical integration changes before creating.");
      return;
    }
    if (!selectedCatalogId) {
      setError("Select a catalog entry first.");
      return;
    }
    let parsedConfig: Record<string, unknown> | undefined;
    try {
      parsedConfig = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      setError("Connection config JSON is invalid.");
      return;
    }

    try {
      await createIntegrationConnection({
        catalogId: selectedCatalogId,
        label: label || undefined,
        enabled,
        status,
        config: parsedConfig,
      });
      setLabel("");
      setConfigJson("{}");
      setCriticalConfirmed(false);
      setError(null);
      load();
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
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (connectionId: string) => {
    const confirmed = window.confirm("Remove this integration connection and its saved configuration?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteIntegrationConnection(connectionId);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const blockCreate = changeReview.overall === "critical" && !criticalConfirmed;

  return (
    <section>
      <h2>Connections</h2>
      <p className="office-subtitle">
        Configure channels, provider endpoints, productivity apps, and automation hooks.
      </p>
      <PageGuideCard
        what="Connections defines external systems GoatCitadel can talk to and how each is authenticated."
        when="Use this to add, pause, or remove channel/model/productivity integrations."
        actions={[
          "Pick a scope and choose a catalog entry.",
          "Set connection status/config and create the connection.",
          "Pause, resume, or remove active connections.",
        ]}
        terms={[
          { term: "Catalog entry", meaning: "Built-in integration definition with capabilities and auth hints." },
          { term: "Connection config", meaning: "JSON settings used by that integration instance." },
        ]}
      />
      {error ? <p className="error">{error}</p> : null}

      <article className="card">
        <div className="controls-row">
          <label htmlFor="integrationKind">Scope</label>
          <select
            id="integrationKind"
            value={kindFilter}
            onChange={(event) => {
              setKindFilter(event.target.value as IntegrationKind);
              setSelectedCatalogId("");
            }}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </article>

      <ChangeReviewPanel
        title="Connection Draft Risk"
        overall={changeReview.overall}
        items={changeReview.items}
        requireCriticalConfirm
        criticalConfirmed={criticalConfirmed}
        onCriticalConfirmChange={setCriticalConfirmed}
      />

      <article className="card">
        <h3>Add Connection</h3>
        <div className="controls-row">
          <label>Catalog entry</label>
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
          <label>Connection label</label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={selectedCatalog?.label ?? "Connection label"}
          />
          <label>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value as IntegrationConnection["status"])}>
            <option value="connected">connected</option>
            <option value="disconnected">disconnected</option>
            <option value="paused">paused</option>
            <option value="error">error</option>
          </select>
          <label>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> enabled
          </label>
        </div>
        {selectedCatalog ? (
          <div className="card">
            <p><strong>{selectedCatalog.label}</strong> [{selectedCatalog.maturity}]</p>
            <p>{selectedCatalog.description}</p>
            <p className="office-subtitle">Auth: {selectedCatalog.authMethods.join(", ") || "-"}</p>
            <div className="token-row">
              {selectedCatalog.capabilities.map((capability) => (
                <span key={capability} className="token-chip">{capability}</span>
              ))}
            </div>
          </div>
        ) : null}
        <label htmlFor="connectionConfig">Connection config (JSON)</label>
        <textarea
          id="connectionConfig"
          rows={6}
          className="full-textarea"
          value={configJson}
          onChange={(event) => setConfigJson(event.target.value)}
        />
        <button onClick={onCreate} disabled={blockCreate}>Create Connection</button>
      </article>

      <article className="card">
        <h3>Active Connections</h3>
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
            {connections.length === 0 ? (
              <tr>
                <td colSpan={7}>No configured connections yet.</td>
              </tr>
            ) : connections.map((connection) => (
              <tr key={connection.connectionId}>
                <td>{connection.label}</td>
                <td>{connection.catalogId}</td>
                <td>{connection.kind}</td>
                <td>{connection.status}</td>
                <td>{connection.enabled ? "yes" : "no"}</td>
                <td>{new Date(connection.updatedAt).toLocaleString()}</td>
                <td className="actions">
                  <button onClick={() => onToggle(connection)}>
                    {connection.enabled ? "Pause" : "Enable"}
                  </button>
                  <button className="danger" onClick={() => onDelete(connection.connectionId)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
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
