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
import { HelpHint } from "../components/HelpHint";
import { pageCopy } from "../content/copy";

interface ToolsPageProps {
  refreshKey: number;
}

type GrantScope = "global" | "session" | "agent" | "task";
type GrantType = "one_time" | "ttl" | "persistent";
type GrantDecision = "allow" | "deny";
type QuickPreset = "web" | "files-read" | "devops";

const QUICK_PRESET_TOOLS: Record<QuickPreset, string[]> = {
  web: ["browser.search", "browser.navigate", "browser.extract", "http.get"],
  "files-read": ["fs.list", "fs.read", "fs.stat"],
  devops: ["git.status", "git.diff", "tests.run", "lint.run", "build.run"],
};

const TOOL_ARG_EXAMPLES: Record<string, Record<string, unknown>> = {
  "fs.list": { path: "./workspace" },
  "fs.read": { path: "./workspace/README.md" },
  "fs.stat": { path: "./workspace" },
  "browser.search": { query: "weather 91303 today", maxResults: 5 },
  "browser.navigate": { url: "https://weather.gov" },
  "browser.extract": { url: "https://weather.gov", selector: "body", maxChars: 3000 },
  "http.get": { url: "https://api.github.com/repos/openai/openai-node" },
  "git.status": {},
  "git.diff": { staged: false },
  "tests.run": { manager: "pnpm", filter: "@goatcitadel/gateway" },
};

