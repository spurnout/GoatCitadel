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
import { ActionButton } from "../components/ActionButton";
import { FieldHelp } from "../components/FieldHelp";
import { HelpHint } from "../components/HelpHint";
import { PageGuideCard } from "../components/PageGuideCard";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { StatusChip } from "../components/StatusChip";
import { pageCopy } from "../content/copy";

export function SystemPage() {
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
  }, []);

  const daemonStateTone = daemonStatus?.running ? "success" : "warning";

  if (error) {
    return (
      <section className="workflow-page">
        <PageHeader
          eyebrow="Observability"
          title={pageCopy.system.title}
          subtitle={pageCopy.system.subtitle}
          hint="Inspect local runtime health, daemon lifecycle, and recent service events from one place."
        />
        <p className="error">{error}</p>
      </section>
    );
  }

  if (!vitals) {
    return (
      <section className="workflow-page">
        <PageHeader
          eyebrow="Observability"
          title={pageCopy.system.title}
          subtitle={pageCopy.system.subtitle}
          hint="Inspect local runtime health, daemon lifecycle, and recent service events from one place."
        />
        <p>Loading system vitals...</p>
      </section>
    );
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
    <section className="workflow-page">
      <PageHeader
        eyebrow="Observability"
        title={pageCopy.system.title}
        subtitle={pageCopy.system.subtitle}
        hint="Use this surface when you need to confirm local runtime health, restart the daemon, or inspect recent service events."
        actions={(
          <div className="workflow-summary-strip">
            <StatusChip tone="muted">{vitals.platform} {vitals.release}</StatusChip>
            <StatusChip tone={daemonStateTone}>{daemonStatus?.state ?? "unknown"}</StatusChip>
            <StatusChip tone={daemonStateTone}>{daemonStatus?.running ? "Daemon running" : "Daemon stopped"}</StatusChip>
          </div>
        )}
      />
      <PageGuideCard
        pageId="system"
        what={pageCopy.system.guide?.what ?? ""}
        when={pageCopy.system.guide?.when ?? ""}
        actions={pageCopy.system.guide?.actions ?? []}
      />
      <div className="workflow-status-stack">
        <FieldHelp>
          Use the service manager when you need to restart or inspect the local GoatCitadel daemon. Most operators should not need this surface during normal chat and workflow use.
        </FieldHelp>
      </div>
      <div className="metric-grid">
        <Panel title="Host Vitals" subtitle="Local machine and process health at a glance." className="stat-card">
          <p className="stat-card-value">{Math.round(vitals.uptimeSeconds)}s</p>
          <p className="stat-card-note">Uptime</p>
          <p className="stat-card-note">Hostname {vitals.hostname} · {vitals.cpuCount} cores</p>
        </Panel>
        <Panel title="Load Average" subtitle="Three-sample host load average." className="stat-card">
          <p className="stat-card-value system-stat-mono">{vitals.loadAverage.map((n) => n.toFixed(2)).join(" / ")}</p>
          <p className="stat-card-note">1m / 5m / 15m load</p>
        </Panel>
        <Panel title="Memory" subtitle="Host and process memory use." className="stat-card">
          <p className="stat-card-value">{formatBytes(vitals.memoryUsedBytes)}</p>
          <p className="stat-card-note">of {formatBytes(vitals.memoryTotalBytes)} host memory</p>
          <p className="stat-card-note">Process RSS {formatBytes(vitals.processRssBytes)}</p>
        </Panel>
      </div>
      <Panel
        title="Service Manager"
        subtitle={(
          <>
            Manage the local GoatCitadel daemon lifecycle and inspect recent service events.
            <HelpHint label="Service manager help" text="Use Start, Stop, Restart, and Refresh to control the local daemon process. Refresh only reloads status and recent logs." />
          </>
        )}
        actions={(
          <div className="workflow-summary-strip">
            <StatusChip tone={daemonStateTone}>{daemonStatus?.state ?? "unknown"}</StatusChip>
            <StatusChip tone="muted">PID {daemonStatus?.pid ?? 0}</StatusChip>
            <StatusChip tone="muted">{Math.round(daemonStatus?.uptimeSeconds ?? 0)}s uptime</StatusChip>
          </div>
        )}
      >
        <div className="row-actions">
          <ActionButton label="Start" onClick={onDaemonStart} disabled={daemonBusy || daemonStatus?.running} />
          <ActionButton label="Stop" onClick={onDaemonStop} disabled={daemonBusy || !daemonStatus?.running} />
          <ActionButton label="Restart" onClick={onDaemonRestart} disabled={daemonBusy} />
          <ActionButton label="Refresh" onClick={() => void refreshDaemon()} disabled={daemonBusy} />
        </div>
        {daemonLogs.length > 0 ? (
          <pre>
            {daemonLogs.map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`).join("\n")}
          </pre>
        ) : (
          <p className="office-subtitle">No daemon log events yet.</p>
        )}
      </Panel>
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

