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
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { CardSkeleton } from "../components/CardSkeleton";
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

type Transport = "stdio" | "http" | "sse";

export function McpPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [servers, setServers] = useState<Array<{
    serverId: string;
    label: string;
    transport: Transport;
    status: "disconnected" | "connecting" | "connected" | "error";
    enabled: boolean;
    command?: string;
    url?: string;
    authType: "none" | "token" | "oauth2";
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
      });
      setLabel("");
      await loadServers();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [authType, command, label, loadServers, transport, url]);

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
                  {server.transport} | {server.status}
                </p>
              </li>
            ))}
          </ul>
          {selected ? (
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
