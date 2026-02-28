import { useEffect, useMemo, useState } from "react";
import { fetchSessions, type SessionsResponse } from "../api/client";
import { SelectOrCustom } from "../components/SelectOrCustom";
import { PageGuideCard } from "../components/PageGuideCard";

export function SessionsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<"all" | "healthy" | "degraded" | "blocked">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSessions()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((session) => {
      if (healthFilter !== "all" && session.health !== healthFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return session.sessionKey.toLowerCase().includes(query) || session.sessionId.toLowerCase().includes(query);
    });
  }, [healthFilter, items, search]);

  const totalTokens = filtered.reduce((sum, session) => sum + session.tokenTotal, 0);
  const totalCost = filtered.reduce((sum, session) => sum + session.costUsdTotal, 0);

  const searchOptions = useMemo(() => {
    const values = new Set<string>([
      ...items.slice(0, 40).map((session) => session.sessionKey),
      ...items.slice(0, 40).map((session) => session.sessionId),
      "dm:",
      "group:",
      "thread:",
    ]);
    return [...values].filter(Boolean).map((value) => ({ value, label: value }));
  }, [items]);

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!data) {
    return <p>Loading herd runs...</p>;
  }

  return (
    <section>
      <h2>Runs</h2>
      <p className="office-subtitle">Live session health, token usage, and feed-cost visibility.</p>
      <PageGuideCard
        what="Summarizes session health and usage across current runs."
        when="Use this to monitor operational health, not detailed chat history."
        actions={[
          "Filter by health to find blocked or degraded sessions.",
          "Use token/cost totals to identify expensive runs.",
          "Use session keys to map channels and routes.",
        ]}
        terms={[
          { term: "Session", meaning: "A routed conversation context keyed by channel/account/peer or room/thread." },
          { term: "Health", meaning: "High-level status for whether a session is operating normally." },
        ]}
      />

      <div className="office-kpi-grid">
        <article className="office-kpi-card">
          <p className="office-kpi-label">Visible sessions</p>
          <p className="office-kpi-value">{filtered.length}</p>
          <p className="office-kpi-note">After current filters</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Total tokens</p>
          <p className="office-kpi-value">{totalTokens}</p>
          <p className="office-kpi-note">For visible sessions</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Total cost</p>
          <p className="office-kpi-value">${totalCost.toFixed(4)}</p>
          <p className="office-kpi-note">USD aggregate</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Blocked sessions</p>
          <p className="office-kpi-value">{filtered.filter((session) => session.health === "blocked").length}</p>
          <p className="office-kpi-note">Needs intervention</p>
        </article>
      </div>

      <div className="controls-row">
        <SelectOrCustom
          value={search}
          onChange={setSearch}
          options={searchOptions}
          customPlaceholder="Search session key or id"
          customLabel="Search query"
        />
        <select
          value={healthFilter}
          onChange={(event) => setHealthFilter(event.target.value as "all" | "healthy" | "degraded" | "blocked")}
        >
          <option value="all">all health states</option>
          <option value="healthy">healthy</option>
          <option value="degraded">degraded</option>
          <option value="blocked">blocked</option>
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Session Key</th>
            <th>Health</th>
            <th>Updated</th>
            <th>Tokens</th>
            <th>Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((session) => (
            <tr key={session.sessionId}>
              <td>{session.sessionKey}</td>
              <td><span className={`token-chip`}>{session.health}</span></td>
              <td>{new Date(session.updatedAt).toLocaleString()}</td>
              <td>{session.tokenTotal}</td>
              <td>{session.costUsdTotal.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
