import { useEffect, useMemo, useState } from "react";
import { fetchAgents } from "../api/client";
import {
  buildAgentDirectory,
  type AgentDirectoryRecord,
} from "../data/agent-roster";

export function AgentsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [agents, setAgents] = useState<AgentDirectoryRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "idle" | "ready">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAgents()
      .then((res) => setAgents(buildAgentDirectory(res.items)))
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return agents.filter((agent) => {
      if (statusFilter !== "all" && agent.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        agent.name.toLowerCase().includes(query) ||
        agent.title.toLowerCase().includes(query) ||
        agent.summary.toLowerCase().includes(query) ||
        agent.specialties.some((item) => item.toLowerCase().includes(query))
      );
    });
  }, [agents, search, statusFilter]);

  const readyCount = useMemo(() => agents.filter((agent) => agent.status === "ready").length, [agents]);
  const activeCount = useMemo(() => agents.filter((agent) => agent.status === "active").length, [agents]);
  const idleCount = useMemo(() => agents.filter((agent) => agent.status === "idle").length, [agents]);

  if (error) {
    return <p className="error">{error}</p>;
  }
  if (agents.length === 0) {
    return <p>Loading agents...</p>;
  }

  return (
    <section className="agents-v2">
      <h2>Agents</h2>
      <p className="office-subtitle">
        Ready-to-go specialist roster with live runtime overlays.
      </p>

      <div className="office-kpi-grid">
        <article className="office-kpi-card">
          <p className="office-kpi-label">Active</p>
          <p className="office-kpi-value">{activeCount}</p>
          <p className="office-kpi-note">Currently executing</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Idle</p>
          <p className="office-kpi-value">{idleCount}</p>
          <p className="office-kpi-note">Available with context</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Ready</p>
          <p className="office-kpi-value">{readyCount}</p>
          <p className="office-kpi-note">Role staged, no session yet</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Total</p>
          <p className="office-kpi-value">{agents.length}</p>
          <p className="office-kpi-note">Built-in + runtime</p>
        </article>
      </div>

      <div className="controls-row agents-controls">
        <input
          placeholder="Search role, specialty, summary..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "idle" | "ready")}
        >
          <option value="all">all statuses</option>
          <option value="active">active</option>
          <option value="idle">idle</option>
          <option value="ready">ready</option>
        </select>
      </div>

      <div className="agent-directory-grid">
        {filtered.map((agent) => (
          <article key={agent.roleId} className={`agent-directory-card status-${agent.status}`}>
            <header className="agent-directory-header">
              <div>
                <h3>{agent.name}</h3>
                <p>{agent.title}</p>
              </div>
              <span className={`office-pill office-pill-${agent.status === "ready" ? "idle" : agent.status}`}>
                {agent.status}
              </span>
            </header>

            <p>{agent.summary}</p>

            <dl className="office-meta-grid">
              <div>
                <dt>Sessions</dt>
                <dd>{agent.sessionCount}</dd>
              </div>
              <div>
                <dt>Active</dt>
                <dd>{agent.activeSessions}</dd>
              </div>
              <div>
                <dt>Runtime ID</dt>
                <dd>{agent.runtimeAgentId ?? "-"}</dd>
              </div>
              <div>
                <dt>Last update</dt>
                <dd>{agent.lastUpdatedAt ? new Date(agent.lastUpdatedAt).toLocaleString() : "-"}</dd>
              </div>
            </dl>

            <div className="token-row">
              {agent.specialties.map((specialty) => (
                <span key={specialty} className="token-chip">{specialty}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
