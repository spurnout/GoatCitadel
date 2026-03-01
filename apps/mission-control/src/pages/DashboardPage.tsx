import { useEffect, useState } from "react";
import {
  fetchCronJobs,
  fetchDashboardState,
  fetchMemoryFiles,
  fetchOperators,
  fetchSystemVitals,
  type CronJobsResponse,
  type DashboardStateResponse,
  type OperatorsResponse,
  type SystemVitalsResponse,
} from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { CardSkeleton } from "../components/CardSkeleton";

type DashboardTab = "approvals" | "tasks" | "sessions" | "settings" | "integrations" | "office";

export function DashboardPage({
  refreshKey = 0,
  onNavigate,
}: {
  refreshKey?: number;
  onNavigate?: (tab: DashboardTab) => void;
}) {
  const [state, setState] = useState<DashboardStateResponse | null>(null);
  const [vitals, setVitals] = useState<SystemVitalsResponse | null>(null);
  const [cron, setCron] = useState<CronJobsResponse | null>(null);
  const [operators, setOperators] = useState<OperatorsResponse | null>(null);
  const [memoryFiles, setMemoryFiles] = useState<Array<{ relativePath: string; size: number; modifiedAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchDashboardState(),
      fetchSystemVitals(),
      fetchCronJobs(),
      fetchOperators(),
      fetchMemoryFiles(),
    ])
      .then(([dashboard, vitalsRes, cronRes, operatorsRes, memoryRes]) => {
        setState(dashboard);
        setVitals(vitalsRes);
        setCron(cronRes);
        setOperators(operatorsRes);
        setMemoryFiles(memoryRes.items);
      })
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  if (error && (!state || !vitals || !cron || !operators)) {
    return (
      <section>
        <h2>Summit</h2>
        <p className="error">{error}</p>
      </section>
    );
  }

  if (!state || !vitals || !cron || !operators) {
    return (
      <section>
        <h2>Summit</h2>
        <div className="metric-grid">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={5} />
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2>Summit</h2>
      <p className="office-subtitle">GoatCitadel overview of herd activity, platform vitals, and workload pressure.</p>
      <PageGuideCard
        what="Summit is your high-level operations overview for health, workload, approvals, and cost pressure."
        when="Open this first to see whether the system is healthy before drilling into other tabs."
        actions={[
          "Check pending approvals and daily cost trend.",
          "Scan task status counts and bell tower jobs.",
          "Jump into the specific tab that needs action.",
        ]}
        terms={[
          { term: "Pending approvals", meaning: "Risky actions waiting for human confirmation." },
          { term: "Task status counts", meaning: "How many tasks are in each lifecycle state." },
        ]}
      />
      {error ? <p className="error">{error}</p> : null}

      <article className="card">
        <h3>Quick Actions</h3>
        <p className="office-subtitle">Jump to the most common operator workflows.</p>
        <div className="actions">
          <button type="button" onClick={() => onNavigate?.("approvals")}>Review Approvals</button>
          <button type="button" onClick={() => onNavigate?.("tasks")}>Open Trailboard</button>
          <button type="button" onClick={() => onNavigate?.("sessions")}>Inspect Runs</button>
          <button type="button" onClick={() => onNavigate?.("office")}>Open Herd HQ</button>
          <button type="button" onClick={() => onNavigate?.("settings")}>Tune Forge Settings</button>
          <button type="button" onClick={() => onNavigate?.("integrations")}>Configure Connections</button>
        </div>
      </article>

      <div className="metric-grid">
        <article className="card">
          <h3>Herd KPIs</h3>
          <p>Pending approvals: {state.pendingApprovals}</p>
          <p>Active sub-agents: {state.activeSubagents}</p>
          <p>Daily cost (USD): {state.dailyCostUsd.toFixed(4)}</p>
          <p>Sessions: {state.sessions.length}</p>
        </article>
        <article className="card">
          <h3>Citadel Vitals</h3>
          <p>{vitals.hostname}</p>
          <p>{vitals.platform} {vitals.release}</p>
          <p>CPU cores: {vitals.cpuCount}</p>
          <p>Memory used: {formatBytes(vitals.memoryUsedBytes)} / {formatBytes(vitals.memoryTotalBytes)}</p>
          <p>Process RSS: {formatBytes(vitals.processRssBytes)}</p>
        </article>
      </div>

      <div className="split-grid">
        <article className="card">
          <h3>Trailboard Status Counts</h3>
          <ul className="compact-list">
            {state.taskStatusCounts.map((row) => (
              <li key={row.status}>{row.status}: {row.count}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h3>Bell Tower Jobs</h3>
          <ul className="compact-list">
            {cron.items.map((job) => (
              <li key={job.jobId}>
                <strong>{job.name}</strong> ({job.schedule}) - {job.enabled ? "enabled" : "disabled"}
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="split-grid">
        <article className="card">
          <h3>Operators</h3>
          <ul className="compact-list">
            {operators.items.map((operator) => (
              <li key={operator.operatorId}>
                <strong>{operator.operatorId}</strong> - sessions {operator.sessionCount}, active {operator.activeSessions}
              </li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h3>Memory Files</h3>
          <ul className="compact-list">
            {memoryFiles.map((file) => (
              <li key={file.relativePath}>
                {file.relativePath} ({formatBytes(file.size)})
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}
