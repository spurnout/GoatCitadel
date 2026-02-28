import { useEffect, useMemo, useState } from "react";
import {
  createIntegrationConnection,
  deleteIntegrationConnection,
  fetchIntegrationCatalog,
  fetchIntegrationConnections,
  updateIntegrationConnection,
  type IntegrationCatalogEntry,
  type IntegrationConnection,
} from "../api/client";
import { SelectOrCustom } from "../components/SelectOrCustom";

type IntegrationKind = IntegrationCatalogEntry["kind"] | "all";

export function IntegrationsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [catalog, setCatalog] = useState<IntegrationCatalogEntry[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [kindFilter, setKindFilter] = useState<IntegrationKind>("all");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<IntegrationConnection["status"]>("connected");
  const [configJson, setConfigJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const kind = kindFilter === "all" ? undefined : kindFilter;
    void Promise.all([
      fetchIntegrationCatalog(kind),
      fetchIntegrationConnections(kind),
    ])
      .then(([catalogRes, connectionRes]) => {
        setCatalog(catalogRes.items);
        setConnections(connectionRes.items);
        if (!selectedCatalogId && catalogRes.items[0]) {
          setSelectedCatalogId(catalogRes.items[0].catalogId);
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

  const onCreate = async () => {
    if (!selectedCatalogId) {
      return;
    }
    let parsedConfig: Record<string, unknown> | undefined;
    try {
      parsedConfig = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      setError("Config JSON is invalid");
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

  return (
    <section>
      <h2>Connections</h2>
      <p className="office-subtitle">
        Configure channel, provider, productivity, and automation integrations for local or hosted deployments.
      </p>
      {error ? <p className="error">{error}</p> : null}

      <article className="card">
        <div className="controls-row">
          <label htmlFor="integrationKind">Scope</label>
          <select
            id="integrationKind"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as IntegrationKind)}
          >
            <option value="all">all</option>
            <option value="channel">channel</option>
            <option value="model_provider">model_provider</option>
            <option value="productivity">productivity</option>
            <option value="automation">automation</option>
            <option value="platform">platform</option>
          </select>
        </div>
      </article>

      <article className="card">
        <h3>Add Connection</h3>
        <div className="controls-row">
          <label>Catalog entry</label>
          <SelectOrCustom
            value={selectedCatalogId}
            onChange={setSelectedCatalogId}
            options={catalogOptions}
            customPlaceholder="Custom catalog id"
            customLabel="Catalog id"
          />
        </div>
        <div className="controls-row">
          <label>Label</label>
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
        <button onClick={onCreate}>Create Connection</button>
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
