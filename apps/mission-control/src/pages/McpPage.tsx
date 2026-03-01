import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectMcpServer,
  createMcpServer,
  deleteMcpServer,
  disconnectMcpServer,
  fetchMcpServers,
  fetchMcpTools,
  invokeMcpTool,
  startMcpOAuth,
  updateMcpServerPolicy,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { CardSkeleton } from "../components/CardSkeleton";
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

type Transport = "stdio" | "http" | "sse";
type McpCategory = "development" | "browser" | "automation" | "research" | "data" | "creative" | "orchestration" | "other";
type McpTrustTier = "trusted" | "restricted" | "quarantined";
type McpCostTier = "free" | "mixed" | "paid" | "unknown";

export function McpPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [servers, setServers] = useState<Array<{
    serverId: string;
    label: string;
    transport: Transport;
    status: "disconnected" | "connecting" | "connected" | "error";
    enabled: boolean;
    category: McpCategory;
    trustTier: McpTrustTier;
    costTier: McpCostTier;
    policy: {
      requireFirstToolApproval: boolean;
      redactionMode: "off" | "basic" | "strict";
      allowedToolPatterns: string[];
      blockedToolPatterns: string[];
      notes?: string;
    };
    command?: string;
    url?: string;
    authType: "none" | "token" | "oauth2";
    verifiedAt?: string;
    lastError?: string;
  }>>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [tools, setTools] = useState<Array<{
    serverId: string;
    toolName: string;
    description?: string;
    enabled: boolean;
    updatedAt: string;
  }>>([]);
  const [toolName, setToolName] = useState("");
  const [toolArgs, setToolArgs] = useState("{}");
  const [transport, setTransport] = useState<Transport>("stdio");
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<"none" | "token" | "oauth2">("none");
  const [category, setCategory] = useState<McpCategory>("development");
  const [trustTier, setTrustTier] = useState<McpTrustTier>("restricted");
  const [costTier, setCostTier] = useState<McpCostTier>("unknown");
  const [policyRequireFirst, setPolicyRequireFirst] = useState(false);
  const [policyRedaction, setPolicyRedaction] = useState<"off" | "basic" | "strict">("basic");
  const [policyAllowed, setPolicyAllowed] = useState("");
  const [policyBlocked, setPolicyBlocked] = useState("");
  const [policyNotes, setPolicyNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    const response = await fetchMcpServers();
    setServers(response.items);
    setSelectedServerId((current) => current ?? response.items[0]?.serverId ?? null);
  }, []);

  const loadTools = useCallback(async (serverId: string) => {
    const response = await fetchMcpTools(serverId);
    setTools(response.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadServers()
      .then(() => {
        if (!cancelled) {
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadServers, refreshKey]);

  useEffect(() => {
    if (!selectedServerId) {
      setTools([]);
      return;
    }
    void loadTools(selectedServerId).catch((err: Error) => {
      setError(err.message);
    });
  }, [loadTools, selectedServerId]);

  const selected = useMemo(
    () => servers.find((item) => item.serverId === selectedServerId) ?? null,
    [selectedServerId, servers],
  );

  useEffect(() => {
    if (!selected) {
      return;
    }
    setPolicyRequireFirst(selected.policy.requireFirstToolApproval);
    setPolicyRedaction(selected.policy.redactionMode);
    setPolicyAllowed(selected.policy.allowedToolPatterns.join(", "));
    setPolicyBlocked(selected.policy.blockedToolPatterns.join(", "));
    setPolicyNotes(selected.policy.notes ?? "");
  }, [selected]);

  const handleCreateServer = useCallback(async () => {
    if (!label.trim()) {
      return;
    }
    setBusy(true);
    try {
      await createMcpServer({
        label: label.trim(),
        transport,
        command: transport === "stdio" ? command.trim() || undefined : undefined,
        url: transport !== "stdio" ? url.trim() || undefined : undefined,
        authType,
        category,
        trustTier,
        costTier,
      });
      setLabel("");
      await loadServers();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [authType, category, command, costTier, label, loadServers, transport, trustTier, url]);

  if (loading) {
    return (
      <section>
        <h2>{pageCopy.mcp.title}</h2>
        <CardSkeleton lines={8} />
      </section>
    );
  }

  return (
    <section>
      <h2>{pageCopy.mcp.title}</h2>
      <p className="office-subtitle">{pageCopy.mcp.subtitle}</p>
      <PageGuideCard
        what={pageCopy.mcp.guide?.what ?? ""}
        when={pageCopy.mcp.guide?.when ?? ""}
        actions={pageCopy.mcp.guide?.actions ?? []}
        terms={pageCopy.mcp.guide?.terms}
      />
      {error ? <p className="error">{error}</p> : null}

      <div className="split-grid">
        <article className="card">
          <h3>Register MCP Server</h3>
          <div className="controls-row">
            <label htmlFor="mcpLabel">Label <HelpHint label="Server label help" text="Human-readable name used in server list and logs." /></label>
            <input id="mcpLabel" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Docs MCP" />
          </div>
          <div className="controls-row">
            <label htmlFor="mcpTransport">Transport</label>
            <select id="mcpTransport" value={transport} onChange={(event) => setTransport(event.target.value as Transport)}>
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="sse">sse</option>
            </select>
            <label htmlFor="mcpAuth">Auth</label>
            <select id="mcpAuth" value={authType} onChange={(event) => setAuthType(event.target.value as "none" | "token" | "oauth2")}>
              <option value="none">none</option>
              <option value="token">token</option>
              <option value="oauth2">oauth2</option>
            </select>
          </div>
          <div className="controls-row">
            <label htmlFor="mcpCategory">Category</label>
            <select id="mcpCategory" value={category} onChange={(event) => setCategory(event.target.value as McpCategory)}>
              <option value="development">development</option>
              <option value="browser">browser</option>
              <option value="automation">automation</option>
              <option value="research">research</option>
              <option value="data">data</option>
              <option value="creative">creative</option>
              <option value="orchestration">orchestration</option>
              <option value="other">other</option>
            </select>
            <label htmlFor="mcpTrustTier">Trust</label>
            <select id="mcpTrustTier" value={trustTier} onChange={(event) => setTrustTier(event.target.value as McpTrustTier)}>
              <option value="trusted">trusted</option>
              <option value="restricted">restricted</option>
              <option value="quarantined">quarantined</option>
            </select>
            <label htmlFor="mcpCostTier">Cost</label>
            <select id="mcpCostTier" value={costTier} onChange={(event) => setCostTier(event.target.value as McpCostTier)}>
              <option value="free">free</option>
              <option value="mixed">mixed</option>
              <option value="paid">paid</option>
              <option value="unknown">unknown</option>
            </select>
          </div>
          {transport === "stdio" ? (
            <div className="controls-row">
              <label htmlFor="mcpCommand">Command <HelpHint label="stdio command help" text="Absolute path or command on PATH used to start the local MCP process." /></label>
              <input id="mcpCommand" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx @modelcontextprotocol/server-filesystem" />
            </div>
          ) : (
            <div className="controls-row">
              <label htmlFor="mcpUrl">URL</label>
              <input id="mcpUrl" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://mcp.example.com/stream" />
            </div>
          )}
          <ActionButton label="Add Server" pending={busy} onClick={handleCreateServer} />
        </article>

        <article className="card">
          <h3>Servers</h3>
          <ul className="compact-list chat-scroll">
            {servers.map((server) => (
              <li key={server.serverId} className="chat-list-item">
                <button
                  type="button"
                  className={`chat-list-button${selectedServerId === server.serverId ? " active" : ""}`}
                  onClick={() => setSelectedServerId(server.serverId)}
                >
                  {server.label}
                </button>
                <p className="chat-item-meta">
                  {server.transport} | {server.status} | {server.trustTier} | {server.costTier}
                </p>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="stack-md">
              <div className="actions">
                <ActionButton
                  label={selected.status === "connected" ? "Disconnect" : "Connect"}
                  pending={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (selected.status === "connected") {
                        await disconnectMcpServer(selected.serverId);
                      } else {
                        await connectMcpServer(selected.serverId);
                      }
                      await loadServers();
                      if (selectedServerId) {
                        await loadTools(selectedServerId);
                      }
                      setError(null);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                {selected.authType === "oauth2" ? (
                  <ActionButton
                    label="Start OAuth"
                    pending={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const oauth = await startMcpOAuth(selected.serverId);
                        setResult(`Open OAuth URL: ${oauth.authorizeUrl}`);
                        setError(null);
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                ) : null}
                <ActionButton
                  label="Delete"
                  pending={busy}
                  danger
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await deleteMcpServer(selected.serverId);
                      await loadServers();
                      setError(null);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </div>
              <div className="controls-row">
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={policyRequireFirst}
                    onChange={(event) => setPolicyRequireFirst(event.target.checked)}
                  />
                  Require first-use approval
                </label>
                <label htmlFor="mcpPolicyRedaction">Redaction mode</label>
                <select
                  id="mcpPolicyRedaction"
                  value={policyRedaction}
                  onChange={(event) => setPolicyRedaction(event.target.value as "off" | "basic" | "strict")}
                >
                  <option value="off">off</option>
                  <option value="basic">basic</option>
                  <option value="strict">strict</option>
                </select>
              </div>
              <div className="controls-row">
                <label htmlFor="mcpAllowedPatterns">Allow patterns</label>
                <input
                  id="mcpAllowedPatterns"
                  placeholder="search.*, fetch"
                  value={policyAllowed}
                  onChange={(event) => setPolicyAllowed(event.target.value)}
                />
              </div>
              <div className="controls-row">
                <label htmlFor="mcpBlockedPatterns">Block patterns</label>
                <input
                  id="mcpBlockedPatterns"
                  placeholder="admin.*, shell.*"
                  value={policyBlocked}
                  onChange={(event) => setPolicyBlocked(event.target.value)}
                />
              </div>
              <div className="controls-row">
                <label htmlFor="mcpPolicyNotes">Notes</label>
                <input
                  id="mcpPolicyNotes"
                  placeholder="Optional policy note"
                  value={policyNotes}
                  onChange={(event) => setPolicyNotes(event.target.value)}
                />
                <ActionButton
                  label="Save Policy"
                  pending={busy}
                  onClick={async () => {
                    if (!selected) {
                      return;
                    }
                    setBusy(true);
                    try {
                      await updateMcpServerPolicy(selected.serverId, {
                        requireFirstToolApproval: policyRequireFirst,
                        redactionMode: policyRedaction,
                        allowedToolPatterns: policyAllowed.split(",").map((item) => item.trim()).filter(Boolean),
                        blockedToolPatterns: policyBlocked.split(",").map((item) => item.trim()).filter(Boolean),
                        notes: policyNotes.trim() || undefined,
                      });
                      await loadServers();
                      setError(null);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </div>
            </div>
          ) : null}
        </article>
      </div>

      <article className="card">
        <h3>Tool Catalog</h3>
        {!selected ? <p className="office-subtitle">Select a server to inspect and invoke tools.</p> : null}
        <ul className="compact-list">
          {tools.map((tool) => (
            <li key={`${tool.serverId}:${tool.toolName}`}>
              <strong>{tool.toolName}</strong>
              {tool.description ? <p className="chat-item-meta">{tool.description}</p> : null}
            </li>
          ))}
        </ul>
        {selected ? (
          <div className="controls-row">
            <input value={toolName} onChange={(event) => setToolName(event.target.value)} placeholder="tool name" />
            <input value={toolArgs} onChange={(event) => setToolArgs(event.target.value)} placeholder='{"query":"hello"}' />
            <ActionButton
              label="Invoke Tool"
              pending={busy}
              onClick={async () => {
                if (!selected || !toolName.trim()) {
                  return;
                }
                setBusy(true);
                try {
                  const parsedArgs = toolArgs.trim() ? JSON.parse(toolArgs) as Record<string, unknown> : {};
                  const response = await invokeMcpTool({
                    serverId: selected.serverId,
                    toolName: toolName.trim(),
                    arguments: parsedArgs,
                  });
                  setResult(JSON.stringify(response, null, 2));
                  setError(null);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        ) : null}
        {result ? (
          <pre>{result}</pre>
        ) : null}
      </article>
    </section>
  );
}
