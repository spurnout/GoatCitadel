import type { EventStreamConnectionState, EventStreamStatus } from "../api/client";

interface GlobalFreshnessPillProps {
  streamState: EventStreamConnectionState;
  streamStatus: EventStreamStatus;
}

function mapStateToLabel(state: EventStreamConnectionState): "Live" | "Degraded" | "Reconnecting" | "Offline" {
  if (state === "open") {
    return "Live";
  }
  if (state === "retrying" || state === "connecting") {
    return "Reconnecting";
  }
  if (state === "error") {
    return "Degraded";
  }
  return "Offline";
}

export function GlobalFreshnessPill({ streamState, streamStatus }: GlobalFreshnessPillProps) {
  const label = mapStateToLabel(streamState);
  const freshnessClass = label.toLowerCase();
  const lastUpdated = streamStatus.lastEventAt
    ? new Date(streamStatus.lastEventAt).toLocaleTimeString()
    : "n/a";

  return (
    <div className={`global-freshness-pill ${freshnessClass}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden />
      <span><strong>{label}</strong></span>
      <span className="global-freshness-sep">|</span>
      <span>Last update: {lastUpdated}</span>
      {streamStatus.reconnectAttempts > 0 ? (
        <>
          <span className="global-freshness-sep">|</span>
          <span>Reconnects: {streamStatus.reconnectAttempts}</span>
        </>
      ) : null}
    </div>
  );
}

