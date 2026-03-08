import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Virtuoso } from "react-virtuoso";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

const VIRTUALIZED_THREAD_THRESHOLD = 48;

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

function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-v11-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, onClick, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.stopPropagation();
                onClick?.(event);
              }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
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
      {turn.trace.orchestration ? <span>{turn.trace.orchestration.workflowTemplate}</span> : null}
      {turn.trace.orchestration ? <span>{turn.trace.orchestration.steps.length} roles</span> : null}
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
      {turn.trace.orchestration ? (
        <div className="chat-v11-turn-section">
          <h5>Orchestration</h5>
          <p>
            {turn.trace.orchestration.workflowTemplate}
            {" · "}
            {turn.trace.orchestration.visibility}
            {" · "}
            {turn.trace.orchestration.status}
          </p>
          <p>{turn.trace.orchestration.routeDecision.selectedRoles.join(" -> ")}</p>
          {turn.trace.orchestration.finalSummary ? <p>{turn.trace.orchestration.finalSummary}</p> : null}
        </div>
      ) : null}
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
  function handleSurfaceKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(turn.turnId);
    }
  }

  return (
    <article className={`chat-v11-turn-card${selected ? " selected" : ""}`}>
      <div
        aria-pressed={selected}
        className="chat-v11-turn-surface"
        onClick={() => onSelect(turn.turnId)}
        onKeyDown={handleSurfaceKeyDown}
        role="button"
        tabIndex={0}
      >
        <div className="chat-v11-turn-bubble user">
          <p className="chat-v11-message-meta"><strong>You</strong> · {formatActorTimestamp(turn.userMessage.timestamp)}</p>
          <p>{turn.userMessage.content}</p>
        </div>
        <div className="chat-v11-turn-bubble assistant">
          <p className="chat-v11-message-meta"><strong>GoatCitadel</strong> · {turn.assistantMessage ? formatActorTimestamp(turn.assistantMessage.timestamp) : "Running"}</p>
          {turn.assistantMessage ? (
            <ChatMarkdown content={turn.assistantMessage.content} />
          ) : (
            <p>{turn.trace.status === "running" ? "Working..." : "No assistant output yet."}</p>
          )}
        </div>
      </div>
      <ChatTurnRunStrip turn={turn} />
      <ChatTurnDetails
        turn={turn}
        onSwitchBranch={onSwitchBranch}
        onRetryTurn={onRetryTurn}
        onEditTurn={onEditTurn}
      />
    </article>
  );
}

function ChatThreadNotices({ notices }: { notices: ChatThreadNotice[] }) {
  if (notices.length === 0) {
    return null;
  }
  return (
    <ul className="chat-v11-thread-notices">
      {notices.map((notice) => (
        <li key={notice.id} className={`tone-${formatTone(notice.tone)}`}>
          <p className="chat-v11-message-meta"><strong>Notice</strong> · {formatActorTimestamp(notice.timestamp)}</p>
          <p>{notice.content}</p>
        </li>
      ))}
    </ul>
  );
}

export function ChatThreadView({
  loading,
  thread,
  selectedTurnId,
  notices,
  followOutput,
  onBottomStateChange,
  onSelectTurn,
  onSwitchBranch,
  onRetryTurn,
  onEditTurn,
}: {
  loading: boolean;
  thread: ChatThreadResponse | null;
  selectedTurnId: string | null;
  notices: ChatThreadNotice[];
  followOutput: boolean;
  onBottomStateChange: (atBottom: boolean) => void;
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
      {thread.turns.length < VIRTUALIZED_THREAD_THRESHOLD ? (
        <div className="chat-v11-thread-list">
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
          <ChatThreadNotices notices={notices} />
        </div>
      ) : (
        <Virtuoso
          className="chat-v11-thread-virtuoso"
          data={thread.turns}
          computeItemKey={(_index, turn) => turn.turnId}
          followOutput={followOutput ? "auto" : false}
          atBottomStateChange={onBottomStateChange}
          itemContent={(_index, turn) => (
            <ChatTurnCard
              turn={turn}
              selected={selectedTurnId === turn.turnId}
              onSelect={onSelectTurn}
              onSwitchBranch={onSwitchBranch}
              onRetryTurn={onRetryTurn}
              onEditTurn={onEditTurn}
            />
          )}
          components={{
            Footer: notices.length > 0
              ? () => <ChatThreadNotices notices={notices} />
              : undefined,
          }}
        />
      )}
    </div>
  );
}
