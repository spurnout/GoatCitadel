import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
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
import type {
  OfficeCollaborationEdge,
  OfficeDeskAgent,
  OfficeMotionMode,
  OfficeOperatorModel,
  OperatorPreset,
} from "../components/OfficeCanvas";
import { FieldHelp } from "../components/FieldHelp";
import { PageGuideCard } from "../components/PageGuideCard";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { SelectOrCustom } from "../components/SelectOrCustom";
import { StatusChip } from "../components/StatusChip";
import { CardSkeleton } from "../components/CardSkeleton";
import { pageCopy } from "../content/copy";
import { GCSelect } from "../components/ui";

const INITIAL_EVENT_LIMIT = 100;
const MAX_EVENTS = 200;
const SNAPSHOT_INTERVAL_MS = 20_000;
const HOT_AGENT_WINDOW_MS = 2 * 60 * 1000;
const WARM_AGENT_WINDOW_MS = 10 * 60 * 1000;
const EVENTS_PER_MINUTE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVITY_TRANSITION_WINDOW_MS = 18_000;
const OPERATOR_STORAGE_KEY = "goatcitadel.office.operator";
const OPERATOR_NAME_OPTIONS = [
  "GoatHerder",
  "Lead Herder",
  "Herd Captain",
  "Trail Commander",
].map((value) => ({ value, label: value }));

type AgentRisk = "none" | "approval" | "blocked" | "error";
type OfficeDockTab = "inspector" | "operators" | "approvals" | "rail";

interface OfficeAgentModel extends AgentDirectoryRecord {
  currentAction: string;
  currentThought: string;
  taskId?: string;
  sessionId?: string;
  lastSeenAt?: string;
  lastEventType?: string;
  risk: AgentRisk;
  eventTrail: RealtimeEvent[];
  activityState: OfficeDeskAgent["activityState"];
  collabPeers: string[];
}

interface OperatorPreferences {
  name: string;
  preset: OperatorPreset;
  layoutMode: "immersive";
  motionMode: OfficeMotionMode;
  showCollabOverlay: boolean;
  showInspectorDock: boolean;
  showRailDock: boolean;
  idleMillingEnabled: boolean;
  focusMode: boolean;
}

interface OfficeAssetPack {
  operatorModelPath?: string;
  goatModelPath?: string;
}

type SelectedEntityId = "operator" | string;

const DEFAULT_OPERATOR_PREFS: OperatorPreferences = {
  name: "GoatHerder",
  preset: "trailblazer",
  layoutMode: "immersive",
  motionMode: "cinematic",
  showCollabOverlay: true,
  showInspectorDock: true,
  showRailDock: true,
  idleMillingEnabled: true,
  focusMode: false,
};

const MOTION_MODE_OPTIONS: Array<{ value: OfficeMotionMode; label: string }> = [
  { value: "cinematic", label: "Cinematic" },
  { value: "balanced", label: "Balanced" },
  { value: "subtle", label: "Subtle" },
  { value: "reduced", label: "Reduced" },
];

const PRESET_OPTIONS: Array<{ value: OperatorPreset; label: string }> = [
  { value: "trailblazer", label: "Trailblazer" },
  { value: "strategist", label: "Strategist" },
  { value: "nightwatch", label: "Nightwatch" },
];

const PRESET_DETAILS: Record<OperatorPreset, {
  title: string;
  description: string;
  bestFor: string;
  swatchClass: string;
}> = {
  trailblazer: {
    title: "Trailblazer",
    description: "Warm palette with assertive leadership presence.",
    bestFor: "Best for high-tempo build and delivery sessions.",
    swatchClass: "preset-trailblazer",
  },
  strategist: {
    title: "Strategist",
    description: "Balanced palette with measured planning posture.",
    bestFor: "Best for architecture, sequencing, and roadmap sessions.",
    swatchClass: "preset-strategist",
  },
  nightwatch: {
    title: "Nightwatch",
    description: "Cool palette with observant command-center vibe.",
    bestFor: "Best for monitoring, triage, and long-running operations.",
    swatchClass: "preset-nightwatch",
  },
};

const OfficeCanvasScene = lazy(async () => {
  const module = await import("../components/OfficeCanvas");
  return { default: module.OfficeCanvas };
});

interface OfficeCanvasErrorBoundaryProps {
  children: ReactNode;
}

interface OfficeCanvasErrorBoundaryState {
  hasError: boolean;
}

