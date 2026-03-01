import { useEffect, useState } from "react";
import {
  fetchDaemonLogs,
  fetchDaemonStatus,
  fetchSystemVitals,
  restartDaemon,
  startDaemon,
  stopDaemon,
  type SystemVitalsResponse,
} from "../api/client";
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

export function SystemPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [vitals, setVitals] = useState<SystemVitalsResponse | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<Awaited<ReturnType<typeof fetchDaemonStatus>> | null>(null);
  const [daemonLogs, setDaemonLogs] = useState<Array<{ timestamp: string; level: "info" | "warn" | "error"; message: string }>>([]);
  const [daemonBusy, setDaemonBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDaemon = async () => {
    const [status, logs] = await Promise.all([
      fetchDaemonStatus(),
      fetchDaemonLogs(100),
    ]);
    setDaemonStatus(status);
    setDaemonLogs(logs.items);
  };

  useEffect(() => {
    void Promise.all([
      fetchSystemVitals(),
      fetchDaemonStatus(),
      fetchDaemonLogs(100),
    ])
      .then(([nextVitals, nextDaemonStatus, nextDaemonLogs]) => {
        setVitals(nextVitals);
        setDaemonStatus(nextDaemonStatus);
        setDaemonLogs(nextDaemonLogs.items);
      })
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!vitals) {
    return <p>Loading system vitals...</p>;
  }

  const onDaemonStart = async () => {
    setDaemonBusy(true);
    try {
      await startDaemon();
      await refreshDaemon();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDaemonBusy(false);
    }
  };

  const onDaemonStop = async () => {
    setDaemonBusy(true);
    try {
      await stopDaemon();
      await refreshDaemon();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDaemonBusy(false);
    }
  };

  const onDaemonRestart = async () => {
    setDaemonBusy(true);
    try {
      await restartDaemon();
      await refreshDaemon();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDaemonBusy(false);
    }
  };

  return (
    <section>
      <h2>{pageCopy.system.title}</h2>
      <p className="office-subtitle">{pageCopy.system.subtitle}</p>
      <PageGuideCard
        what={pageCopy.system.guide?.what ?? ""}
        when={pageCopy.system.guide?.when ?? ""}
        actions={pageCopy.system.guide?.actions ?? []}
      />
      <article className="card">
        <p>Hostname: {vitals.hostname}</p>
        <p>Platform: {vitals.platform} {vitals.release}</p>
        <p>Uptime: {Math.round(vitals.uptimeSeconds)}s</p>
        <p>CPU cores: {vitals.cpuCount}</p>
        <p>Load avg: {vitals.loadAverage.map((n) => n.toFixed(2)).join(", ")}</p>
        <p>Memory used: {formatBytes(vitals.memoryUsedBytes)} / {formatBytes(vitals.memoryTotalBytes)}</p>
        <p>Process RSS: {formatBytes(vitals.processRssBytes)}</p>
      </article>
      <article className="card">
        <h3>
          Service Manager
          <HelpHint label="Service manager help" text="Manage the local GoatCitadel daemon lifecycle and inspect recent service events." />
        </h3>
        <p className="office-subtitle">
          State: <strong>{daemonStatus?.state ?? "unknown"}</strong>
          {" · "}
          PID: <strong>{daemonStatus?.pid ?? 0}</strong>
          {" · "}
          Uptime: <strong>{Math.round(daemonStatus?.uptimeSeconds ?? 0)}s</strong>
        </p>
        <div className="actions">
          <button onClick={onDaemonStart} disabled={daemonBusy || daemonStatus?.running}>Start</button>
          <button onClick={onDaemonStop} disabled={daemonBusy || !daemonStatus?.running}>Stop</button>
          <button onClick={onDaemonRestart} disabled={daemonBusy}>Restart</button>
          <button onClick={() => void refreshDaemon()} disabled={daemonBusy}>Refresh</button>
        </div>
        {daemonLogs.length > 0 ? (
          <pre>
            {daemonLogs.map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`).join("\n")}
          </pre>
        ) : (
          <p className="office-subtitle">No daemon log events yet.</p>
        )}
      </article>
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
