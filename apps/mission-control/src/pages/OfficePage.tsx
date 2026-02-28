import { useEffect, useMemo, useState } from "react";
import {
  connectEventStream,
  fetchAgents,
  fetchApprovals,
  fetchOperators,
  fetchRealtimeEvents,
  type ApprovalsResponse,
  type OperatorsResponse,
  type RealtimeEvent,
} from "../api/client";
import {
  buildAgentDirectory,
  inferRoleId,
  type AgentDirectoryRecord,
} from "../data/agent-roster";
import { OfficeCanvas } from "../components/OfficeCanvas";

const INITIAL_EVENT_LIMIT = 300;
const MAX_EVENTS = 500;
const SNAPSHOT_INTERVAL_MS = 20_000;
const HOT_AGENT_WINDOW_MS = 2 * 60 * 1000;
const WARM_AGENT_WINDOW_MS = 10 * 60 * 1000;
const EVENTS_PER_MINUTE_WINDOW_MS = 5 * 60 * 1000;

type AgentRisk = "none" | "approval" | "blocked" | "error";

interface OfficeAgentModel extends AgentDirectoryRecord {
  currentAction: string;
  currentThought: string;
  taskId?: string;
  sessionId?: string;
  lastSeenAt?: string;
  lastEventType?: string;
  risk: AgentRisk;
  eventTrail: RealtimeEvent[];
}

