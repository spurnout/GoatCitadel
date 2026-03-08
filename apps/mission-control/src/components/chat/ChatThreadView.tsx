import type {
  ChatCapabilityUpgradeSuggestion,
  ChatThreadResponse,
  ChatThreadTurnRecord,
} from "@goatcitadel/contracts";
import { StatusChip } from "../StatusChip";

export interface ChatThreadNotice {
  id: string;
  tone: "neutral" | "warning" | "critical" | "success";
  content: string;
  timestamp: string;
}

function formatTone(tone: ChatThreadNotice["tone"]): "neutral" | "warning" | "critical" | "success" {
  return tone;
}

function formatActorTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

function summarizeRouting(turn: ChatThreadTurnRecord): string[] {
  const parts = [
    turn.trace.routing.effectiveProviderId,
    turn.trace.routing.effectiveModel,
    turn.trace.routing.fallbackUsed ? "fallback" : undefined,
  ].filter(Boolean);
  return parts as string[];
}

function renderSuggestionSummary(suggestions: ChatCapabilityUpgradeSuggestion[] | undefined): string | null {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }
  return suggestions.slice(0, 2).map((item) => item.title).join(" · ");
}

function ChatBranchSwitcher({
  turn,
  onSwitch,
}: {
  turn: ChatThreadTurnRecord;
  onSwitch: (turnId: string) => void;
}) {
  if (turn.branch.siblingCount <= 1) {
    return null;
  }
  const currentIndex = turn.branch.activeSiblingIndex;
  const previousTurnId = currentIndex > 0 ? turn.branch.siblingTurnIds[currentIndex - 1] : undefined;
  const nextTurnId = currentIndex < turn.branch.siblingTurnIds.length - 1
    ? turn.branch.siblingTurnIds[currentIndex + 1]
    : undefined;
  return (
    <div className="chat-v11-branch-switcher">
      <button type="button" disabled={!previousTurnId} onClick={() => previousTurnId && onSwitch(previousTurnId)}>
        Previous variant
      </button>
      <span>{currentIndex + 1} / {turn.branch.siblingCount}</span>
      <button type="button" disabled={!nextTurnId} onClick={() => nextTurnId && onSwitch(nextTurnId)}>
        Next variant
      </button>
    </div>
  );
}

function ChatTurnRunStrip({ turn }: { turn: ChatThreadTurnRecord }) {
  const routing = summarizeRouting(turn);
  return (
    <div className="chat-v11-turn-strip">
      <StatusChip tone={turn.trace.status === "completed" ? "success" : turn.trace.status === "failed" ? "critical" : "warning"}>
        {turn.trace.status}
      </StatusChip>
      <span>{turn.trace.mode}</span>
      <span>{turn.trace.webMode}</span>
      <span>{turn.trace.thinkingLevel}</span>
      {turn.trace.effectiveToolAutonomy ? <span>{turn.trace.effectiveToolAutonomy === "manual" ? "manual tools" : "safe auto tools"}</span> : null}
      <span>{turn.toolRuns.length} tool{turn.toolRuns.length === 1 ? "" : "s"}</span>
      <span>{turn.citations.length} citation{turn.citations.length === 1 ? "" : "s"}</span>
      {routing.map((item) => <span key={item}>{item}</span>)}
      {turn.trace.routing.fallbackUsed ? <span>fallback used</span> : null}
    </div>
  );
}

