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

export function DashboardPage({ refreshKey = 0 }: { refreshKey?: number }) {
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

  if (!state || !vitals || !cron || !operators) {
    return <p>Loading dashboard...</p>;
  }

  return (
    <section>
      <h2>Dashboard</h2>
      {error ? <p className="error">{error}</p> : null}

      <div className="metric-grid">
        <article className="card">
          <h3>KPIs</h3>
          <p>Pending approvals: {state.pendingApprovals}</p>
          <p>Active sub-agents: {state.activeSubagents}</p>
          <p>Daily cost (USD): {state.dailyCostUsd.toFixed(4)}</p>
          <p>Sessions: {state.sessions.length}</p>
        </article>
        <article className="card">
          <h3>System Vitals</h3>
          <p>{vitals.hostname}</p>
          <p>{vitals.platform} {vitals.release}</p>
          <p>CPU cores: {vitals.cpuCount}</p>
          <p>Memory used: {formatBytes(vitals.memoryUsedBytes)} / {formatBytes(vitals.memoryTotalBytes)}</p>
          <p>Process RSS: {formatBytes(vitals.processRssBytes)}</p>
        </article>
      </div>

      <div className="split-grid">
        <article className="card">
          <h3>Task Status Counts</h3>
          <ul className="compact-list">
            {state.taskStatusCounts.map((row) => (
              <li key={row.status}>{row.status}: {row.count}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h3>Cron Jobs</h3>
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
