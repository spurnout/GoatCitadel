import { Virtuoso } from "react-virtuoso";
import { StatusChip } from "../StatusChip";

interface ChatSessionRailRow {
  key: string;
  type: "header" | "session" | "empty";
  title: string;
  tone?: "success" | "warning";
  count?: number;
  sessionId?: string;
  subtitle?: string;
}

export function ChatSessionRail({
  missionSessions,
  externalSessions,
  selectedSessionId,
  onSelectSession,
  renderSessionLabel,
}: {
  missionSessions: Array<{
    sessionId: string;
    projectName?: string | null;
  }>;
  externalSessions: Array<{
    sessionId: string;
    channel?: string | null;
    account?: string | null;
  }>;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  renderSessionLabel: (sessionId: string) => string;
}) {
  const rows: ChatSessionRailRow[] = [
    {
      key: "mission-header",
      type: "header",
      title: "Mission",
      tone: "success",
      count: missionSessions.length,
    },
    ...missionSessions.map((session) => ({
      key: `mission-${session.sessionId}`,
      type: "session" as const,
      title: renderSessionLabel(session.sessionId),
      sessionId: session.sessionId,
      subtitle: session.projectName ?? "No project yet",
    })),
    ...(missionSessions.length === 0
      ? [{
        key: "mission-empty",
        type: "empty" as const,
        title: "No mission chats match this filter yet.",
      }]
      : []),
    {
      key: "external-header",
      type: "header",
      title: "External",
      tone: "warning",
      count: externalSessions.length,
    },
    ...externalSessions.map((session) => ({
      key: `external-${session.sessionId}`,
      type: "session" as const,
      title: renderSessionLabel(session.sessionId),
      sessionId: session.sessionId,
      subtitle: [session.channel, session.account].filter(Boolean).join("/") || "External session",
    })),
    ...(externalSessions.length === 0
      ? [{
        key: "external-empty",
        type: "empty" as const,
        title: "No external chats are connected right now.",
      }]
      : []),
  ];

  return (
    <div className="chat-v11-session-rail">
      <Virtuoso
        className="chat-v11-session-virtuoso"
        data={rows}
        computeItemKey={(_index, row) => row.key}
        itemContent={(_index, row) => {
          if (row.type === "header") {
            return (
              <div className="chat-v11-rail-section">
                <div className="chat-v11-rail-title">
                  <h4>{row.title}</h4>
                  <StatusChip tone={row.tone ?? "muted"}>{row.count ?? 0}</StatusChip>
                </div>
              </div>
            );
          }

          if (row.type === "empty") {
            return <div className="chat-v11-empty-item">{row.title}</div>;
          }

          return (
            <div className="chat-v11-session-row">
              <button
                type="button"
                className={selectedSessionId === row.sessionId ? "active" : ""}
                onClick={() => row.sessionId && onSelectSession(row.sessionId)}
              >
                {row.title}
              </button>
              <p>{row.subtitle}</p>
            </div>
          );
        }}
      />
    </div>
  );
}
