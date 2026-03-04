import { useCallback, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  connectMcpServer,
  createMcpServer,
  deleteMcpServer,
  disconnectMcpServer,
  fetchMcpTemplateDiscovery,
  fetchMcpTemplates,
  fetchMcpServers,
  fetchMcpTools,
  invokeMcpTool,
  runMcpServerHealthCheck,
  startMcpOAuth,
  updateMcpServerPolicy,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { CardSkeleton } from "../components/CardSkeleton";
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { GCSelect, GCSwitch } from "../components/ui";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";

type Transport = "stdio" | "http" | "sse";
type McpCategory = "development" | "browser" | "automation" | "research" | "data" | "creative" | "orchestration" | "other";
type McpTrustTier = "trusted" | "restricted" | "quarantined";
type McpCostTier = "free" | "mixed" | "paid" | "unknown";

export function McpPage({ refreshKey: _refreshKey = 0 }: { refreshKey?: number }) {
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
  const [templates, setTemplates] = useState<Array<Awaited<ReturnType<typeof fetchMcpTemplates>>["items"][number]>>([]);
  const [templateDiscovery, setTemplateDiscovery] = useState<Array<{
    templateId: string;
    label: string;
    installed: boolean;
    readiness: "ready" | "needs_auth" | "needs_command" | "needs_url" | "unknown";
    dependencyChecks: Array<{
      key: string;
      status: "pass" | "warn" | "fail";
      message: string;
    }>;
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
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [diagnosticByServerId, setDiagnosticByServerId] = useState<Record<string, {
    connectorType: "mcp_server" | "integration_connection";
    connectorId: string;
    status: "ok" | "warn" | "error";
    checks: Array<{
      key: string;
      status: "pass" | "warn" | "fail";
      message: string;
    }>;
    recommendedNextAction?: string;
    checkedAt: string;
  }>>({});

  const loadServers = useCallback(async () => {
    const [response, templateResponse, discoveryResponse] = await Promise.all([
      fetchMcpServers(),
      fetchMcpTemplates(),
      fetchMcpTemplateDiscovery().catch(() => ({ items: [] })),
    ]);
    setServers(response.items);
    setTemplates(templateResponse.items);
    setTemplateDiscovery(discoveryResponse.items);
    setSelectedServerId((current) => {
      if (current && response.items.some((item) => item.serverId === current)) {
        return current;
      }
      return response.items[0]?.serverId ?? null;
    });
  }, []);

  const loadTools = useCallback(async (serverId: string) => {
    const response = await fetchMcpTools(serverId);
    setTools(response.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsInitialLoading(true);
    void loadServers()
      .then(() => {
        if (!cancelled) {
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(formatMcpError(err.message));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitialLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadServers]);

  useRefreshSubscription(
    "mcp",
    async () => {
      setIsRefreshing(true);
      try {
        await loadServers();
        if (selectedServerId) {
          await loadTools(selectedServerId);
        }
      } catch (err) {
        setError(formatMcpError((err as Error).message));
      } finally {
        setIsRefreshing(false);
      }
    },
    {
      enabled: !isInitialLoading,
      coalesceMs: 1000,
      staleMs: 20000,
      pollIntervalMs: 15000,
    },
  );

  useEffect(() => {
    if (!selectedServerId) {
      setTools([]);
      return;
    }
    void loadTools(selectedServerId).catch((err: Error) => {
      const message = formatMcpError(err.message);
      setError(message);
      if (err.message.includes("Unknown MCP server")) {
        const fallback = servers.find((item) => item.serverId !== selectedServerId)?.serverId ?? null;
        setSelectedServerId(fallback);
        if (!fallback) {
          setTools([]);
        }
      }
    });
  }, [loadTools, selectedServerId, servers]);

  const selected = useMemo(
    () => servers.find((item) => item.serverId === selectedServerId) ?? null,
    [selectedServerId, servers],
  );
  const selectedDiagnostic = selected ? diagnosticByServerId[selected.serverId] : undefined;

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

  const handleCreateFromTemplate = useCallback(async (templateId: string) => {
    const template = templates.find((item) => item.templateId === templateId);
    if (!template || template.installed) {
      return;
    }
    setBusy(true);
    try {
      await createMcpServer({
        label: template.label,
        transport: template.transport,
        command: template.command,
        args: template.args,
        url: template.url,
        authType: template.authType,
        enabled: template.enabledByDefault,
        category: template.category,
        trustTier: template.trustTier,
        costTier: template.costTier,
        policy: template.policy,
      });
      await loadServers();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [loadServers, templates]);

  if (isInitialLoading) {
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
        mostCommonAction={pageCopy.mcp.guide?.mostCommonAction}
        actions={pageCopy.mcp.guide?.actions ?? []}
        terms={pageCopy.mcp.guide?.terms}
      />
      <article className="card">
        <h3>MCP basics (for first-time users)</h3>
        <p className="office-subtitle">
          MCP servers are adapters that let GoatCitadel use outside tools safely. Start disabled, test one server, then expand.
        </p>
        <ol>
          <li>Choose a template in the library below and add it.</li>
          <li>Connect the server and confirm status is <strong>connected</strong>.</li>
          <li>Set trust/policy rules before first live invocation.</li>
          <li>Invoke one low-risk tool to validate behavior.</li>
        </ol>
        <p className="office-subtitle">
          If something fails, disconnect and review policy/tool patterns before trying again.
        </p>
      </article>
      {error ? <p className="error">{error}</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing MCP servers...</p> : null}

      <article className="card">
        <h3>Template Library (Disabled by Default)</h3>
        <p className="office-subtitle">
          Start from a known MCP server template, then connect and customize policy before first use.
        </p>
        <div className="stack-md">
          {templates.map((template) => (
            <div key={template.templateId} className="prompt-lab-run-summary">
              <p>
                <strong>{template.label}</strong> - {template.description}
              </p>
              <p className="office-subtitle">
                {template.transport} | trust: {template.trustTier} | auth: {template.authType}
                {" | "}
                default enabled: {template.enabledByDefault ? "yes" : "no"}
              </p>
              <ActionButton
                label={template.installed ? "Installed" : "Add Template"}
                pending={busy}
                disabled={busy || template.installed}
                onClick={() => void handleCreateFromTemplate(template.templateId)}
              />
            </div>
          ))}
          {templates.length === 0 ? <p className="office-subtitle">No templates available.</p> : null}
        </div>
      </article>

      <article className="card">
        <h3>Template Discovery Readiness</h3>
        <p className="office-subtitle">
          Before installing a template, check whether required auth, command, or URL settings are ready.
        </p>
        {templateDiscovery.length === 0 ? (
          <p className="office-subtitle">Discovery metadata is unavailable right now. You can still install templates manually.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Installed</th>
                <th>Readiness</th>
                <th>Dependency checks</th>
              </tr>
            </thead>
            <tbody>
              {templateDiscovery.map((item) => (
                <tr key={item.templateId}>
                  <td>{item.label}</td>
                  <td>{item.installed ? "yes" : "no"}</td>
                  <td>{item.readiness}</td>
                  <td>
                    {item.dependencyChecks.length === 0
                      ? "No checks reported"
                      : item.dependencyChecks.map((check) => `${check.key}:${check.status}`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <div className="split-grid">
        <article className="card">
          <h3>Register MCP Server</h3>
          <div className="controls-row">
            <label htmlFor="mcpLabel">Label <HelpHint label="Server label help" text="Human-readable name used in server list and logs." /></label>
            <input id="mcpLabel" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Docs MCP" />
          </div>
          <div className="controls-row">
            <label htmlFor="mcpTransport">Transport</label>
            <GCSelect
              id="mcpTransport"
              value={transport}
              onChange={(value) => setTransport(value as Transport)}
              options={[
                { value: "stdio", label: "stdio" },
                { value: "http", label: "http" },
                { value: "sse", label: "sse" },
              ]}
            />
            <label htmlFor="mcpAuth">Auth</label>
            <GCSelect
              id="mcpAuth"
              value={authType}
              onChange={(value) => setAuthType(value as "none" | "token" | "oauth2")}
              options={[
                { value: "none", label: "none" },
                { value: "token", label: "token" },
                { value: "oauth2", label: "oauth2" },
              ]}
            />
          </div>
          <div className="controls-row">
            <label htmlFor="mcpCategory">Category</label>
            <GCSelect
              id="mcpCategory"
              value={category}
              onChange={(value) => setCategory(value as McpCategory)}
              options={[
                { value: "development", label: "development" },
                { value: "browser", label: "browser" },
                { value: "automation", label: "automation" },
                { value: "research", label: "research" },
                { value: "data", label: "data" },
                { value: "creative", label: "creative" },
                { value: "orchestration", label: "orchestration" },
                { value: "other", label: "other" },
              ]}
            />
            <label htmlFor="mcpTrustTier">Trust</label>
            <GCSelect
              id="mcpTrustTier"
              value={trustTier}
              onChange={(value) => setTrustTier(value as McpTrustTier)}
              options={[
                { value: "trusted", label: "trusted" },
                { value: "restricted", label: "restricted" },
                { value: "quarantined", label: "quarantined" },
              ]}
            />
            <label htmlFor="mcpCostTier">Cost</label>
            <GCSelect
              id="mcpCostTier"
              value={costTier}
              onChange={(value) => setCostTier(value as McpCostTier)}
              options={[
                { value: "free", label: "free" },
                { value: "mixed", label: "mixed" },
                { value: "paid", label: "paid" },
                { value: "unknown", label: "unknown" },
              ]}
            />
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
          <div className="virtual-list-shell">
            <Virtuoso
              data={servers}
              itemContent={(_index, server) => (
                <div className="virtual-list-item chat-list-item" key={server.serverId}>
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
                </div>
              )}
            />
          </div>
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
                <ActionButton
                  label="Health Check"
                  pending={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const diagnostic = await runMcpServerHealthCheck(selected.serverId);
                      setDiagnosticByServerId((current) => ({
                        ...current,
                        [selected.serverId]: diagnostic,
                      }));
                      setError(null);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </div>
              <p className="office-subtitle">{describeMcpBlockReason(selected)}</p>
              {selectedDiagnostic ? (
                <details open>
                  <summary>
                    Latest health check: {selectedDiagnostic.status}
                    {" • "}
                    {new Date(selectedDiagnostic.checkedAt).toLocaleString()}
                  </summary>
                  <ul className="improvement-simple-list">
                    {selectedDiagnostic.checks.map((check) => (
                      <li key={`${check.key}:${check.message}`}>
                        <strong>{check.key}</strong> [{check.status}] - {check.message}
                      </li>
                    ))}
                  </ul>
                  {selectedDiagnostic.recommendedNextAction ? (
                    <p className="office-subtitle">
                      Next step: {selectedDiagnostic.recommendedNextAction}
                    </p>
                  ) : null}
                </details>
              ) : null}
              <div className="controls-row">
                <label className="checkbox-inline">
                  <GCSwitch
                    checked={policyRequireFirst}
                    onCheckedChange={setPolicyRequireFirst}
                    label="Require first-use approval"
                  />
                </label>
                <label htmlFor="mcpPolicyRedaction">Redaction mode</label>
                <GCSelect
                  id="mcpPolicyRedaction"
                  value={policyRedaction}
                  onChange={(value) => setPolicyRedaction(value as "off" | "basic" | "strict")}
                  options={[
                    { value: "off", label: "off" },
                    { value: "basic", label: "basic" },
                    { value: "strict", label: "strict" },
                  ]}
                />
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
        <div className="virtual-list-shell">
          <Virtuoso
            data={tools}
            itemContent={(_index, tool) => (
              <div className="virtual-list-item" key={`${tool.serverId}:${tool.toolName}`}>
                <strong>{tool.toolName}</strong>
                {tool.description ? <p className="chat-item-meta">{tool.description}</p> : null}
              </div>
            )}
          />
        </div>
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

function formatMcpError(message: string): string {
  if (message.includes("Unknown MCP server")) {
    return "That MCP server no longer exists. Select another server from the list or add one from the template library.";
  }
  if (message.startsWith("API error")) {
    return `MCP request failed: ${message}`;
  }
  return message;
}

function describeMcpBlockReason(server: {
  status: "disconnected" | "connecting" | "connected" | "error";
  enabled: boolean;
  trustTier: "trusted" | "restricted" | "quarantined";
  policy: {
    requireFirstToolApproval: boolean;
    blockedToolPatterns: string[];
    allowedToolPatterns: string[];
  };
}): string {
  if (!server.enabled) {
    return "Server is disabled. Enable it before any MCP tools can run.";
  }
  if (server.status !== "connected") {
    return "Server is not connected yet. Connect first, then invoke tools.";
  }
  if (server.trustTier === "quarantined") {
    return "Trust tier is quarantined, so all tool execution is blocked.";
  }
  if (server.policy.requireFirstToolApproval) {
    return "First tool execution requires explicit approval.";
  }
  if (server.policy.blockedToolPatterns.length > 0) {
    return "Some tool names are blocked by policy patterns.";
  }
  if (server.policy.allowedToolPatterns.length > 0) {
    return "Only tool names matching allow patterns can run.";
  }
  return "No active policy blocks detected.";
}
