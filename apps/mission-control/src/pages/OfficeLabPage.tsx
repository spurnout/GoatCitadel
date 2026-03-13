import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAgents, fetchApprovals, fetchOperators, fetchRealtimeEvents, connectEventStream, type RealtimeEvent } from "../api/client";
import { CardSkeleton } from "../components/CardSkeleton";
import { PageGuideCard } from "../components/PageGuideCard";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { StatusChip } from "../components/StatusChip";
import { buildAgentDirectory, type AgentDirectoryRecord } from "../data/agent-roster";
import { OFFICE_ZONE_ORDER, inferOfficeZone, officeZoneLabel, type OfficeZoneId } from "../data/office-zones";
import { pageCopy } from "../content/copy";
import "../styles/office-lab.css";

const INITIAL_EVENT_LIMIT = 80;
const MAX_EVENT_COUNT = 120;
const SNAPSHOT_INTERVAL_MS = 25_000;

type PendingApproval = Awaited<ReturnType<typeof fetchApprovals>>["items"][number];
type OperatorSummary = Awaited<ReturnType<typeof fetchOperators>>["items"][number];

interface LabAgent extends AgentDirectoryRecord {
  zoneId: OfficeZoneId;
  zoneLabel: string;
  latestEvent?: RealtimeEvent;
  latestAction: string;
  pendingApprovalCount: number;
  urgency: "critical" | "warning" | "active" | "idle";
}

interface LabZone {
  zoneId: OfficeZoneId;
  label: string;
  agents: LabAgent[];
  activeAgents: number;
  pendingApprovalCount: number;
  leadAction: string;
  tone: "critical" | "warning" | "live" | "muted";
}