class OfficeCanvasErrorBoundary extends Component<
  OfficeCanvasErrorBoundaryProps,
  OfficeCanvasErrorBoundaryState
> {
  public override state: OfficeCanvasErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): OfficeCanvasErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Keep the page interactive while isolating degraded WebGL or canvas render failures.
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="office-webgl-stage office-webgl-stage-v5 office-stage-loading">
          <p>Office scene failed to render. WebGL may be unavailable or blocked in this browser. Reload the page or reduce motion settings.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function OfficePage() {
  const [directory, setDirectory] = useState<AgentDirectoryRecord[]>([]);
  const [operators, setOperators] = useState<OperatorsResponse["items"]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalsResponse["items"]>([]);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<SelectedEntityId>("operator");
  const [operatorPrefs, setOperatorPrefs] = useState<OperatorPreferences>(readOperatorPreferences);
  const [assetPack, setAssetPack] = useState<OfficeAssetPack>({});
  const [dockTab, setDockTab] = useState<OfficeDockTab>("inspector");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamHealthy, setStreamHealthy] = useState(false);
  const streamHealthyRef = useRef(false);
  const snapshotResyncNeededRef = useRef(false);

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
      if (streamHealthyRef.current && !snapshotResyncNeededRef.current) {
        return;
      }
      snapshotResyncNeededRef.current = false;
      void loadSnapshot(false);
    }, SNAPSHOT_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        snapshotResyncNeededRef.current = false;
        void loadSnapshot(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const close = connectEventStream(
      (event) => {
        setEvents((prev) => sortEvents([event, ...prev]).slice(0, MAX_EVENTS));
      },
      (state) => {
        const healthy = state === "open";
        streamHealthyRef.current = healthy;
        setStreamHealthy(healthy);
        if (!healthy) {
          snapshotResyncNeededRef.current = true;
        }
      },
    );

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      close();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
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
  const collaborationEdges = useMemo(() => deriveCollaborationEdges(officeAgents), [officeAgents]);
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

  useEffect(() => {
    if (dockTab === "inspector" && operatorPrefs.showInspectorDock) {
      return;
    }
    if (dockTab !== "inspector" && operatorPrefs.showRailDock) {
      return;
    }
    if (operatorPrefs.showInspectorDock) {
      setDockTab("inspector");
      return;
    }
    if (operatorPrefs.showRailDock) {
      setDockTab("operators");
    }
  }, [dockTab, operatorPrefs.showInspectorDock, operatorPrefs.showRailDock]);

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

  const operatorActivityState: OfficeOperatorModel["activityState"] = useMemo(() => {
    if (activeAgents >= 3 || pendingApprovals.length > 0 || eventFlow >= 2.2) {
      return "command_center";
    }
    return "idle_patrol";
  }, [activeAgents, eventFlow, pendingApprovals.length]);

  const effectiveMotionMode: OfficeMotionMode = prefersReducedMotion ? "reduced" : operatorPrefs.motionMode;

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
    activityState: operatorActivityState,
  }), [
    activeAgents,
    blockedAgents,
    eventFlow,
    operatorActivityState,
    operatorPrefs.name,
    operatorPrefs.preset,
    pendingApprovals.length,
  ]);

  useEffect(() => {
    if (officeAgents.length === 0) {
      setSceneReady(false);
      return;
    }
    return scheduleSceneActivation(() => setSceneReady(true));
  }, [officeAgents.length]);

  const officeCopy = pageCopy.office;
  const officeGuide = officeCopy.guide ?? {
    what: "Live WebGL operations room for agent activity.",
    when: "Use this for real-time observability.",
    actions: [
      "Select the Goatherder or a desk.",
      "Inspect current doing/thinking state.",
      "Review collaboration flow and risk overlays.",
    ],
    terms: [
      { term: "Goatherder", meaning: "Central human operator coordinating the herd." },
      { term: "Signal", meaning: "Realtime event from gateway, tools, tasks, or approvals." },
    ],
  };
  const presetDetail = PRESET_DETAILS[operatorPrefs.preset];
  const availableDockTabs = useMemo(() => {
    const tabs: OfficeDockTab[] = [];
    if (operatorPrefs.showInspectorDock) {
      tabs.push("inspector");
    }
    if (operatorPrefs.showRailDock) {
      tabs.push("operators", "approvals", "rail");
    }
    return tabs;
  }, [operatorPrefs.showInspectorDock, operatorPrefs.showRailDock]);

  const renderInspectorPanel = () => {
    if (selectedEntityId === "operator") {
      return (
        <>
          <header className="office-agent-header">
            <div className="office-avatar office-avatar-hot">GH</div>
            <div>
              <h3>{operatorPrefs.name}</h3>
              <p className="office-agent-id">GoatHerder - Central Herd Operator</p>
            </div>
            <span className="office-pill office-pill-active">{operatorModel.activityState.replace("_", " ")}</span>
          </header>

          <p>Coordinates specialist goats, approvals, and live mission flow from the center desk.</p>
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

          <h4>Goatherder Preset</h4>
          <div className="office-preset-active">
            <span className={`office-preset-swatch ${presetDetail.swatchClass}`} aria-hidden="true" />
            <div>
              <p className="office-preset-title">{presetDetail.title}</p>
              <p className="office-preset-copy">{presetDetail.description}</p>
              <p className="office-preset-bestfor">{presetDetail.bestFor}</p>
            </div>
          </div>

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
          <FieldHelp>Use a preset name or switch to custom if you want the Goatherder identity to match the current mission theme.</FieldHelp>
          <div className="controls-row">
            <label htmlFor="goatHerderPreset">Style preset</label>
            <GCSelect
              id="goatHerderPreset"
              value={operatorPrefs.preset}
              onChange={(value) => setOperatorPrefs((prev) => ({
                ...prev,
                preset: value as OperatorPreset,
              }))}
              options={PRESET_OPTIONS}
            />
          </div>
          <FieldHelp>Presets adjust the Goatherder palette and scene mood without changing the underlying operator data.</FieldHelp>
          <div className="office-preset-grid">
            {(Object.entries(PRESET_DETAILS) as Array<[OperatorPreset, typeof PRESET_DETAILS[OperatorPreset]]>).map(([key, detail]) => (
              <article
                key={key}
                className={`office-preset-card ${operatorPrefs.preset === key ? "active" : ""}`}
              >
                <header>
                  <span className={`office-preset-swatch ${detail.swatchClass}`} aria-hidden="true" />
                  <strong>{detail.title}</strong>
                </header>
                <p>{detail.description}</p>
                <small>{detail.bestFor}</small>
              </article>
            ))}
          </div>
        </>
      );
    }

    if (!selectedAgent) {
      return <p>No goat selected.</p>;
    }

    return (
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
            <dt>State</dt>
            <dd>{selectedAgent.activityState.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Collaborators</dt>
            <dd>{selectedAgent.collabPeers.length > 0 ? selectedAgent.collabPeers.join(", ") : "-"}</dd>
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
    );
  };

  if (loading) {
    return (
      <section className="office-v5">
        <PageHeader eyebrow="Office" title={officeCopy.title} subtitle={officeCopy.subtitle} className="page-header-citadel" />
        <CardSkeleton lines={10} />
      </section>
    );
  }

  return (
    <section className={`office-v5 ${operatorPrefs.focusMode ? "office-focus-mode" : ""}`}>
      <PageHeader
        eyebrow="Office"
        title={officeCopy.title}
        subtitle={officeCopy.subtitle}
        hint="Herd HQ stays immersive. Use the dock and inspector to move between visual awareness and operational detail."
        className="page-header-citadel"
        actions={(
          <div className="office-page-actions">
            <StatusChip tone={streamHealthy ? "live" : "warning"}>
              Stream {streamHealthy ? "live" : "resyncing"}
            </StatusChip>
            <StatusChip tone={pendingApprovals.length > 0 ? "warning" : "muted"}>
              {pendingApprovals.length} approvals
            </StatusChip>
            <StatusChip tone={blockedAgents > 0 ? "critical" : "success"}>
              {blockedAgents} blocked
            </StatusChip>
          </div>
        )}
      />
      <PageGuideCard
        pageId="office"
        what={officeGuide.what}
        when={officeGuide.when}
        actions={officeGuide.actions}
        terms={officeGuide.terms}
      />
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
          <p className="office-kpi-note">{pendingApprovals.length} approvals pending · stream {streamHealthy ? "live" : "syncing"}</p>
        </article>
      </div>

      <div className={`office-v5-workspace${operatorPrefs.showInspectorDock || operatorPrefs.showRailDock ? "" : " office-v5-workspace-single"}`}>
        <Panel
          className="office-stage-panel"
          padding="spacious"
          title="Immersive Command Stage"
          subtitle="Drag to orbit, click the Goatherder or any desk, and watch live collaboration flow."
          actions={(
            <div className="office-stage-statuses">
              <StatusChip tone={sceneReady ? "success" : "muted"}>{sceneReady ? "Scene ready" : "Scene warming up"}</StatusChip>
              <StatusChip tone={operatorPrefs.showCollabOverlay ? "live" : "muted"}>
                {operatorPrefs.showCollabOverlay ? "Flow visible" : "Flow hidden"}
              </StatusChip>
            </div>
          )}
        >
          <div className="office-stage-toolbar">
            <div className="office-stage-toolbar-group office-stage-toolbar-motion">
              <label htmlFor="officeMotionMode">Motion</label>
              <GCSelect
                id="officeMotionMode"
                value={effectiveMotionMode}
                disabled={prefersReducedMotion}
                onChange={(value) => setOperatorPrefs((prev) => ({
                  ...prev,
                  motionMode: value as OfficeMotionMode,
                }))}
                options={MOTION_MODE_OPTIONS}
              />
              <FieldHelp>
                Use reduced or subtle motion for longer monitoring sessions. Reduced-motion system settings take priority.
              </FieldHelp>
            </div>
            <div className="office-stage-toolbar-group office-stage-toolbar-toggles">
              <div className="office-toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={operatorPrefs.showCollabOverlay}
                    onChange={(event) => setOperatorPrefs((prev) => ({
                      ...prev,
                      showCollabOverlay: event.target.checked,
                    }))}
                  />
                  Collaboration Flow
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={operatorPrefs.idleMillingEnabled}
                    onChange={(event) => setOperatorPrefs((prev) => ({
                      ...prev,
                      idleMillingEnabled: event.target.checked,
                    }))}
                  />
                  Idle Milling
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={operatorPrefs.showInspectorDock}
                    onChange={(event) => setOperatorPrefs((prev) => ({
                      ...prev,
                      showInspectorDock: event.target.checked,
                    }))}
                  />
                  Show Inspector
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={operatorPrefs.showRailDock}
                    onChange={(event) => setOperatorPrefs((prev) => ({
                      ...prev,
                      showRailDock: event.target.checked,
                    }))}
                  />
                  Show Rail
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={operatorPrefs.focusMode}
                    onChange={(event) => setOperatorPrefs((prev) => ({
                      ...prev,
                      focusMode: event.target.checked,
                    }))}
                  />
                  Focus Mode
                </label>
              </div>
              <FieldHelp>
                Inspector keeps entity detail in view. Rail keeps operators, approvals, and the live event stream docked beside the scene.
              </FieldHelp>
            </div>
          </div>

          {officeAgents.length === 0 ? (
            <div className="gc-empty-state office-empty-state">
              <p className="gc-empty-title">No agent roles are available yet.</p>
              <p className="gc-empty-subtitle">When the herd is configured, desks will appear here and the Office scene will light up.</p>
            </div>
          ) : (
            <>
              <OfficeCanvasErrorBoundary>
                {sceneReady ? (
                  <Suspense
                    fallback={(
                      <div className="office-webgl-stage office-webgl-stage-v5 office-stage-loading">
                        <p>Loading office scene...</p>
                      </div>
                    )}
                  >
                    <OfficeCanvasScene
                      operator={operatorModel}
                      agents={officeAgents}
                      selectedEntityId={selectedEntityId}
                      onSelect={(entityId) => setSelectedEntityId(entityId as SelectedEntityId)}
                      assetPack={assetPack}
                      motionMode={effectiveMotionMode}
                      showCollabOverlay={operatorPrefs.showCollabOverlay}
                      idleMillingEnabled={operatorPrefs.idleMillingEnabled}
                      collaborationEdges={collaborationEdges}
                    />
                  </Suspense>
                ) : (
                  <div className="office-webgl-stage office-webgl-stage-v5 office-stage-loading">
                    <p>Loading office scene...</p>
                  </div>
                )}
              </OfficeCanvasErrorBoundary>
              <FieldHelp className="office-stage-help">
                Click the Goatherder or any desk to inspect the operator, recent signals, collaboration edges, and risk state without leaving the scene.
              </FieldHelp>
              <div className="office-desk-list">
                <button type="button"
                  className={selectedEntityId === "operator" ? "active" : ""}
                  onClick={() => setSelectedEntityId("operator")}
                >
                  {operatorPrefs.name}
                </button>
                {officeAgents.map((agent) => (
                  <button type="button"
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
        </Panel>

        {(operatorPrefs.showInspectorDock || operatorPrefs.showRailDock) ? (
          <Panel
            className="office-dock-panel"
            padding="default"
            title="Operations Dock"
            subtitle="Keep inspection, approvals, operators, and live signals beside the command stage."
            actions={(
              <div className="office-dock-tabs">
                {availableDockTabs.map((tab) => (
                  <button type="button"
                    key={tab}
                    className={dockTab === tab ? "active" : ""}
                    onClick={() => setDockTab(tab)}
                  >
                    {tab === "inspector" && "Inspector"}
                    {tab === "operators" && "Operators"}
                    {tab === "approvals" && "Approvals"}
                    {tab === "rail" && "Live Rail"}
                  </button>
                ))}
              </div>
            )}
          >
            <div className="office-dock-body">
              {dockTab === "inspector" ? renderInspectorPanel() : null}

              {dockTab === "operators" ? (
                <>
                  <FieldHelp>Operator view summarizes session pressure and who has been active most recently.</FieldHelp>
                  <ul className="compact-list">
                    {operators.map((operator) => (
                      <li key={operator.operatorId}>
                        <strong>{operator.operatorId}</strong>
                        <p>{operator.activeSessions} active / {operator.sessionCount} total sessions</p>
                        <small>Last activity {formatRelative(operator.lastActivityAt)}</small>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {dockTab === "approvals" ? (
                <>
                  <FieldHelp>Pending approvals surface the highest-friction work still waiting on human review.</FieldHelp>
                  <ul className="compact-list">
                    {pendingApprovals.length === 0 ? <li>No pending approvals.</li> : pendingApprovals.slice(0, 10).map((approval) => (
                      <li key={approval.approvalId}>
                        <strong>{approval.kind}</strong>
                        <p>{approval.riskLevel} - {approval.status}</p>
                        <small>{formatRelative(approval.createdAt)}</small>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {dockTab === "rail" ? (
                <>
                  <FieldHelp>Live rail is the real-time signal feed. Use it to correlate motion in the scene with gateway and tool activity.</FieldHelp>
                  <ul className="compact-list">
                    {sortedEvents.length === 0 ? <li>No live events yet.</li> : sortedEvents.slice(0, 12).map((event) => (
                      <li key={event.eventId}>
                        <strong>{event.eventType}</strong>
                        <p>{summarizeEvent(event)}</p>
                        <small>{formatClock(event.timestamp)} - {event.source}</small>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <footer className="office-collab-legend">
              <span><b>Beam</b> active collaboration</span>
              <span><b>Pulse</b> handoff in progress</span>
              <span><b>Red hold</b> blocked or approval risk</span>
            </footer>
          </Panel>
        ) : (
          <Panel className="office-dock-panel" tone="soft" title="Operations Dock Hidden" subtitle="The scene is still live, but the side dock is disabled right now.">
            <FieldHelp>Enable either Inspector or Rail above to restore the side dock and keep entity detail beside the scene.</FieldHelp>
          </Panel>
        )}
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
      activityState: "idle_milling",
      collabPeers: [],
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

  const agents = [...byRole.values()];
  const byTask = new Map<string, string[]>();
  const bySession = new Map<string, string[]>();
  for (const agent of agents) {
    if (agent.taskId) {
      const list = byTask.get(agent.taskId) ?? [];
      list.push(agent.roleId);
      byTask.set(agent.taskId, list);
    }
    if (agent.sessionId) {
      const list = bySession.get(agent.sessionId) ?? [];
      list.push(agent.roleId);
      bySession.set(agent.sessionId, list);
    }
  }

  const peersByRole = new Map<string, Set<string>>();
  const linkGroup = (group: string[]) => {
    if (group.length < 2) {
      return;
    }
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const left = group[i]!;
        const right = group[j]!;
        const leftPeers = peersByRole.get(left) ?? new Set<string>();
        leftPeers.add(right);
        peersByRole.set(left, leftPeers);

        const rightPeers = peersByRole.get(right) ?? new Set<string>();
        rightPeers.add(left);
        peersByRole.set(right, rightPeers);
      }
    }
  };

  byTask.forEach(linkGroup);
  bySession.forEach(linkGroup);

  const now = Date.now();
  for (const agent of agents) {
    const ageMs = now - parseTimestamp(agent.lastSeenAt);
    const peers = [...(peersByRole.get(agent.roleId) ?? [])].sort();
    agent.collabPeers = peers;

    if (agent.status === "active") {
      agent.activityState = ageMs <= ACTIVITY_TRANSITION_WINDOW_MS
        ? "transitioning_to_desk"
        : "working_seated";
    } else {
      agent.activityState = "idle_milling";
    }

    if (peers.length > 0 && (agent.status === "active" || agent.risk !== "none")) {
      agent.activityState = "collaborating";
    }
  }

  return agents.sort((left, right) => {
    const statusDelta = statusScore(right.status) - statusScore(left.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return parseTimestamp(right.lastSeenAt) - parseTimestamp(left.lastSeenAt);
  });
}

function deriveCollaborationEdges(agents: OfficeAgentModel[]): OfficeCollaborationEdge[] {
  const byRole = new Map(agents.map((agent) => [agent.roleId, agent]));
  const edgeMap = new Map<string, OfficeCollaborationEdge>();

  for (const agent of agents) {
    if (agent.collabPeers.length === 0) {
      continue;
    }
    for (const peerRoleId of agent.collabPeers) {
      if (peerRoleId === agent.roleId) {
        continue;
      }
      const peer = byRole.get(peerRoleId);
      if (!peer) {
        continue;
      }
      const risk = agent.risk !== "none" || peer.risk !== "none";
      const key = `${agent.roleId}->${peerRoleId}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.strength = Math.min(3, existing.strength + 0.4);
        existing.risk = existing.risk || risk;
        continue;
      }
      edgeMap.set(key, {
        fromRoleId: agent.roleId,
        toRoleId: peerRoleId,
        strength: 1,
        risk,
      });
    }
  }

  return [...edgeMap.values()].sort((left, right) => {
    if (left.risk !== right.risk) {
      return left.risk ? -1 : 1;
    }
    return right.strength - left.strength;
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

function scheduleSceneActivation(callback: () => void): () => void {
  if (typeof window === "undefined") {
    callback();
    return () => undefined;
  }
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 250 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 120);
  return () => window.clearTimeout(handle);
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
    return { ...DEFAULT_OPERATOR_PREFS };
  }

  try {
    const raw = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_OPERATOR_PREFS };
    }
    const parsed = JSON.parse(raw) as Partial<OperatorPreferences>;
    return {
      name: sanitizeName(parsed.name) || DEFAULT_OPERATOR_PREFS.name,
      preset: isPreset(parsed.preset) ? parsed.preset : DEFAULT_OPERATOR_PREFS.preset,
      layoutMode: "immersive",
      motionMode: isMotionMode(parsed.motionMode) ? parsed.motionMode : DEFAULT_OPERATOR_PREFS.motionMode,
      showCollabOverlay: asBoolean(parsed.showCollabOverlay, DEFAULT_OPERATOR_PREFS.showCollabOverlay),
      showInspectorDock: asBoolean(parsed.showInspectorDock, DEFAULT_OPERATOR_PREFS.showInspectorDock),
      showRailDock: asBoolean(parsed.showRailDock, DEFAULT_OPERATOR_PREFS.showRailDock),
      idleMillingEnabled: asBoolean(parsed.idleMillingEnabled, DEFAULT_OPERATOR_PREFS.idleMillingEnabled),
      focusMode: asBoolean(parsed.focusMode, DEFAULT_OPERATOR_PREFS.focusMode),
    };
  } catch {
    return { ...DEFAULT_OPERATOR_PREFS };
  }
}

function persistOperatorPreferences(value: OperatorPreferences): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload: OperatorPreferences = {
    name: sanitizeName(value.name) || DEFAULT_OPERATOR_PREFS.name,
    preset: isPreset(value.preset) ? value.preset : DEFAULT_OPERATOR_PREFS.preset,
    layoutMode: "immersive",
    motionMode: isMotionMode(value.motionMode) ? value.motionMode : DEFAULT_OPERATOR_PREFS.motionMode,
    showCollabOverlay: value.showCollabOverlay,
    showInspectorDock: value.showInspectorDock,
    showRailDock: value.showRailDock,
    idleMillingEnabled: value.idleMillingEnabled,
    focusMode: value.focusMode,
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

function isMotionMode(value: unknown): value is OfficeMotionMode {
  return value === "cinematic" || value === "balanced" || value === "subtle" || value === "reduced";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