function ChatTurnDetails({
  turn,
  onSwitchBranch,
  onRetryTurn,
  onEditTurn,
}: {
  turn: ChatThreadTurnRecord;
  onSwitchBranch: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onEditTurn: (turnId: string) => void;
}) {
  const suggestionSummary = renderSuggestionSummary(turn.trace.capabilityUpgradeSuggestions);
  return (
    <details className="chat-v11-turn-details">
      <summary>Run details</summary>
      <ChatBranchSwitcher turn={turn} onSwitch={onSwitchBranch} />
      <div className="chat-v11-row-actions">
        {turn.assistantMessage ? <button type="button" onClick={() => onRetryTurn(turn.turnId)}>Retry answer</button> : null}
        <button type="button" onClick={() => onEditTurn(turn.turnId)}>Edit and resend</button>
      </div>
      {turn.toolRuns.length > 0 ? (
        <div className="chat-v11-turn-section">
          <h5>Tools</h5>
          <ul className="chat-v11-turn-list">
            {turn.toolRuns.map((run) => (
              <li key={run.toolRunId}>
                <strong>{run.toolName}</strong> · {run.status}
                {run.error ? <p>{run.error}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {turn.citations.length > 0 ? (
        <div className="chat-v11-turn-section">
          <h5>Citations</h5>
          <ul className="chat-v11-turn-list">
            {turn.citations.map((citation, index) => (
              <li key={`${citation.url}-${index}`}>
                <a href={citation.url} target="_blank" rel="noreferrer">{citation.title ?? citation.url}</a>
                {citation.snippet ? <p>{citation.snippet}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="chat-v11-turn-section">
        <h5>Routing</h5>
        <p>{summarizeRouting(turn).join(" · ") || "No routing metadata yet."}</p>
      </div>
      {suggestionSummary ? (
        <div className="chat-v11-turn-section">
          <h5>Capability suggestions</h5>
          <p>{suggestionSummary}</p>
        </div>
      ) : null}
    </details>
  );
}

function ChatTurnCard({
  turn,
  selected,
  onSelect,
  onSwitchBranch,
  onRetryTurn,
  onEditTurn,
}: {
  turn: ChatThreadTurnRecord;
  selected: boolean;
  onSelect: (turnId: string) => void;
  onSwitchBranch: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onEditTurn: (turnId: string) => void;
}) {
  return (
    <li className={`chat-v11-turn-card${selected ? " selected" : ""}`}>
      <button type="button" className="chat-v11-turn-surface" onClick={() => onSelect(turn.turnId)}>
        <div className="chat-v11-turn-bubble user">
          <p className="chat-v11-message-meta"><strong>You</strong> · {formatActorTimestamp(turn.userMessage.timestamp)}</p>
          <p>{turn.userMessage.content}</p>
        </div>
        <div className="chat-v11-turn-bubble assistant">
          <p className="chat-v11-message-meta"><strong>GoatCitadel</strong> · {turn.assistantMessage ? formatActorTimestamp(turn.assistantMessage.timestamp) : "Running"}</p>
          <p>{turn.assistantMessage?.content || (turn.trace.status === "running" ? "Working..." : "No assistant output yet.")}</p>
        </div>
      </button>
      <ChatTurnRunStrip turn={turn} />
      <ChatTurnDetails
        turn={turn}
        onSwitchBranch={onSwitchBranch}
        onRetryTurn={onRetryTurn}
        onEditTurn={onEditTurn}
      />
    </li>
  );
}

export function ChatThreadView({
  loading,
  thread,
  selectedTurnId,
  notices,
  onSelectTurn,
  onSwitchBranch,
  onRetryTurn,
  onEditTurn,
}: {
  loading: boolean;
  thread: ChatThreadResponse | null;
  selectedTurnId: string | null;
  notices: ChatThreadNotice[];
  onSelectTurn: (turnId: string) => void;
  onSwitchBranch: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onEditTurn: (turnId: string) => void;
}) {
  if (loading) {
    return <div className="chat-v11-thread-loading">Loading thread…</div>;
  }

  if (!thread || thread.turns.length === 0) {
    return (
      <div className="chat-v11-thread-empty">
        <p className="chat-v11-message-meta"><strong>GoatCitadel</strong></p>
        <p>Start with a plain request, or type <code>/help</code> to see commands.</p>
      </div>
    );
  }

  return (
    <div className="chat-v11-thread-view">
      <ul className="chat-v11-turn-listing">
        {thread.turns.map((turn) => (
          <ChatTurnCard
            key={turn.turnId}
            turn={turn}
            selected={selectedTurnId === turn.turnId}
            onSelect={onSelectTurn}
            onSwitchBranch={onSwitchBranch}
            onRetryTurn={onRetryTurn}
            onEditTurn={onEditTurn}
          />
        ))}
      </ul>
      {notices.length > 0 ? (
        <ul className="chat-v11-thread-notices">
          {notices.map((notice) => (
            <li key={notice.id} className={`tone-${formatTone(notice.tone)}`}>
              <p className="chat-v11-message-meta"><strong>Notice</strong> · {formatActorTimestamp(notice.timestamp)}</p>
              <p>{notice.content}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