export function OfficePage(_props: { refreshKey?: number }) {
  const [directory, setDirectory] = useState<AgentDirectoryRecord[]>([]);
  const [operators, setOperators] = useState<OperatorsResponse["items"]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalsResponse["items"]>([]);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadSnapshot = async (includeEvents: boolean): Promise<void> => {
      try {
        const [agentsRes, operatorsRes, approvalsRes, eventsRes] = await Promise.all([
          fetchAgents(),
          fetchOperators(),
          fetchApprovals("pending"),
          includeEvents ? fetchRealtimeEvents(INITIAL_EVENT_LIMIT) : Promise.resolve(null),
        ]);

        if (!active) {
          return;
        }

        setDirectory(buildAgentDirectory(agentsRes.items));
        setOperators(operatorsRes.items);
        setPendingApprovals(approvalsRes.items);
        if (eventsRes) {
          setEvents(sortEvents(eventsRes.items).slice(0, MAX_EVENTS));
        }
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        setError((err as Error).message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadSnapshot(true);
    const interval = setInterval(() => {
      void loadSnapshot(false);
    }, SNAPSHOT_INTERVAL_MS);

    const close = connectEventStream((event) => {
      setEvents((prev) => sortEvents([event, ...prev]).slice(0, MAX_EVENTS));
    });

    return () => {
      active = false;
      clearInterval(interval);
      close();
    };
  }, []);

  const sortedEvents = useMemo(() => sortEvents(events), [events]);
  const officeAgents = useMemo(() => deriveOfficeAgents(directory, sortedEvents), [directory, sortedEvents]);
  const selectedAgent = useMemo(
    () => officeAgents.find((agent) => agent.roleId === selectedRoleId) ?? officeAgents[0],
    [officeAgents, selectedRoleId],
  );

  useEffect(() => {
    if (!selectedRoleId && officeAgents.length > 0) {
      setSelectedRoleId(officeAgents[0]?.roleId ?? "");
    }
    const selectedExists = officeAgents.some((agent) => agent.roleId === selectedRoleId);
    if (selectedRoleId && !selectedExists && officeAgents.length > 0) {
      setSelectedRoleId(officeAgents[0]?.roleId ?? "");
    }
  }, [officeAgents, selectedRoleId]);

  const activeAgents = useMemo(
    () => officeAgents.filter((agent) => agent.status === "active").length,
    [officeAgents],
  );
  const readyAgents = useMemo(
    () => officeAgents.filter((agent) => agent.status === "ready").length,
    [officeAgents],
  );
  const eventFlow = useMemo(() => {
    const threshold = Date.now() - EVENTS_PER_MINUTE_WINDOW_MS;
    const count = sortedEvents.filter((event) => parseTimestamp(event.timestamp) >= threshold).length;
    return count / 5;
  }, [sortedEvents]);
  const hotAgents = useMemo(
    () => officeAgents.filter((agent) => classifyAgentHeat(agent.lastSeenAt) === "hot").length,
    [officeAgents],
  );

  if (loading) {
    return <p>Loading office floor...</p>;
  }

  return (
    <section className="office-v3">
      <h2>Office</h2>
      <p className="office-subtitle">
        Interactive office floor: click a desk to inspect what each agent is doing and thinking.
      </p>
      {error ? <p className="error">{error}</p> : null}

      <div className="office-kpi-grid">
        <article className="office-kpi-card">
          <p className="office-kpi-label">Active agents</p>
          <p className="office-kpi-value">{activeAgents}</p>
          <p className="office-kpi-note">Executing right now</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Hot desks</p>
          <p className="office-kpi-value">{hotAgents}</p>
          <p className="office-kpi-note">Updated in last 2 minutes</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Ready specialists</p>
          <p className="office-kpi-value">{readyAgents}</p>
          <p className="office-kpi-note">No active session yet</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Event flow</p>
          <p className="office-kpi-value">{eventFlow.toFixed(1)}/min</p>
          <p className="office-kpi-note">{pendingApprovals.length} approvals pending</p>
        </article>
      </div>

      <div className="office-v3-layout">
        <article className="card office-stage-card">
          <div className="office-stage-head">
            <h3>Agent Floor (WebGL)</h3>
            <p className="office-subtitle">Drag to orbit. Click a desk or avatar for details.</p>
          </div>

          {officeAgents.length === 0 ? (
            <p>No agent roles are available yet.</p>
          ) : (
            <>
              <OfficeCanvas
                agents={officeAgents}
                selectedRoleId={selectedAgent?.roleId}
                onSelect={setSelectedRoleId}
              />
              <div className="office-desk-list">
                {officeAgents.map((agent) => (
                  <button
                    key={agent.roleId}
                    className={`${selectedAgent?.roleId === agent.roleId ? "active" : ""}`}
                    onClick={() => setSelectedRoleId(agent.roleId)}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>

        <aside className="card office-inspector">
          {!selectedAgent ? <p>No agent selected.</p> : (
            <>
              <header className="office-agent-header">
                <div className={`office-avatar office-avatar-${classifyAgentHeat(selectedAgent.lastSeenAt)}`}>
                  {initials(selectedAgent.name)}
                </div>
                <div>
                  <h3>{selectedAgent.name}</h3>
                  <p className="office-agent-id">{selectedAgent.title}</p>
                </div>
                <span className={`office-pill office-pill-${selectedAgent.status === "ready" ? "idle" : selectedAgent.status}`}>
                  {selectedAgent.status}
                </span>
              </header>

              <p>{selectedAgent.summary}</p>
              <p><strong>Doing:</strong> {selectedAgent.currentAction}</p>
              <p><strong>Thinking:</strong> {selectedAgent.currentThought}</p>

              <dl className="office-meta-grid">
                <div>
                  <dt>Risk</dt>
                  <dd>{selectedAgent.risk}</dd>
                </div>
                <div>
                  <dt>Task</dt>
                  <dd>{selectedAgent.taskId ?? "-"}</dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>{selectedAgent.sessionId ?? selectedAgent.runtimeAgentId ?? "-"}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{formatRelative(selectedAgent.lastSeenAt)}</dd>
                </div>
              </dl>

              <h4>Specialties</h4>
              <div className="token-row">
                {selectedAgent.specialties.map((specialty) => (
                  <span key={specialty} className="token-chip">{specialty}</span>
                ))}
              </div>

              <h4>Recent Signals</h4>
              <ul className="compact-list">
                {selectedAgent.eventTrail.length === 0 ? <li>No events yet.</li> : selectedAgent.eventTrail.slice(0, 8).map((event) => (
                  <li key={event.eventId}>
                    <strong>{event.eventType}</strong>
                    <p>{summarizeEvent(event)}</p>
                    <small>{formatClock(event.timestamp)} - {event.source}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      <div className="office-rail-grid">
        <article className="card">
          <h3>Operators</h3>
          <ul className="compact-list">
            {operators.map((operator) => (
              <li key={operator.operatorId}>
                <strong>{operator.operatorId}</strong>
                <p>{operator.activeSessions} active / {operator.sessionCount} total sessions</p>
                <small>Last activity {formatRelative(operator.lastActivityAt)}</small>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h3>Pending Approvals</h3>
          <ul className="compact-list">
            {pendingApprovals.length === 0 ? <li>None</li> : pendingApprovals.slice(0, 10).map((approval) => (
              <li key={approval.approvalId}>
                <strong>{approval.kind}</strong>
                <p>{approval.riskLevel} - {approval.status}</p>
                <small>{formatRelative(approval.createdAt)}</small>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h3>Live Event Rail</h3>
          <ul className="compact-list">
            {sortedEvents.slice(0, 12).map((event) => (
              <li key={event.eventId}>
                <strong>{event.eventType}</strong>
                <p>{summarizeEvent(event)}</p>
                <small>{formatClock(event.timestamp)} - {event.source}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function deriveOfficeAgents(
  directory: AgentDirectoryRecord[],
  events: RealtimeEvent[],
): OfficeAgentModel[] {
  const byRole = new Map<string, OfficeAgentModel>();
  const runtimeLookup = new Map<string, string>();

  for (const agent of directory) {
    byRole.set(agent.roleId, {
      ...agent,
      currentAction: agent.status === "active"
        ? "Executing assigned work."
        : agent.status === "idle"
          ? "Idle with recent context."
          : "Ready to be assigned.",
      currentThought: agent.status === "ready"
        ? "Standing by for first assignment."
        : "Awaiting the next event.",
      lastSeenAt: agent.lastUpdatedAt,
      risk: "none",
      eventTrail: [],
    });

    if (agent.runtimeAgentId) {
      runtimeLookup.set(normalize(agent.runtimeAgentId), agent.roleId);
    }
    runtimeLookup.set(normalize(agent.name), agent.roleId);
    if (agent.runtimeName) {
      runtimeLookup.set(normalize(agent.runtimeName), agent.roleId);
    }
  }

  for (const event of events) {
    const roleId = resolveEventRoleId(event, runtimeLookup);
    if (!roleId) {
      continue;
    }

    const existing = byRole.get(roleId);
    if (!existing) {
      continue;
    }

    const details = describeAgentEvent(event);
    if (!existing.lastSeenAt || parseTimestamp(event.timestamp) >= parseTimestamp(existing.lastSeenAt)) {
      existing.currentAction = details.action;
      existing.currentThought = details.thought;
      existing.lastSeenAt = event.timestamp;
      existing.lastEventType = event.eventType;
      existing.taskId = details.taskId;
      existing.sessionId = details.sessionId;
      existing.risk = details.risk;
      if (details.status) {
        existing.status = details.status;
      }
    }

    if (existing.eventTrail.length < 12) {
      existing.eventTrail.push(event);
    }
  }

  return [...byRole.values()].sort((left, right) => {
    const statusDelta = statusScore(right.status) - statusScore(left.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return parseTimestamp(right.lastSeenAt) - parseTimestamp(left.lastSeenAt);
  });
}

function resolveEventRoleId(
  event: RealtimeEvent,
  runtimeLookup: Map<string, string>,
): string | undefined {
  const payload = asRecord(event.payload);
  const activity = asRecord(payload.activity);
  const session = asRecord(payload.session);
  const task = asRecord(payload.task);

  const actorType = asString(payload.actorType);
  const candidates = [
    asString(payload.agentId),
    actorType === "agent" ? asString(payload.actorId) : undefined,
    asString(activity.agentId),
    asString(session.agentName),
    asString(session.openclawSessionId),
    asString(task.assignedAgentId),
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    const byRuntime = runtimeLookup.get(normalize(candidate));
    if (byRuntime) {
      return byRuntime;
    }
    const inferred = inferRoleId(candidate);
    if (inferred) {
      return inferred;
    }
  }

  return undefined;
}

function describeAgentEvent(event: RealtimeEvent): {
  action: string;
  thought: string;
  taskId?: string;
  sessionId?: string;
  status?: OfficeAgentModel["status"];
  risk: AgentRisk;
} {
  const payload = asRecord(event.payload);
  const taskId = extractTaskId(event);
  const sessionId = extractSessionId(event);

  if (event.eventType === "tool_invoked") {
    const toolName = asString(payload.toolName) ?? "tool";
    const outcome = asString(payload.outcome) ?? "executed";
    const policyReason = asString(payload.policyReason) ?? "policy gate reviewed the request";

    if (outcome === "approval_required") {
      return {
        action: `Waiting for approval to run ${toolName}.`,
        thought: `Safety gate paused execution: ${policyReason}.`,
        taskId,
        sessionId,
        status: "active",
        risk: "approval",
      };
    }
    if (outcome === "blocked") {
      return {
        action: `${toolName} blocked by policy.`,
        thought: policyReason,
        taskId,
        sessionId,
        status: "idle",
        risk: "blocked",
      };
    }
    return {
      action: `Executing ${toolName}.`,
      thought: `Policy outcome: ${policyReason}.`,
      taskId,
      sessionId,
      status: "active",
      risk: "none",
    };
  }

  if (event.eventType === "subagent_registered") {
    return {
      action: "Opened a new sub-agent session.",
      thought: "Bootstrapping context and workspace state.",
      taskId,
      sessionId,
      status: "active",
      risk: "none",
    };
  }

  if (event.eventType === "subagent_updated") {
    const session = asRecord(payload.session);
    const status = asString(session.status);
    if (status === "completed") {
      return {
        action: "Completed current sub-agent run.",
        thought: "Ready to handoff results.",
        taskId,
        sessionId,
        status: "idle",
        risk: "none",
      };
    }
    if (status === "failed" || status === "killed") {
      return {
        action: `Session ended (${status}).`,
        thought: "Requires operator review before retry.",
        taskId,
        sessionId,
        status: "idle",
        risk: "error",
      };
    }
    return {
      action: "Sub-agent session active.",
      thought: "Working inside the assigned workspace.",
      taskId,
      sessionId,
      status: "active",
      risk: "none",
    };
  }

  if (event.eventType === "activity_logged") {
    const activity = asRecord(payload.activity);
    const message = asString(activity.message) ?? "Task activity logged.";
    return {
      action: "Recorded task activity.",
      thought: truncate(message, 180),
      taskId,
      sessionId,
      status: "active",
      risk: "none",
    };
  }

  if (event.eventType === "task_updated" || event.eventType === "task_created") {
    const task = asRecord(payload.task);
    const title = asString(task.title) ?? "task";
    const status = asString(task.status);
    return {
      action: `${event.eventType === "task_created" ? "Created" : "Updated"} ${title}.`,
      thought: status ? `Task status is ${status}.` : "Task metadata changed.",
      taskId,
      sessionId,
      status: status === "done" ? "idle" : "active",
      risk: "none",
    };
  }

  if (event.eventType === "orchestration_event") {
    const orchestrationEvent = asString(payload.event) ?? "phase_update";
    return {
      action: `Orchestration update: ${orchestrationEvent}.`,
      thought: "Tracking wave and phase progression.",
      taskId,
      sessionId,
      status: "active",
      risk: "none",
    };
  }

  return {
    action: `Handled ${event.eventType}.`,
    thought: "Monitoring and waiting for next instruction.",
    taskId,
    sessionId,
    risk: "none",
  };
}

function summarizeEvent(event: RealtimeEvent): string {
  const payload = asRecord(event.payload);
  if (event.eventType === "tool_invoked") {
    const toolName = asString(payload.toolName) ?? "tool";
    const outcome = asString(payload.outcome) ?? "executed";
    return `${toolName} -> ${outcome}`;
  }
  if (event.eventType === "approval_created") {
    const kind = asString(payload.kind) ?? "approval";
    const riskLevel = asString(payload.riskLevel) ?? "unknown";
    return `${kind} (${riskLevel})`;
  }
  if (event.eventType === "activity_logged") {
    const activity = asRecord(payload.activity);
    return truncate(asString(activity.message) ?? "task activity", 80);
  }
  if (event.eventType === "task_updated" || event.eventType === "task_created") {
    const task = asRecord(payload.task);
    const title = asString(task.title) ?? asString(task.taskId) ?? "task";
    return truncate(title, 80);
  }
  return truncate(JSON.stringify(payload), 80);
}

function extractTaskId(event: RealtimeEvent): string | undefined {
  const payload = asRecord(event.payload);
  const taskId = asString(payload.taskId);
  if (taskId) {
    return taskId;
  }
  const task = asRecord(payload.task);
  return asString(task.taskId);
}

function extractSessionId(event: RealtimeEvent): string | undefined {
  const payload = asRecord(event.payload);
  const sessionId = asString(payload.sessionId);
  if (sessionId) {
    return sessionId;
  }
  const session = asRecord(payload.session);
  return asString(session.openclawSessionId);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortEvents(events: RealtimeEvent[]): RealtimeEvent[] {
  return [...events].sort((left, right) => parseTimestamp(right.timestamp) - parseTimestamp(left.timestamp));
}

function statusScore(status: AgentDirectoryRecord["status"]): number {
  if (status === "active") {
    return 3;
  }
  if (status === "idle") {
    return 2;
  }
  return 1;
}

function classifyAgentHeat(lastSeenAt?: string): "hot" | "warm" | "cold" {
  const timestamp = parseTimestamp(lastSeenAt);
  const age = Date.now() - timestamp;
  if (timestamp > 0 && age <= HOT_AGENT_WINDOW_MS) {
    return "hot";
  }
  if (timestamp > 0 && age <= WARM_AGENT_WINDOW_MS) {
    return "warm";
  }
  return "cold";
}

function formatClock(value?: string): string {
  const parsed = parseTimestamp(value);
  if (parsed <= 0) {
    return "-";
  }
  return new Date(parsed).toLocaleTimeString();
}

function formatRelative(value?: string): string {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return "-";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}m ago`;
  }
  if (diffSeconds < 24 * 3600) {
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  }
  return `${Math.floor(diffSeconds / (24 * 3600))}d ago`;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "AG";
  }
  if (parts.length === 1) {
    return (parts[0] ?? "AG").slice(0, 2).toUpperCase();
  }
  const left = parts[0]?.[0] ?? "A";
  const right = parts[1]?.[0] ?? "G";
  return `${left}${right}`.toUpperCase();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
