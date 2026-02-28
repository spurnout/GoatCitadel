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
import {
  OfficeCanvas,
  type OfficeDeskAgent,
  type OfficeOperatorModel,
  type OperatorPreset,
} from "../components/OfficeCanvas";
import { SelectOrCustom } from "../components/SelectOrCustom";

const INITIAL_EVENT_LIMIT = 300;
const MAX_EVENTS = 500;
const SNAPSHOT_INTERVAL_MS = 20_000;
const HOT_AGENT_WINDOW_MS = 2 * 60 * 1000;
const WARM_AGENT_WINDOW_MS = 10 * 60 * 1000;
const EVENTS_PER_MINUTE_WINDOW_MS = 5 * 60 * 1000;
const OPERATOR_STORAGE_KEY = "goatcitadel.office.operator";
const OPERATOR_NAME_OPTIONS = [
  "GoatHerder",
  "Lead Herder",
  "Herd Captain",
  "Trail Commander",
].map((value) => ({ value, label: value }));

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

interface OperatorPreferences {
  name: string;
  preset: OperatorPreset;
}

interface OfficeAssetPack {
  operatorModelPath?: string;
  goatModelPath?: string;
}

type SelectedEntityId = "operator" | string;

export function OfficePage(_props: { refreshKey?: number }) {
  const [directory, setDirectory] = useState<AgentDirectoryRecord[]>([]);
  const [operators, setOperators] = useState<OperatorsResponse["items"]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalsResponse["items"]>([]);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<SelectedEntityId>("operator");
  const [operatorPrefs, setOperatorPrefs] = useState<OperatorPreferences>(readOperatorPreferences);
  const [assetPack, setAssetPack] = useState<OfficeAssetPack>({});
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
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void loadSnapshot(false);
    }, SNAPSHOT_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadSnapshot(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const close = connectEventStream((event) => {
      setEvents((prev) => sortEvents([event, ...prev]).slice(0, MAX_EVENTS));
    });

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      close();
    };
  }, []);

  useEffect(() => {
    persistOperatorPreferences(operatorPrefs);
  }, [operatorPrefs]);

  useEffect(() => {
    let active = true;
    void loadOfficeAssetPack().then((pack) => {
      if (active) {
        setAssetPack(pack);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const sortedEvents = useMemo(() => sortEvents(events), [events]);
  const officeAgents = useMemo(() => deriveOfficeAgents(directory, sortedEvents), [directory, sortedEvents]);
  const selectedAgent = useMemo(
    () => officeAgents.find((agent) => agent.roleId === selectedEntityId),
    [officeAgents, selectedEntityId],
  );

  useEffect(() => {
    if (selectedEntityId === "operator") {
      return;
    }
    const exists = officeAgents.some((agent) => agent.roleId === selectedEntityId);
    if (!exists) {
      setSelectedEntityId("operator");
    }
  }, [officeAgents, selectedEntityId]);

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
  const blockedAgents = useMemo(
    () => officeAgents.filter((agent) => agent.risk === "blocked" || agent.risk === "error").length,
    [officeAgents],
  );

  const operatorModel: OfficeOperatorModel = useMemo(() => ({
    operatorId: "operator",
    name: operatorPrefs.name,
    preset: operatorPrefs.preset,
    currentThought: buildOperatorThought({
      activeAgents,
      blockedAgents,
      pendingApprovals: pendingApprovals.length,
      eventFlow,
    }),
  }), [activeAgents, blockedAgents, eventFlow, operatorPrefs.name, operatorPrefs.preset, pendingApprovals.length]);

  if (loading) {
    return <p>Loading Herd HQ...</p>;
  }

  return (
    <section className="office-v3">
      <h2>Herd HQ</h2>
      <p className="office-subtitle">
        GoatCitadel command floor: one operator in the center, specialist goats around the ring.
      </p>
      {error ? <p className="error">{error}</p> : null}

      <div className="office-kpi-grid">
        <article className="office-kpi-card">
          <p className="office-kpi-label">Goats in motion</p>
          <p className="office-kpi-value">{activeAgents}</p>
          <p className="office-kpi-note">Actively executing work</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Hot hooves</p>
          <p className="office-kpi-value">{hotAgents}</p>
          <p className="office-kpi-note">Updated in last 2 minutes</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Ready reserves</p>
          <p className="office-kpi-value">{readyAgents}</p>
          <p className="office-kpi-note">Ready for assignment</p>
        </article>
        <article className="office-kpi-card">
          <p className="office-kpi-label">Event pace</p>
          <p className="office-kpi-value">{eventFlow.toFixed(1)}/min</p>
          <p className="office-kpi-note">{pendingApprovals.length} approvals pending</p>
        </article>
      </div>

      <div className="office-v3-layout">
        <article className="card office-stage-card">
          <div className="office-stage-head">
            <h3>GoatCitadel Floor (WebGL)</h3>
            <p className="office-subtitle">
              Drag to orbit. Select GoatHerder or any goat desk. Procedural fallback meshes are active.
            </p>
          </div>

          {officeAgents.length === 0 ? (
            <p>No agent roles are available yet.</p>
          ) : (
            <>
              <OfficeCanvas
                operator={operatorModel}
                agents={officeAgents}
                selectedEntityId={selectedEntityId}
                onSelect={(entityId) => setSelectedEntityId(entityId as SelectedEntityId)}
                assetPack={assetPack}
              />
              <div className="office-desk-list">
                <button
                  className={selectedEntityId === "operator" ? "active" : ""}
                  onClick={() => setSelectedEntityId("operator")}
                >
                  {operatorPrefs.name}
                </button>
                {officeAgents.map((agent) => (
                  <button
                    key={agent.roleId}
                    className={selectedEntityId === agent.roleId ? "active" : ""}
                    onClick={() => setSelectedEntityId(agent.roleId)}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>

        <aside className="card office-inspector">
          {selectedEntityId === "operator" ? (
            <>
              <header className="office-agent-header">
                <div className="office-avatar office-avatar-hot">GH</div>
                <div>
                  <h3>{operatorPrefs.name}</h3>
                  <p className="office-agent-id">Central Herd Operator</p>
                </div>
                <span className="office-pill office-pill-active">active</span>
              </header>

              <p>Coordinates specialized goats, arbitration gates, and live mission flow.</p>
              <p><strong>Thinking:</strong> {operatorModel.currentThought}</p>

              <dl className="office-meta-grid">
                <div>
                  <dt>Active goats</dt>
                  <dd>{activeAgents}</dd>
                </div>
                <div>
                  <dt>Pending approvals</dt>
                  <dd>{pendingApprovals.length}</dd>
                </div>
                <div>
                  <dt>Risked goats</dt>
                  <dd>{blockedAgents}</dd>
                </div>
                <div>
                  <dt>Event pace</dt>
                  <dd>{eventFlow.toFixed(1)}/min</dd>
                </div>
              </dl>

              <h4>Operator Customization</h4>
              <div className="controls-row">
                <label htmlFor="goatHerderName">Operator name</label>
                <SelectOrCustom
                  id="goatHerderName"
                  value={operatorPrefs.name}
                  onChange={(name) => setOperatorPrefs((prev) => ({ ...prev, name: name || "GoatHerder" }))}
                  options={OPERATOR_NAME_OPTIONS}
                  customPlaceholder="Custom operator name"
                  customLabel="Operator name"
                />
              </div>
              <div className="controls-row">
                <label htmlFor="goatHerderPreset">Style preset</label>
                <select
                  id="goatHerderPreset"
                  value={operatorPrefs.preset}
                  onChange={(event) => setOperatorPrefs((prev) => ({
                    ...prev,
                    preset: event.target.value as OperatorPreset,
                  }))}
                >
                  <option value="trailblazer">Trailblazer</option>
                  <option value="strategist">Strategist</option>
                  <option value="nightwatch">Nightwatch</option>
                </select>
              </div>
            </>
          ) : !selectedAgent ? (
            <p>No goat selected.</p>
          ) : (
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
        ? "Pushing current assignment forward."
        : agent.status === "idle"
          ? "Idle with warm context."
          : "Waiting for first assignment.",
      currentThought: agent.status === "ready"
        ? "Standing by for orders from GoatHerder."
        : "Monitoring the event rail.",
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
    asString(session.agentSessionId),
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
      action: "Opened a new goat sub-agent session.",
      thought: "Bootstrapping workspace and context.",
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
        thought: "Ready to hand off results.",
        taskId,
        sessionId,
        status: "idle",
        risk: "none",
      };
    }
    if (status === "failed" || status === "killed") {
      return {
        action: `Session ended (${status}).`,
        thought: "Needs operator review before retry.",
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
  return asString(session.agentSessionId);
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

function buildOperatorThought(input: {
  activeAgents: number;
  blockedAgents: number;
  pendingApprovals: number;
  eventFlow: number;
}): string {
  if (input.blockedAgents > 0) {
    return `${input.blockedAgents} goats are blocked. Prioritize approvals and clear policy conflicts.`;
  }
  if (input.pendingApprovals > 0) {
    return `${input.pendingApprovals} approvals pending while ${input.activeAgents} goats stay in motion.`;
  }
  if (input.activeAgents === 0) {
    return "No goats are currently active. Ready to assign a fresh wave.";
  }
  return `${input.activeAgents} goats are running at ${input.eventFlow.toFixed(1)} events per minute.`;
}

async function loadOfficeAssetPack(): Promise<OfficeAssetPack> {
  let manifest: {
    models?: Array<{ id?: string; path?: string; includedInRepo?: boolean }>;
  };

  try {
    const response = await fetch("/assets/office/asset-manifest.json");
    if (!response.ok) {
      return {};
    }
    manifest = await response.json() as { models?: Array<{ id?: string; path?: string; includedInRepo?: boolean }> };
  } catch {
    return {};
  }

  const models = manifest.models ?? [];
  const operator = models.find((item) => item.id === "central-operator");
  const goat = models.find((item) => item.id === "goat-subagent");

  const pack: OfficeAssetPack = {};
  if (operator?.path && operator.includedInRepo) {
    const exists = await checkAssetExists(operator.path);
    if (exists) {
      pack.operatorModelPath = operator.path;
    }
  }

  if (goat?.path && goat.includedInRepo) {
    const exists = await checkAssetExists(goat.path);
    if (exists) {
      pack.goatModelPath = goat.path;
    }
  }

  return pack;
}

async function checkAssetExists(path: string): Promise<boolean> {
  try {
    const response = await fetch(path, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

function readOperatorPreferences(): OperatorPreferences {
  if (typeof window === "undefined") {
    return { name: "GoatHerder", preset: "trailblazer" };
  }

  try {
    const raw = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
    if (!raw) {
      return { name: "GoatHerder", preset: "trailblazer" };
    }
    const parsed = JSON.parse(raw) as Partial<OperatorPreferences>;
    return {
      name: sanitizeName(parsed.name) || "GoatHerder",
      preset: isPreset(parsed.preset) ? parsed.preset : "trailblazer",
    };
  } catch {
    return { name: "GoatHerder", preset: "trailblazer" };
  }
}

function persistOperatorPreferences(value: OperatorPreferences): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload: OperatorPreferences = {
    name: sanitizeName(value.name) || "GoatHerder",
    preset: value.preset,
  };
  window.localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(payload));
}

function sanitizeName(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().slice(0, 40);
  return trimmed || undefined;
}

function isPreset(value: unknown): value is OperatorPreset {
  return value === "trailblazer" || value === "strategist" || value === "nightwatch";
}
