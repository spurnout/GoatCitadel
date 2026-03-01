import { useState } from "react";
import type { ChatTurnTraceRecord } from "@goatcitadel/contracts";

function formatTime(value?: string): string {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString();
}

export function ChatTraceCard({
  trace,
  defaultCollapsed = true,
}: {
  trace: ChatTurnTraceRecord;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <article className="chat-trace-card">
      <header className="chat-trace-head">
        <div>
          <p className="chat-trace-title">Run Trace</p>
          <p className="chat-trace-meta">
            {trace.status} · {trace.model ?? "model n/a"} · {formatTime(trace.startedAt)}
          </p>
        </div>
        <button type="button" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? "Show trace" : "Hide trace"}
        </button>
      </header>
      {collapsed ? null : (
        <div className="chat-trace-body">
          <div className="chat-trace-grid">
            <span>Mode: {trace.mode}</span>
            <span>Web: {trace.webMode}</span>
            <span>Memory: {trace.memoryMode}</span>
            <span>Thinking: {trace.thinkingLevel}</span>
            <span>Started: {formatTime(trace.startedAt)}</span>
            <span>Finished: {formatTime(trace.finishedAt)}</span>
          </div>
          {trace.toolRuns.length > 0 ? (
            <div className="chat-trace-section">
              <strong>Tool timeline</strong>
              <ul className="chat-trace-list">
                {trace.toolRuns.map((run) => (
                  <li key={run.toolRunId}>
                    <span>{run.toolName}</span>
                    <span>{run.status}</span>
                    <span>{formatTime(run.startedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {trace.citations.length > 0 ? (
            <div className="chat-trace-section">
              <strong>Citations</strong>
              <ul className="chat-citation-list">
                {trace.citations.map((citation) => (
                  <li key={citation.citationId}>
                    {citation.url ? (
                      <a href={citation.url} target="_blank" rel="noreferrer">
                        {citation.title || citation.url}
                      </a>
                    ) : (
                      <span>{citation.title ?? "source"}</span>
                    )}
                    {citation.snippet ? <p>{citation.snippet}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

