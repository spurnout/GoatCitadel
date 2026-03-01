import { useEffect, useMemo, useState } from "react";
import type { ToolAccessEvaluateResponse, ToolCatalogEntry, ToolGrantRecord } from "@goatcitadel/contracts";
import {
  createToolGrant,
  evaluateToolAccess,
  fetchToolCatalog,
  fetchToolGrants,
  invokeTool,
  revokeToolGrant,
} from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { CardSkeleton } from "../components/CardSkeleton";

interface ToolsPageProps {
  refreshKey: number;
}

export function ToolsPage({ refreshKey }: ToolsPageProps) {
  const [catalog, setCatalog] = useState<ToolCatalogEntry[]>([]);
  const [grants, setGrants] = useState<ToolGrantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toolPattern, setToolPattern] = useState("fs.list");
  const [decision, setDecision] = useState<"allow" | "deny">("allow");
  const [scope, setScope] = useState<"global" | "session" | "agent" | "task">("session");
  const [scopeRef, setScopeRef] = useState("demo-session");
  const [grantType, setGrantType] = useState<"one_time" | "ttl" | "persistent">("ttl");
  const [expiresAt, setExpiresAt] = useState("");
  const [createdBy, setCreatedBy] = useState("operator");

  const [evaluateForm, setEvaluateForm] = useState({
    toolName: "fs.list",
    agentId: "operator",
    sessionId: "demo-session",
    taskId: "",
  });
  const [evaluateResult, setEvaluateResult] = useState<ToolAccessEvaluateResponse | null>(null);

  const [dryRunForm, setDryRunForm] = useState({
    toolName: "fs.list",
    argsJson: JSON.stringify({ path: "./workspace" }, null, 2),
    agentId: "operator",
    sessionId: "demo-session",
    taskId: "",
  });
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);

  const catalogByPack = useMemo(() => {
    return {
      core: catalog.filter((item) => item.pack === "core"),
      devops: catalog.filter((item) => item.pack === "devops"),
      knowledge: catalog.filter((item) => item.pack === "knowledge"),
      comms: catalog.filter((item) => item.pack === "comms"),
    };
  }, [catalog]);

  useEffect(() => {
    void load();
  }, [refreshKey]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [catalogRes, grantsRes] = await Promise.all([
        fetchToolCatalog(),
        fetchToolGrants({ limit: 500 }),
      ]);
      setCatalog(catalogRes.items);
      setGrants(grantsRes.items);
      if (catalogRes.items.length > 0) {
        const first = catalogRes.items[0]?.toolName;
        if (first) {
          setToolPattern((current) => current || first);
          setEvaluateForm((current) => ({ ...current, toolName: current.toolName || first }));
          setDryRunForm((current) => ({ ...current, toolName: current.toolName || first }));
        }
      }
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onCreateGrant() {
    try {
      setError(null);
      const normalizedScopeRef = scope === "global" ? undefined : scopeRef.trim();
      const input = {
        toolPattern: toolPattern.trim(),
        decision,
        scope,
        scopeRef: normalizedScopeRef || undefined,
        grantType,
        createdBy: createdBy.trim() || "operator",
        expiresAt: expiresAt.trim() || undefined,
      } as const;
      await createToolGrant(input);
      await load();
    } catch (createError) {
      setError((createError as Error).message);
    }
  }

  async function onRevoke(grantId: string) {
    try {
      setError(null);
      await revokeToolGrant(grantId);
      await load();
    } catch (revokeError) {
      setError((revokeError as Error).message);
    }
  }

  async function onEvaluate() {
    try {
      setError(null);
      const result = await evaluateToolAccess({
        toolName: evaluateForm.toolName.trim(),
        agentId: evaluateForm.agentId.trim(),
        sessionId: evaluateForm.sessionId.trim(),
        taskId: evaluateForm.taskId.trim() || undefined,
      });
      setEvaluateResult(result);
    } catch (evaluateError) {
      setError((evaluateError as Error).message);
    }
  }

  async function onDryRun() {
    try {
      setError(null);
      const args = JSON.parse(dryRunForm.argsJson) as Record<string, unknown>;
      const result = await invokeTool({
        toolName: dryRunForm.toolName.trim(),
        args,
        agentId: dryRunForm.agentId.trim(),
        sessionId: dryRunForm.sessionId.trim(),
        taskId: dryRunForm.taskId.trim() || undefined,
        dryRun: true,
        consentContext: {
          source: "ui",
          operatorId: "operator",
          reason: "tool access dry-run",
        },
      });
      setDryRunResult(result as unknown as Record<string, unknown>);
    } catch (dryRunError) {
      setError((dryRunError as Error).message);
    }
  }

  return (
    <div>
      <h2>Tool Access</h2>
      <p className="office-subtitle">Consent-first native tools across Dev Ops, Knowledge, and Comms.</p>

      <PageGuideCard
        what="Configure which tools can run, at what scope, and with what approval expectations."
        when="Use this before enabling high-impact automations like filesystem mutation, git writes, and outbound comms."
        actions={[
          "Review catalog risk levels before granting access.",
          "Create scoped grants (task/agent/session/global) with TTL where possible.",
          "Run access evaluate and dry-run invoke before letting agents execute.",
        ]}
        terms={[
          { term: "Grant", meaning: "Explicit allow/deny for a tool pattern at a scope." },
          { term: "Scope precedence", meaning: "task > agent > session > global." },
          { term: "Nuclear tools", meaning: "Always require per-action approval." },
        ]}
      />

      {error ? <p className="error">{error}</p> : null}
      {loading ? <CardSkeleton lines={8} /> : null}

      <div className="split-grid">
        <div className="card">
          <h3>Create Grant</h3>
          <div className="controls-row">
            <label>Tool pattern</label>
            <select value={toolPattern} onChange={(event) => setToolPattern(event.target.value)}>
              {catalog.map((entry) => (
                <option key={entry.toolName} value={entry.toolName}>
                  {entry.toolName} ({entry.riskLevel})
                </option>
              ))}
              <option value="*">*</option>
            </select>
          </div>
          <div className="controls-row">
            <label>Decision</label>
            <select value={decision} onChange={(event) => setDecision(event.target.value as "allow" | "deny")}>
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
          </div>
          <div className="controls-row">
            <label>Scope</label>
            <select value={scope} onChange={(event) => setScope(event.target.value as "global" | "session" | "agent" | "task") }>
              <option value="global">global</option>
              <option value="session">session</option>
              <option value="agent">agent</option>
              <option value="task">task</option>
            </select>
          </div>
          <div className="controls-row">
            <label>Scope ref</label>
            <input
              value={scopeRef}
              onChange={(event) => setScopeRef(event.target.value)}
              placeholder={scope === "global" ? "not required for global" : "session/agent/task id"}
              disabled={scope === "global"}
            />
          </div>
          <div className="controls-row">
            <label>Grant type</label>
            <select value={grantType} onChange={(event) => setGrantType(event.target.value as "one_time" | "ttl" | "persistent") }>
              <option value="one_time">one_time</option>
              <option value="ttl">ttl</option>
              <option value="persistent">persistent</option>
            </select>
          </div>
          <div className="controls-row">
            <label>Expires at (UTC)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value ? new Date(event.target.value).toISOString() : "")}
            />
          </div>
          <div className="controls-row">
            <label>Created by</label>
            <input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} />
          </div>
          <div className="actions">
            <button onClick={() => void onCreateGrant()}>Create Grant</button>
          </div>
        </div>

        <div className="card">
          <h3>Access Evaluate</h3>
          <div className="controls-row">
            <label>Tool name</label>
            <input
              value={evaluateForm.toolName}
              onChange={(event) => setEvaluateForm((current) => ({ ...current, toolName: event.target.value }))}
            />
          </div>
          <div className="controls-row">
            <label>Agent ID</label>
            <input
              value={evaluateForm.agentId}
              onChange={(event) => setEvaluateForm((current) => ({ ...current, agentId: event.target.value }))}
            />
          </div>
          <div className="controls-row">
            <label>Session ID</label>
            <input
              value={evaluateForm.sessionId}
              onChange={(event) => setEvaluateForm((current) => ({ ...current, sessionId: event.target.value }))}
            />
          </div>
          <div className="controls-row">
            <label>Task ID</label>
            <input
              value={evaluateForm.taskId}
              onChange={(event) => setEvaluateForm((current) => ({ ...current, taskId: event.target.value }))}
            />
          </div>
          <div className="actions">
            <button onClick={() => void onEvaluate()}>Evaluate Access</button>
          </div>
          {evaluateResult ? (
            <div className="replay-box">
              <pre>{JSON.stringify(evaluateResult, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      </div>

      <div className="split-grid">
        <div className="card">
          <h3>Dry Run Invoke</h3>
          <div className="controls-row">
            <label>Tool name</label>
            <input
              value={dryRunForm.toolName}
              onChange={(event) => setDryRunForm((current) => ({ ...current, toolName: event.target.value }))}
            />
          </div>
          <div className="controls-row">
            <label>Agent ID</label>
            <input
              value={dryRunForm.agentId}
              onChange={(event) => setDryRunForm((current) => ({ ...current, agentId: event.target.value }))}
            />
          </div>
          <div className="controls-row">
            <label>Session ID</label>
            <input
              value={dryRunForm.sessionId}
              onChange={(event) => setDryRunForm((current) => ({ ...current, sessionId: event.target.value }))}
            />
          </div>
          <div className="controls-row">
            <label>Task ID</label>
            <input
              value={dryRunForm.taskId}
              onChange={(event) => setDryRunForm((current) => ({ ...current, taskId: event.target.value }))}
            />
          </div>
          <label>Args JSON</label>
          <textarea
            className="full-textarea"
            rows={8}
            value={dryRunForm.argsJson}
            onChange={(event) => setDryRunForm((current) => ({ ...current, argsJson: event.target.value }))}
          />
          <div className="actions">
            <button onClick={() => void onDryRun()}>Run Dry-Run</button>
          </div>
          {dryRunResult ? (
            <div className="replay-box">
              <pre>{JSON.stringify(dryRunResult, null, 2)}</pre>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h3>Active Grants</h3>
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Decision</th>
                <th>Scope</th>
                <th>Type</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr key={grant.grantId}>
                  <td>{grant.toolPattern}</td>
                  <td>{grant.decision}</td>
                  <td>{grant.scope}:{grant.scopeRef}</td>
                  <td>{grant.grantType}</td>
                  <td>{grant.expiresAt ?? "-"}</td>
                  <td>
                    {grant.revokedAt ? (
                      <span>revoked</span>
                    ) : (
                      <button className="danger" onClick={() => void onRevoke(grant.grantId)}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Tool Catalog</h3>
        {(["core", "devops", "knowledge", "comms"] as const).map((pack) => (
          <div key={pack}>
            <h4>{pack.toUpperCase()}</h4>
            <table>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Category</th>
                  <th>Risk</th>
                  <th>Approval</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {catalogByPack[pack].map((entry) => (
                  <tr key={entry.toolName}>
                    <td>{entry.toolName}</td>
                    <td>{entry.category}</td>
                    <td>{entry.riskLevel}</td>
                    <td>{entry.requiresApproval ? "yes" : "no"}</td>
                    <td>{entry.description}</td>
                  </tr>
                ))}
                {catalogByPack[pack].length === 0 ? (
                  <tr>
                    <td colSpan={5}>No tools in this pack.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