export function OfficeLabPage() {
  const [agents, setAgents] = useState<AgentDirectoryRecord[]>([]);
  const [operators, setOperators] = useState<OperatorSummary[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<OfficeZoneId>("command");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<"open" | "error" | "closed">("closed");

  const loadSnapshot = useCallback(async () => {
    const [agentsResponse, operatorsResponse, approvalsResponse, eventsResponse] = await Promise.all([
      fetchAgents("all", 300),
      fetchOperators(),
      fetchApprovals("pending"),
      fetchRealtimeEvents(INITIAL_EVENT_LIMIT),
    ]);
    setAgents(buildAgentDirectory(agentsResponse.items));
    setOperators(operatorsResponse.items);
    setPendingApprovals(approvalsResponse.items);
    setEvents((current) => mergeRealtimeEvents(current, eventsResponse.items));
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadSnapshot();
      setError(null);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = globalThis.setInterval(() => {
      void loadSnapshot().catch(() => undefined);
    }, SNAPSHOT_INTERVAL_MS);
    return () => globalThis.clearInterval(interval);
  }, [loadSnapshot]);

  useEffect(() => {
    const close = connectEventStream(
      (event) => {
        setEvents((current) => mergeRealtimeEvents(current, [event]));
        if (event.eventType === "approval_created" || event.eventType === "approval_resolved") {
          void fetchApprovals("pending")
            .then((response) => setPendingApprovals(response.items))
            .catch(() => undefined);
        }
        if (
          event.eventType === "activity_logged"
          || event.eventType === "session_event"
          || event.eventType === "subagent_registered"
          || event.eventType === "subagent_updated"
          || event.eventType === "orchestration_event"
        ) {
          void fetchAgents("all", 300)
            .then((response) => setAgents(buildAgentDirectory(response.items)))
            .catch(() => undefined);
        }
      },
      (nextState) => {
        if (nextState === "open" || nextState === "error" || nextState === "closed") {
          setStreamState(nextState);
        }
      },
    );

    return () => {
      close();
    };
  }, []);

  const eventHints = useMemo(
    () => events.map((event) => ({ event, hints: collectNormalizedStrings(event.payload) })),
    [events],
  );

  const approvalsWithHints = useMemo(
    () => pendingApprovals.map((approval) => ({ approval, hints: collectNormalizedStrings(approval) })),
    [pendingApprovals],
  );

  const labAgents = useMemo<LabAgent[]>(() => {
    return agents.map((agent) => {
      const zoneId = inferOfficeZone(agent);
      const zoneLabel = officeZoneLabel(zoneId);
      const agentHints = buildAgentHintSet(agent);
      const latestEvent = eventHints.find((entry) => matchesHintSet(agentHints, entry.hints))?.event;
      const pendingApprovalCount = approvalsWithHints.filter((entry) => matchesHintSet(agentHints, entry.hints)).length;
      const urgency = deriveAgentUrgency(agent, pendingApprovalCount, latestEvent);
      return {
        ...agent,
        zoneId,
        zoneLabel,
        latestEvent,
        latestAction: describeAgentAction(agent, latestEvent, pendingApprovalCount),
        pendingApprovalCount,
        urgency,
      };
    });
  }, [agents, approvalsWithHints, eventHints]);

  const zones = useMemo<LabZone[]>(() => {
    return OFFICE_ZONE_ORDER.map((zoneId) => {
      const zoneAgents = labAgents
        .filter((agent) => agent.zoneId === zoneId)
        .sort((left, right) => urgencyScore(right.urgency) - urgencyScore(left.urgency) || left.name.localeCompare(right.name));
      const activeAgents = zoneAgents.filter((agent) => agent.urgency === "active").length;
      const pendingApprovalCount = zoneAgents.reduce((total, agent) => total + agent.pendingApprovalCount, 0);
      const leadAction = zoneAgents[0]?.latestAction ?? "Deck is quiet.";
      return {
        zoneId,
        label: officeZoneLabel(zoneId),
        agents: zoneAgents,
        activeAgents,
        pendingApprovalCount,
        leadAction,
        tone: pendingApprovalCount > 0 ? "critical" : activeAgents > 0 ? "live" : zoneAgents.length > 0 ? "warning" : "muted",
      };
    });
  }, [labAgents]);

  const selectedAgent = useMemo(
    () => labAgents.find((agent) => agent.agentId === selectedAgentId) ?? null,
    [labAgents, selectedAgentId],
  );

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.zoneId === (selectedAgent?.zoneId ?? selectedZoneId)) ?? zones[0] ?? null,
    [selectedAgent, selectedZoneId, zones],
  );

  useEffect(() => {
    if (selectedAgentId === null) {
      return;
    }
    if (selectedAgent && labAgents.some((agent) => agent.agentId === selectedAgent.agentId)) {
      return;
    }
    setSelectedAgentId(null);
  }, [labAgents, selectedAgent, selectedAgentId]);

  const recentEvents = useMemo(() => {
    return events.slice(0, 8).map((event) => ({
      event,
      label: describeEventLabel(event),
      detail: describeEventDetail(event),
    }));
  }, [events]);

  const totalActiveAgents = labAgents.filter((agent) => agent.urgency === "active").length;

  return (
    <section className="office-lab-page workflow-page">
      <PageHeader
        eyebrow="Office Lab"
        title={pageCopy.officeLab.title}
        subtitle={pageCopy.officeLab.subtitle}
        hint="Separate 2D deck view. No shared 3D runtime, no alternate camera profile."
        className="page-header-citadel"
        actions={(
          <div className="workflow-summary-strip">
            <StatusChip tone={streamState === "open" ? "live" : streamState === "error" ? "warning" : "muted"}>
              {streamState === "open" ? "Live link" : streamState === "error" ? "Stream degraded" : "Stream idle"}
            </StatusChip>
            <StatusChip tone={pendingApprovals.length > 0 ? "critical" : "muted"}>{pendingApprovals.length} pending</StatusChip>
            <StatusChip tone={totalActiveAgents > 0 ? "live" : "muted"}>{totalActiveAgents} active</StatusChip>
            <StatusChip tone="muted">{operators.length} operators</StatusChip>
            <button type="button" className="office-lab-button" onClick={() => void refresh()}>
              Reload office
            </button>
          </div>
        )}
      />
      <PageGuideCard
        pageId="officeLab"
        what={pageCopy.officeLab.guide?.what ?? ""}
        when={pageCopy.officeLab.guide?.when ?? ""}
        actions={pageCopy.officeLab.guide?.actions ?? []}
        terms={pageCopy.officeLab.guide?.terms}
      />
      <div className="workflow-status-stack">
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="office-lab-layout">
        <Panel
          title="Citadel Floor"
          subtitle="Deck-by-deck pixel office inspired by the external office references, mapped onto GoatCitadel roles and live events."
          className="office-lab-floor-panel"
        >
          {isLoading ? (
            <div className="office-lab-skeleton-grid">
              {OFFICE_ZONE_ORDER.map((zoneId) => (
                <CardSkeleton key={zoneId} lines={5} />
              ))}
            </div>
          ) : (
            <div className="office-lab-floor-grid">
              {zones.map((zone) => (
                <section
                  key={zone.zoneId}
                  className={`office-lab-zone office-lab-zone-${zone.zoneId}${selectedZone?.zoneId === zone.zoneId ? " is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="office-lab-zone-header"
                    onClick={() => {
                      setSelectedAgentId(null);
                      setSelectedZoneId(zone.zoneId);
                    }}
                  >
                    <div>
                      <p className="office-lab-zone-kicker">Deck</p>
                      <h3>{zone.label}</h3>
                    </div>
                    <div className="office-lab-zone-chips">
                      <StatusChip tone={zone.tone}>{zone.activeAgents} active</StatusChip>
                      <StatusChip tone={zone.pendingApprovalCount > 0 ? "critical" : "muted"}>
                        {zone.pendingApprovalCount} approvals
                      </StatusChip>
                    </div>
                  </button>
                  <p className="office-lab-zone-summary">{zone.leadAction}</p>
                  <div className="office-lab-room">
                    {zone.agents.length > 0 ? (
                      zone.agents.map((agent) => (
                        <button
                          type="button"
                          key={agent.agentId}
                          className={`office-lab-agent office-lab-agent-${agent.urgency}${selectedAgent?.agentId === agent.agentId ? " is-selected" : ""}`}
                          onClick={() => {
                            setSelectedZoneId(agent.zoneId);
                            setSelectedAgentId(agent.agentId);
                          }}
                        >
                          <div className={`office-lab-sprite office-lab-sprite-${agent.urgency}`} aria-hidden="true">
                            <span className="office-lab-sprite-horn office-lab-sprite-horn-left" />
                            <span className="office-lab-sprite-horn office-lab-sprite-horn-right" />
                            <span className="office-lab-sprite-head" />
                            <span className="office-lab-sprite-body" />
                          </div>
                          <div className="office-lab-agent-copy">
                            <strong>{agent.name}</strong>
                            <span>{agent.title}</span>
                          </div>
                          <p className="office-lab-agent-action">{agent.latestAction}</p>
                          <div className="office-lab-agent-meta">
                            <StatusChip tone={agent.urgency === "critical" ? "critical" : agent.urgency === "active" ? "live" : agent.urgency === "warning" ? "warning" : "muted"}>
                              {agent.activeSessions > 0 ? `${agent.activeSessions} live` : agent.status}
                            </StatusChip>
                            {agent.pendingApprovalCount > 0 ? (
                              <StatusChip tone="critical">{agent.pendingApprovalCount} waiting</StatusChip>
                            ) : null}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="office-lab-empty-state">
                        <p>No crew assigned here right now.</p>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Panel>
        <div className="office-lab-sidecar">
          <Panel
            title={selectedAgent ? selectedAgent.name : selectedZone?.label ?? "Deck Inspector"}
            subtitle={selectedAgent ? selectedAgent.title : "Deck snapshot and operator-facing detail."}
            className="office-lab-inspector-panel"
          >
            {selectedAgent ? (
              <div className="office-lab-inspector">
                <div className="office-lab-inspector-strip">
                  <StatusChip tone={selectedAgent.urgency === "critical" ? "critical" : selectedAgent.urgency === "active" ? "live" : selectedAgent.urgency === "warning" ? "warning" : "muted"}>
                    {selectedAgent.zoneLabel}
                  </StatusChip>
                  <StatusChip tone={selectedAgent.pendingApprovalCount > 0 ? "critical" : "muted"}>
                    {selectedAgent.pendingApprovalCount} approvals
                  </StatusChip>
                </div>
                <p className="office-lab-inspector-summary">{selectedAgent.summary}</p>
                <dl className="office-lab-inspector-grid">
                  <div>
                    <dt>Current lane</dt>
                    <dd>{selectedAgent.latestAction}</dd>
                  </div>
                  <div>
                    <dt>Sessions</dt>
                    <dd>{selectedAgent.sessionCount} total / {selectedAgent.activeSessions} active</dd>
                  </div>
                  <div>
                    <dt>Specialties</dt>
                    <dd>{selectedAgent.specialties.join(", ") || "No specialties listed."}</dd>
                  </div>
                  <div>
                    <dt>Last signal</dt>
                    <dd>{selectedAgent.latestEvent ? formatRelativeTime(selectedAgent.latestEvent.timestamp) : "No live signal yet."}</dd>
                  </div>
                </dl>
              </div>
            ) : selectedZone ? (
              <div className="office-lab-inspector">
                <div className="office-lab-inspector-strip">
                  <StatusChip tone={selectedZone.tone}>{selectedZone.activeAgents} active</StatusChip>
                  <StatusChip tone={selectedZone.pendingApprovalCount > 0 ? "critical" : "muted"}>
                    {selectedZone.pendingApprovalCount} approvals
                  </StatusChip>
                </div>
                <p className="office-lab-inspector-summary">{selectedZone.leadAction}</p>
                <dl className="office-lab-inspector-grid">
                  <div>
                    <dt>Agents on deck</dt>
                    <dd>{selectedZone.agents.length}</dd>
                  </div>
                  <div>
                    <dt>Deck posture</dt>
                    <dd>{selectedZone.pendingApprovalCount > 0 ? "Waiting on operator decisions." : selectedZone.activeAgents > 0 ? "Running live work." : "Quiet / standby."}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </Panel>
          <Panel
            title="Live Rail"
            subtitle="Recent activity, approvals, and orchestration events feeding the 2D office."
            className="office-lab-rail-panel"
          >
            <div className="office-lab-rail-list">
              {recentEvents.length > 0 ? recentEvents.map(({ event, label, detail }) => (
                <article key={event.eventId} className="office-lab-rail-item">
                  <div className="office-lab-rail-meta">
                    <StatusChip tone={event.eventType === "approval_created" ? "critical" : event.eventType === "approval_resolved" ? "success" : "live"}>
                      {event.eventType}
                    </StatusChip>
                    <span>{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  <strong>{label}</strong>
                  <p>{detail}</p>
                </article>
              )) : (
                <p className="office-lab-empty-rail">No event traffic yet.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function buildAgentHintSet(agent: AgentDirectoryRecord): Set<string> {
  return new Set(
    [
      agent.agentId,
      agent.roleId,
      agent.name,
      agent.runtimeAgentId,
      agent.runtimeName,
      ...agent.aliases,
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeToken)
      .filter(Boolean),
  );
}

function matchesHintSet(agentHints: Set<string>, candidateHints: Set<string>): boolean {
  for (const hint of candidateHints) {
    if (agentHints.has(hint)) {
      return true;
    }
  }
  return false;
}

function collectNormalizedStrings(input: unknown, depth = 0): Set<string> {
  const values = new Set<string>();
  if (input == null || depth > 2) {
    return values;
  }
  if (typeof input === "string") {
    const normalized = normalizeToken(input);
    if (normalized) {
      values.add(normalized);
    }
    return values;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      for (const value of collectNormalizedStrings(item, depth + 1)) {
        values.add(value);
      }
    }
    return values;
  }
  if (typeof input === "object") {
    for (const value of Object.values(input as Record<string, unknown>)) {
      for (const nested of collectNormalizedStrings(value, depth + 1)) {
        values.add(nested);
      }
    }
  }
  return values;
}

function normalizeToken(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function deriveAgentUrgency(
  agent: AgentDirectoryRecord,
  pendingApprovalCount: number,
  latestEvent?: RealtimeEvent,
): LabAgent["urgency"] {
  if (pendingApprovalCount > 0) {
    return "critical";
  }
  if (agent.activeSessions > 0 || latestEvent?.eventType === "activity_logged") {
    return "active";
  }
  if (agent.sessionCount > 0 || latestEvent) {
    return "warning";
  }
  return "idle";
}

function urgencyScore(value: LabAgent["urgency"]): number {
  if (value === "critical") {
    return 4;
  }
  if (value === "active") {
    return 3;
  }
  if (value === "warning") {
    return 2;
  }
  return 1;
}

function describeAgentAction(
  agent: AgentDirectoryRecord,
  latestEvent: RealtimeEvent | undefined,
  pendingApprovalCount: number,
): string {
  if (pendingApprovalCount > 0) {
    return "Waiting on operator approval.";
  }
  if (latestEvent) {
    return describeEventDetail(latestEvent);
  }
  if (agent.activeSessions > 0) {
    return "Running a live session.";
  }
  if (agent.sessionCount > 0) {
    return "Available with prior session context.";
  }
  return "Standing by.";
}

function describeEventLabel(event: RealtimeEvent): string {
  if (event.eventType === "activity_logged") {
    return readFirstString(event.payload.activity, ["message", "label", "summary"]) ?? "Activity update";
  }
  if (event.eventType === "approval_created") {
    return "Approval entered the gatehouse";
  }
  if (event.eventType === "approval_resolved") {
    return "Approval was resolved";
  }
  if (event.eventType === "subagent_registered") {
    return "Specialist joined the floor";
  }
  return event.eventType.replace(/_/g, " ");
}

function describeEventDetail(event: RealtimeEvent): string {
  if (event.eventType === "activity_logged") {
    return readFirstString(event.payload.activity, ["message", "summary", "label"])
      ?? readFirstString(event.payload, ["message", "summary", "label"])
      ?? "Recorded task activity.";
  }
  if (event.eventType === "approval_created") {
    return `${readFirstString(event.payload, ["kind"]) ?? "Action"} is waiting for approval.`;
  }
  if (event.eventType === "approval_resolved") {
    return `${readFirstString(event.payload, ["decision", "status"]) ?? "Approval"} completed.`;
  }
  if (event.eventType === "session_event") {
    return readFirstString(event.payload, ["message", "summary", "event"])
      ?? "Session state changed.";
  }
  if (event.eventType === "subagent_registered" || event.eventType === "subagent_updated") {
    return readFirstString(event.payload, ["message", "summary", "label"])
      ?? "Subagent roster changed.";
  }
  return readFirstString(event.payload, ["message", "summary", "label"])
    ?? "Operator-visible event recorded.";
}

function readFirstString(input: unknown, keys: string[]): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function formatRelativeTime(timestamp: string): string {
  const deltaMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function mergeRealtimeEvents(current: RealtimeEvent[], incoming: RealtimeEvent[]): RealtimeEvent[] {
  const deduped = new Map<string, RealtimeEvent>();
  for (const event of [...incoming, ...current]) {
    deduped.set(event.eventId, event);
  }
  return [...deduped.values()]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, MAX_EVENT_COUNT);
}
