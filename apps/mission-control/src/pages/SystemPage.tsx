import { useEffect, useState } from "react";
import { fetchSystemVitals, type SystemVitalsResponse } from "../api/client";

export function SystemPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [vitals, setVitals] = useState<SystemVitalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSystemVitals()
      .then(setVitals)
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!vitals) {
    return <p>Loading citadel vitals...</p>;
  }

  return (
    <section>
      <h2>Engine</h2>
      <p className="office-subtitle">Runtime health for the local GoatCitadel node.</p>
      <article className="card">
        <p>Hostname: {vitals.hostname}</p>
        <p>Platform: {vitals.platform} {vitals.release}</p>
        <p>Uptime: {Math.round(vitals.uptimeSeconds)}s</p>
        <p>CPU cores: {vitals.cpuCount}</p>
        <p>Load avg: {vitals.loadAverage.map((n) => n.toFixed(2)).join(", ")}</p>
        <p>Memory used: {formatBytes(vitals.memoryUsedBytes)} / {formatBytes(vitals.memoryTotalBytes)}</p>
        <p>Process RSS: {formatBytes(vitals.processRssBytes)}</p>
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