export function ToolsPage({ refreshKey }: ToolsPageProps) {
  const [catalog, setCatalog] = useState<ToolCatalogEntry[]>([]);
  const [grants, setGrants] = useState<ToolGrantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [grantFilter, setGrantFilter] = useState("");
  const [catalogFilter, setCatalogFilter] = useState("");

  const [toolPattern, setToolPattern] = useState("fs.list");
  const [decision, setDecision] = useState<GrantDecision>("allow");
  const [scope, setScope] = useState<GrantScope>("session");
  const [scopeRef, setScopeRef] = useState("demo-session");
  const [grantType, setGrantType] = useState<GrantType>("ttl");
  const [expiresAt, setExpiresAt] = useState("");
  const [createdBy, setCreatedBy] = useState("operator");
  const [workingPreset, setWorkingPreset] = useState<QuickPreset | null>(null);
  const [creatingGrant, setCreatingGrant] = useState(false);
  const [grantWizardStep, setGrantWizardStep] = useState<1 | 2 | 3>(1);
  const [grantAdvanced, setGrantAdvanced] = useState(false);

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
    const q = catalogFilter.trim().toLowerCase();
    const source = q.length > 0
      ? catalog.filter((item) => (
        `${item.toolName} ${item.category} ${item.description}`.toLowerCase().includes(q)
      ))
      : catalog;
    return {
      core: source.filter((item) => item.pack === "core"),
      devops: source.filter((item) => item.pack === "devops"),
      knowledge: source.filter((item) => item.pack === "knowledge"),
      comms: source.filter((item) => item.pack === "comms"),
    };
  }, [catalog, catalogFilter]);

  const visibleGrants = useMemo(() => {
    const q = grantFilter.trim().toLowerCase();
    if (!q) {
      return grants;
    }
    return grants.filter((grant) => (
      `${grant.toolPattern} ${grant.decision} ${grant.scope}:${grant.scopeRef} ${grant.grantType} ${grant.createdBy}`
        .toLowerCase()
        .includes(q)
    ));
  }, [grantFilter, grants]);

  const selectedTool = useMemo(() => catalog.find((entry) => entry.toolName === toolPattern), [catalog, toolPattern]);
  const selectedDryRunTool = useMemo(
    () => catalog.find((entry) => entry.toolName === dryRunForm.toolName),
    [catalog, dryRunForm.toolName],
  );
  const scopeRefHint = scope === "global"
    ? "Global grants apply everywhere. Scope ref is not needed."
    : scope === "session"
      ? "Session ID example: sess_abc123... (scoped to one conversation)."
      : scope === "agent"
        ? "Agent ID example: assistant or researcher."
        : "Task ID example: task_abc123... (most specific scope).";
  const recommendedScope: GrantScope = "session";
  const isRecommendedScope = scope === recommendedScope;
  const grantSummary = `${decision.toUpperCase()} ${toolPattern}${scope === "global" ? " globally" : ` for ${scope} ${scopeRef || "(missing scope ref)"}`}`;
  const canProceedStep1 = scope === "global" || scopeRef.trim().length > 0;
  const canProceedStep2 = toolPattern.trim().length > 0;
  const requiresTtlExpiration = grantType === "ttl";
  const canCreateGrant = canProceedStep1 && canProceedStep2 && (!requiresTtlExpiration || expiresAt.trim().length > 0);

  useEffect(() => {
    if (grantAdvanced) {
      return;
    }
    setDecision("allow");
    if (grantType === "ttl") {
      setGrantType("persistent");
      setExpiresAt("");
    }
  }, [grantAdvanced, grantType]);

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
      setSuccess(null);
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
    const normalizedScopeRef = scope === "global" ? undefined : scopeRef.trim();
    if (scope !== "global" && !normalizedScopeRef) {
      setError("Scope ref is required for session, agent, and task grants.");
      return;
    }
    if (!toolPattern.trim()) {
      setError("Select a tool first.");
      return;
    }
    setCreatingGrant(true);
    try {
      setError(null);
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
      setSuccess(`Grant created: ${input.decision} ${input.toolPattern}`);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setCreatingGrant(false);
    }
  }

  async function onApplyQuickPreset(preset: QuickPreset) {
    const normalizedScopeRef = scope === "global" ? undefined : scopeRef.trim();
    if (scope !== "global" && !normalizedScopeRef) {
      setError("Enter a scope ref before applying a quick preset.");
      return;
    }
    setWorkingPreset(preset);
    setError(null);
    setSuccess(null);
    try {
      const tools = QUICK_PRESET_TOOLS[preset];
      for (const tool of tools) {
        await createToolGrant({
          toolPattern: tool,
          decision: "allow",
          scope,
          scopeRef: normalizedScopeRef || undefined,
          grantType: "persistent",
          createdBy: createdBy.trim() || "operator",
        });
      }
      await load();
      setSuccess(`Applied preset "${preset}" (${tools.length} grants).`);
    } catch (presetError) {
      setError((presetError as Error).message);
    } finally {
      setWorkingPreset(null);
    }
  }

  async function onRevoke(grantId: string) {
    try {
      setError(null);
      await revokeToolGrant(grantId);
      await load();
      setSuccess(`Grant revoked: ${grantId}`);
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
      setSuccess("Access check complete.");
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
      setSuccess("Dry-run completed.");
    } catch (dryRunError) {
      setError((dryRunError as Error).message);
    }
  }

  function onUseDryRunExample() {
    const example = TOOL_ARG_EXAMPLES[dryRunForm.toolName] ?? {};
    setDryRunForm((current) => ({
      ...current,
      argsJson: JSON.stringify(example, null, 2),
    }));
  }

  function onWizardNext() {
    if (grantWizardStep === 1 && !canProceedStep1) {
      setError("Enter scope ref before continuing.");
      return;
    }
    if (grantWizardStep === 2 && !canProceedStep2) {
      setError("Pick a tool before continuing.");
      return;
    }
    setError(null);
    setGrantWizardStep((current) => (current < 3 ? ((current + 1) as 1 | 2 | 3) : current));
  }

  function onWizardBack() {
    setGrantWizardStep((current) => (current > 1 ? ((current - 1) as 1 | 2 | 3) : current));
  }

  function onWizardJump(step: 1 | 2 | 3) {
    if (step > 1 && !canProceedStep1) {
      setError("Complete step 1 first.");
      return;
    }
    if (step > 2 && !canProceedStep2) {
      setError("Complete step 2 first.");
      return;
    }
    setError(null);
    setGrantWizardStep(step);
  }

  function onApplyRecommendedScope() {
    setScope("session");
    if (!scopeRef.trim()) {
      setScopeRef("demo-session");
    }
  }

  return (
    <div>
      <h2>{pageCopy.tools.title}</h2>
      <p className="office-subtitle">{pageCopy.tools.subtitle}</p>

      <PageGuideCard
        what={pageCopy.tools.guide?.what ?? ""}
        when={pageCopy.tools.guide?.when ?? ""}
        actions={pageCopy.tools.guide?.actions ?? []}
        terms={pageCopy.tools.guide?.terms}
      />

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="status-banner">{success}</p> : null}
      {loading ? <CardSkeleton lines={8} /> : null}

      <div className="split-grid">
        <div className="card">
          <h3>Create Grant</h3>
          <p className="office-subtitle">Use the wizard for common cases, then tick advanced settings if you need full control.</p>

          <div className="tools-wizard-steps">
            <button type="button" className={grantWizardStep === 1 ? "active" : ""} onClick={() => onWizardJump(1)}>1. Who</button>
            <button type="button" className={grantWizardStep === 2 ? "active" : ""} onClick={() => onWizardJump(2)}>2. What</button>
            <button type="button" className={grantWizardStep === 3 ? "active" : ""} onClick={() => onWizardJump(3)}>3. How Long</button>
          </div>

          <label className="tools-advanced-toggle">
            <input
              type="checkbox"
              checked={grantAdvanced}
              onChange={(event) => setGrantAdvanced(event.target.checked)}
            />
            Advanced settings
          </label>

          {grantWizardStep === 1 ? (
            <div className="advanced-block">
              <div className="controls-row">
                <label>
                  Scope
                  <HelpHint label="Scope help" text="More specific scopes win. Order is task > agent > session > global." />
                </label>
                <select value={scope} onChange={(event) => setScope(event.target.value as GrantScope)}>
                  <option value="global">Global</option>
                  <option value="session">Session</option>
                  <option value="agent">Agent</option>
                  <option value="task">Task</option>
                </select>
              </div>
              <div className={`tools-recommend ${isRecommendedScope ? "ok" : "warn"}`}>
                <p>
                  Recommended for most new grants: <strong>Session</strong> scope.
                  It limits access to one conversation while you test safely.
                </p>
                {!isRecommendedScope ? (
                  <button type="button" onClick={onApplyRecommendedScope}>Use recommended scope</button>
                ) : (
                  <span className="token-chip">Using recommended scope</span>
                )}
              </div>
              <div className="controls-row">
                <label>
                  Scope ref
                  <HelpHint label="Scope reference help" text="For session/agent/task scope, enter the ID this grant should target." />
                </label>
                <input
                  value={scopeRef}
                  onChange={(event) => setScopeRef(event.target.value)}
                  placeholder={scope === "global" ? "Not required for global" : "session/agent/task id"}
                  disabled={scope === "global"}
                />
              </div>
              <p className="tools-helper">{scopeRefHint}</p>
            </div>
          ) : null}

          {grantWizardStep === 2 ? (
            <div className="advanced-block">
              <div className="actions">
                <button disabled={workingPreset !== null} onClick={() => void onApplyQuickPreset("web")}>
                  {workingPreset === "web" ? "Applying..." : "Quick: Web Assistant"}
                </button>
                <button disabled={workingPreset !== null} onClick={() => void onApplyQuickPreset("files-read")}>
                  {workingPreset === "files-read" ? "Applying..." : "Quick: File Read"}
                </button>
                <button disabled={workingPreset !== null} onClick={() => void onApplyQuickPreset("devops")}>
                  {workingPreset === "devops" ? "Applying..." : "Quick: DevOps Read"}
                </button>
              </div>
              <div className="controls-row">
                <label>
                  Tool
                  <HelpHint label="Tool help" text="Pick the exact tool to allow or deny. Use * only for advanced wildcard rules." />
                </label>
                <select value={toolPattern} onChange={(event) => setToolPattern(event.target.value)}>
                  {catalog.map((entry) => (
                    <option key={entry.toolName} value={entry.toolName}>
                      {entry.toolName} ({entry.riskLevel})
                    </option>
                  ))}
                  {grantAdvanced ? <option value="*">*</option> : null}
                </select>
              </div>
              {selectedTool ? (
                <p className="tools-helper">
                  Risk: <strong>{selectedTool.riskLevel}</strong> | Category: {selectedTool.category} | {selectedTool.description}
                </p>
              ) : null}
              {grantAdvanced ? (
                <div className="controls-row">
                  <label>
                    Decision
                    <HelpHint label="Decision help" text="Allow lets the tool run in this scope. Deny blocks it, even if broader scopes allow it." />
                  </label>
                  <select value={decision} onChange={(event) => setDecision(event.target.value as GrantDecision)}>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </div>
              ) : (
                <p className="tools-helper">Decision: <strong>Allow</strong> (basic mode)</p>
              )}
            </div>
          ) : null}

          {grantWizardStep === 3 ? (
            <div className="advanced-block">
              <div className="controls-row">
                <label>
                  Duration
                  <HelpHint label="Grant type help" text="One-time expires after one use. Persistent remains until revoked. TTL is available in advanced settings." />
                </label>
                <select
                  value={grantType}
                  onChange={(event) => setGrantType(event.target.value as GrantType)}
                >
                  <option value="one_time">One-time</option>
                  <option value="persistent">Persistent</option>
                  {grantAdvanced ? <option value="ttl">Expires at time (TTL)</option> : null}
                </select>
              </div>
              {grantType === "ttl" ? (
                <div className="controls-row">
                  <label>
                    Expires at (UTC)
                    <HelpHint label="Expiration help" text="Required for TTL grants. Pick a time after now." />
                  </label>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(expiresAt)}
                    onChange={(event) => setExpiresAt(event.target.value ? new Date(event.target.value).toISOString() : "")}
                  />
                </div>
              ) : null}
              {grantAdvanced ? (
                <div className="controls-row">
                  <label>
                    Created by
                    <HelpHint label="Created by help" text="Audit label for who made the grant. Use your operator name." />
                  </label>
                  <input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} />
                </div>
              ) : null}
              <p className="tools-summary">Summary: {grantSummary}</p>
            </div>
          ) : null}

          <div className="actions tools-wizard-actions">
            <button type="button" onClick={onWizardBack} disabled={grantWizardStep === 1}>Back</button>
            {grantWizardStep < 3 ? (
              <button type="button" onClick={onWizardNext}>Next</button>
            ) : (
              <button disabled={creatingGrant || !canCreateGrant} onClick={() => void onCreateGrant()}>
                {creatingGrant ? "Creating..." : "Create Grant"}
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Check Access</h3>
          <p className="office-subtitle">Quickly test whether a tool call would be allowed before you run anything.</p>
          <div className="controls-row">
            <label>
              Tool
              <HelpHint label="Evaluate tool help" text="Choose the tool you want to test against current policy and grants." />
            </label>
            <select
              value={evaluateForm.toolName}
              onChange={(event) => setEvaluateForm((current) => ({ ...current, toolName: event.target.value }))}
            >
              {catalog.map((entry) => (
                <option key={entry.toolName} value={entry.toolName}>{entry.toolName}</option>
              ))}
            </select>
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
          <details className="advanced-panel">
            <summary>Advanced fields</summary>
            <div className="controls-row">
              <label>Task ID</label>
              <input
                value={evaluateForm.taskId}
                onChange={(event) => setEvaluateForm((current) => ({ ...current, taskId: event.target.value }))}
              />
            </div>
          </details>
          <div className="actions">
            <button onClick={() => void onEvaluate()}>Check Access</button>
          </div>
          {evaluateResult ? (
            <div className="replay-box">
              <p className="tools-summary">
                Result: <strong>{evaluateResult.allowed ? "Allowed" : "Blocked"}</strong>
                {" | "}
                Risk: <strong>{evaluateResult.riskLevel}</strong>
                {" | "}
                Approval required: <strong>{evaluateResult.requiresApproval ? "Yes" : "No"}</strong>
              </p>
              <details>
                <summary>Raw response</summary>
                <pre>{JSON.stringify(evaluateResult, null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </div>
      </div>

      <div className="split-grid">
        <div className="card">
          <h3>Dry-Run Tool</h3>
          <p className="office-subtitle">Simulate a tool call with sample args and inspect the response safely.</p>
          <div className="controls-row">
            <label>
              Tool
              <HelpHint label="Dry-run tool help" text="Dry-run calls the tool with validation/safety checks so you can confirm behavior before live use." />
            </label>
            <select
              value={dryRunForm.toolName}
              onChange={(event) => setDryRunForm((current) => ({ ...current, toolName: event.target.value }))}
            >
              {catalog.map((entry) => (
                <option key={entry.toolName} value={entry.toolName}>{entry.toolName}</option>
              ))}
            </select>
          </div>
          {selectedDryRunTool ? <p className="tools-helper">{selectedDryRunTool.description}</p> : null}
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
          <details className="advanced-panel">
            <summary>Advanced fields</summary>
            <div className="controls-row">
              <label>Task ID</label>
              <input
                value={dryRunForm.taskId}
                onChange={(event) => setDryRunForm((current) => ({ ...current, taskId: event.target.value }))}
              />
            </div>
          </details>
          <div className="actions">
            <button type="button" onClick={onUseDryRunExample}>Load Example Args</button>
          </div>
          <label>
            Args JSON
            <HelpHint label="Args help" text="Use valid JSON object syntax. Example args are available with the button above." />
          </label>
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
          <div className="controls-row">
            <label>Filter</label>
            <input value={grantFilter} onChange={(event) => setGrantFilter(event.target.value)} placeholder="Search tool, scope, decision, created by..." />
          </div>
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
              {visibleGrants.map((grant) => (
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
              {visibleGrants.length === 0 ? (
                <tr>
                  <td colSpan={6}>No grants match your filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Tool Catalog</h3>
        <div className="controls-row">
          <label>Filter</label>
          <input value={catalogFilter} onChange={(event) => setCatalogFilter(event.target.value)} placeholder="Search by tool name, category, or description..." />
        </div>
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

function toDatetimeLocalValue(isoUtc?: string): string {
  if (!isoUtc) {
    return "";
  }
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}
