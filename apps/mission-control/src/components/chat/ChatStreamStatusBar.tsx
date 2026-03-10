export type ChatStreamStatus = "idle" | "connecting" | "streaming" | "queued" | "error";

interface ChatStreamStatusBarProps {
  status: ChatStreamStatus;
  queuedCount: number;
  error: string | null;
}

function statusLabel(status: ChatStreamStatus, queuedCount: number): string {
  switch (status) {
    case "idle":
      return "Ready";
    case "connecting":
      return "Connecting...";
    case "streaming":
      return queuedCount > 0 ? `Streaming (${queuedCount} queued)` : "Streaming...";
    case "queued":
      return `${queuedCount} message${queuedCount === 1 ? "" : "s"} queued`;
    case "error":
      return "Error";
  }
}

function statusTone(status: ChatStreamStatus): string {
  switch (status) {
    case "idle":
      return "idle";
    case "connecting":
    case "queued":
      return "pending";
    case "streaming":
      return "active";
    case "error":
      return "error";
  }
}

export function ChatStreamStatusBar({ status, queuedCount, error }: ChatStreamStatusBarProps) {
  if (status === "idle" && queuedCount === 0 && !error) {
    return null;
  }

  const tone = statusTone(status);
  const label = statusLabel(status, queuedCount);

  return (
    <div className={`chat-stream-status-bar tone-${tone}`} role="status" aria-live="polite">
      <span className="chat-stream-status-indicator" />
      <span className="chat-stream-status-label">{label}</span>
      {error && status === "error" ? (
        <span className="chat-stream-status-error">{error}</span>
      ) : null}
    </div>
  );
}
