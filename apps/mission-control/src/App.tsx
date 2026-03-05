import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  connectEventStream,
  fetchWorkspaces,
  fetchOnboardingState,
  type EventStreamConnectionState,
  type EventStreamStatus,
  type RealtimeEvent,
} from "./api/client";
import { DashboardPage } from "./pages/DashboardPage";
import { SystemPage } from "./pages/SystemPage";
import { FilesPage } from "./pages/FilesPage";
import { MemoryPage } from "./pages/MemoryPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ActivityPage } from "./pages/ActivityPage";
import { CronPage } from "./pages/CronPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ChatPage } from "./pages/ChatPage";
import { PromptLabPage } from "./pages/PromptLabPage";
import { ImprovementPage } from "./pages/ImprovementPage";
import { SkillsPage } from "./pages/SkillsPage";
import { CostConsolePage } from "./pages/CostConsolePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { TasksPage } from "./pages/TasksPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { McpPage } from "./pages/McpPage";
import { MeshPage } from "./pages/MeshPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { NpuPage } from "./pages/NpuPage";
import { WorkspacesPage } from "./pages/WorkspacesPage";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalFreshnessPill } from "./components/GlobalFreshnessPill";
import { HelpHint } from "./components/HelpHint";
import { NotificationStack, type NotificationItem } from "./components/NotificationStack";
import { ClockBadge } from "./components/ClockBadge";
import { appCopy } from "./content/copy";
import { emitRefresh, type RefreshTopic } from "./state/refresh-bus";
import { useUiPreferences } from "./state/ui-preferences";
import { GCSelect, GCSwitch } from "./components/ui";

const OfficePage = lazy(async () => {
  const module = await import("./pages/OfficePage");
  return { default: module.OfficePage };
});

type Tab =
  | "onboarding"
  | "dashboard"
  | "system"
  | "files"
  | "memory"
  | "agents"
  | "office"
  | "activity"
  | "cron"
  | "sessions"
  | "chat"
  | "promptLab"
  | "improvement"
  | "skills"
  | "costs"
  | "settings"
  | "workspaces"
  | "tools"
  | "approvals"
  | "tasks"
  | "integrations"
  | "mcp"
  | "mesh"
  | "npu";

const allTabs: Tab[] = [
  "onboarding",
  "dashboard",
  "system",
  "files",
  "memory",
  "agents",
  "office",
  "activity",
  "cron",
  "sessions",
  "chat",
  "promptLab",
  "improvement",
  "skills",
  "costs",
  "settings",
  "workspaces",
  "tools",
  "approvals",
  "tasks",
  "integrations",
  "mcp",
  "mesh",
  "npu",
];

const navItems: Array<{ id: Tab; label: string; code: string }> = appCopy.navItems;

const navSections: Array<{ label: string; items: Tab[] }> = appCopy.navSections;

const nextStepByTab: Record<Tab, string> = appCopy.nextStepByTab;

const refreshTopicRules: Array<{ topic: RefreshTopic; keywords: string[] }> = [
  { topic: "dashboard", keywords: ["dashboard", "operator", "summit", "cron", "memory", "settings", "system"] },
  { topic: "promptLab", keywords: ["prompt_pack", "promptlab", "prompt_lab", "prompt-pack"] },
  { topic: "chat", keywords: ["chat", "message", "session", "delegate", "proactive", "learned_memory"] },
  { topic: "approvals", keywords: ["approval", "gatehouse"] },
  { topic: "tools", keywords: ["tool", "grant", "policy"] },
  { topic: "files", keywords: ["file", "artifact", "workspace"] },
  { topic: "memory", keywords: ["memory", "qmd", "context"] },
  { topic: "agents", keywords: ["agent", "goat", "herd"] },
  { topic: "skills", keywords: ["skill", "bankr"] },
  { topic: "mcp", keywords: ["mcp"] },
  { topic: "tasks", keywords: ["task", "trailboard"] },
  { topic: "improvement", keywords: ["improvement", "replay", "autotune", "self_improvement"] },
  { topic: "integrations", keywords: ["integration", "plugin", "connection"] },
  { topic: "npu", keywords: ["npu", "runtime", "sidecar", "model", "voice"] },
];

function deriveRefreshTopics(event: RealtimeEvent): RefreshTopic[] {
  const haystack = `${event.eventType} ${event.source}`.toLowerCase();
  const topics = new Set<RefreshTopic>();

  for (const rule of refreshTopicRules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      topics.add(rule.topic);
    }
  }

  if (topics.size === 0) {
    topics.add("system");
  }

  return [...topics];
}

function isTab(value: string | null): value is Tab {
  if (!value) {
    return false;
  }
  return allTabs.some((tab) => tab === value);
}

function readTabFromLocation(): Tab {
  if (typeof window === "undefined") {
    return "dashboard";
  }

  const url = new URL(window.location.href);
  const queryTab = url.searchParams.get("tab");
  if (isTab(queryTab)) {
    return queryTab;
  }

  const hashTab = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (isTab(hashTab)) {
    return hashTab;
  }

  return "dashboard";
}

export function App() {
  const {
    mode: uiMode,
    setMode: setUiMode,
    showTechnicalDetails,
    setShowTechnicalDetails,
    activeWorkspaceId,
    setActiveWorkspaceId,
  } = useUiPreferences();
  const [tab, setTab] = useState<Tab>(() => readTabFromLocation());
  const refreshKey = 0;
  const [streamState, setStreamState] = useState<EventStreamConnectionState>("connecting");
  const [streamStatus, setStreamStatus] = useState<EventStreamStatus>({
    state: "connecting",
    reconnectAttempts: 0,
  });
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showBrandMark, setShowBrandMark] = useState(true);
  const [showBrandWordmark, setShowBrandWordmark] = useState(true);
  const [workspaceOptions, setWorkspaceOptions] = useState<Array<{ workspaceId: string; name: string }>>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const loadWorkspaceOptions = useCallback(async () => {
    try {
      const response = await fetchWorkspaces("all", 400);
      setWorkspaceOptions(response.items.map((item) => ({
        workspaceId: item.workspaceId,
        name: item.name,
      })));
    } catch {
      setWorkspaceOptions([]);
    }
  }, []);

  const pushNotification = useCallback((tone: NotificationItem["tone"], message: string) => {
    setNotifications((current) => {
      const item: NotificationItem = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tone,
        message,
        timestamp: Date.now(),
      };
      return [item, ...current].slice(0, 6);
    });
  }, []);

  const handleOnboardingCompleted = useCallback(() => {
    setOnboardingComplete(true);
    setTab("dashboard");
    void loadWorkspaceOptions();
  }, [loadWorkspaceOptions]);

  useEffect(() => {
    const close = connectEventStream(
      (event) => {
        const topics = deriveRefreshTopics(event);
        for (const topic of topics) {
          emitRefresh(topic, {
            reason: event.eventType,
            source: event.source,
            eventType: event.eventType,
            eventId: event.eventId,
            timestamp: Date.now(),
          });
        }
      },
      (nextState) => {
        setStreamState(nextState);
        if (nextState === "error") {
          pushNotification("warning", "Live updates degraded. GoatCitadel is reconnecting.");
        }
        if (nextState === "open") {
          pushNotification("success", "Live updates connected.");
        }
      },
      setStreamStatus,
    );

    return () => {
      close();
    };
  }, [pushNotification]);

  useEffect(() => {
    let cancelled = false;
    void fetchOnboardingState()
      .then((state) => {
        if (cancelled) {
          return;
        }
        setOnboardingComplete(state.completed);
        if (!state.completed) {
          setTab((current) => (current === "dashboard" ? "onboarding" : current));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnboardingComplete(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadWorkspaceOptions();
  }, [loadWorkspaceOptions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [tab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navById = useMemo(() => new Map(navItems.map((item) => [item.id, item])), []);
  const activeNav = navById.get(tab);
  const commandItems = useMemo(
    () =>
      navItems.map((item) => ({
        id: `tab:${item.id}`,
        label: `Go to ${item.label}`,
        keywords: [item.id, item.code],
        run: () => setTab(item.id),
      })),
    [],
  );

  const content = useMemo(() => {
    if (tab === "onboarding") {
      return <OnboardingPage onCompleted={handleOnboardingCompleted} />;
    }
    if (tab === "dashboard") {
      return <DashboardPage refreshKey={refreshKey} onNavigate={(next) => setTab(next as Tab)} />;
    }
    if (tab === "system") {
      return <SystemPage refreshKey={refreshKey} />;
    }
    if (tab === "files") {
      return <FilesPage refreshKey={refreshKey} workspaceId={activeWorkspaceId} />;
    }
    if (tab === "memory") {
      return <MemoryPage refreshKey={refreshKey} workspaceId={activeWorkspaceId} />;
    }
    if (tab === "agents") {
      return <AgentsPage refreshKey={refreshKey} />;
    }
    if (tab === "office") {
      return (
        <Suspense fallback={<p>Loading Herd HQ...</p>}>
          <OfficePage refreshKey={refreshKey} />
        </Suspense>
      );
    }
    if (tab === "activity") {
      return <ActivityPage />;
    }
    if (tab === "cron") {
      return <CronPage refreshKey={refreshKey} />;
    }
    if (tab === "sessions") {
      return <SessionsPage refreshKey={refreshKey} />;
    }
    if (tab === "chat") {
      return <ChatPage refreshKey={refreshKey} workspaceId={activeWorkspaceId} />;
    }
    if (tab === "promptLab") {
      return <PromptLabPage refreshKey={refreshKey} workspaceId={activeWorkspaceId} />;
    }
    if (tab === "improvement") {
      return <ImprovementPage refreshKey={refreshKey} workspaceId={activeWorkspaceId} />;
    }
    if (tab === "skills") {
      return <SkillsPage refreshKey={refreshKey} />;
    }
    if (tab === "costs") {
      return <CostConsolePage refreshKey={refreshKey} />;
    }
    if (tab === "settings") {
      return <SettingsPage refreshKey={refreshKey} />;
    }
    if (tab === "workspaces") {
      return (
        <WorkspacesPage
          refreshKey={refreshKey}
          activeWorkspaceId={activeWorkspaceId}
          onWorkspaceChange={setActiveWorkspaceId}
        />
      );
    }
    if (tab === "tools") {
      return <ToolsPage refreshKey={refreshKey} />;
    }
    if (tab === "approvals") {
      return <ApprovalsPage refreshKey={refreshKey} />;
    }
    if (tab === "tasks") {
      return <TasksPage refreshKey={refreshKey} workspaceId={activeWorkspaceId} />;
    }
    if (tab === "mesh") {
      return <MeshPage refreshKey={refreshKey} />;
    }
    if (tab === "mcp") {
      return <McpPage refreshKey={refreshKey} />;
    }
    if (tab === "npu") {
      return <NpuPage refreshKey={refreshKey} />;
    }
    return <IntegrationsPage refreshKey={refreshKey} />;
  }, [activeWorkspaceId, refreshKey, tab, handleOnboardingCompleted, setActiveWorkspaceId]);

  return (
    <div
      className={`layout-shell ui-mode-${uiMode}${showTechnicalDetails ? "" : " ui-hide-technical"}`}
    >
      <aside className="sidebar">
        <div className="sidebar-brand">
          {showBrandMark ? (
            <img
              src="/brand/goatcitadel-mark.png"
              alt="GoatCitadel mark"
              className="sidebar-brand-mark"
              onError={() => setShowBrandMark(false)}
            />
          ) : null}
          <div className="sidebar-brand-copy">
            {showBrandWordmark ? (
              <img
                src="/brand/goatcitadel-wordmark.png"
                alt="GoatCitadel"
                className="sidebar-brand-wordmark"
                onError={() => setShowBrandWordmark(false)}
              />
            ) : <h1>{appCopy.brandTitle}</h1>}
            <p className="sidebar-subtitle">{appCopy.brandSubtitle}</p>
          </div>
        </div>
        <button type="button" onClick={() => setPaletteOpen(true)}>{appCopy.quickActionsButton}</button>
        <nav>
          {navSections.map((section) => (
            <div key={section.label} className="sidebar-section">
              <h4>{section.label}</h4>
              {section.items.map((tabId) => {
                const item = navById.get(tabId);
                if (!item) {
                  return null;
                }
                return (
                  <button type="button"
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={tab === item.id ? "active" : ""}
                  >
                    <span className="nav-code">{item.code}</span>
                    <span className="nav-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <p className={`stream-pill ${streamStatus.state}`}>
            {appCopy.sidebar.stream} {streamStatus.state}
          </p>
          <p>{appCopy.sidebar.stream}: {streamState}</p>
          <p>
            {appCopy.sidebar.onboarding}: {
              onboardingComplete === null
                ? appCopy.sidebar.unknown
                : onboardingComplete
                  ? appCopy.sidebar.complete
                  : appCopy.sidebar.required
            }
          </p>
          <p>{appCopy.sidebar.reconnects}: {streamStatus.reconnectAttempts}</p>
          <p>
            {appCopy.sidebar.lastEvent}: {
              streamStatus.lastEventAt
                ? new Date(streamStatus.lastEventAt).toLocaleTimeString()
                : appCopy.sidebar.notAvailable
            }
          </p>
          <p>{appCopy.sidebar.mode}: {appCopy.sidebar.localMode}</p>
          <ClockBadge />
        </footer>
      </aside>
      <main className="content">
        <header className="app-topbar card">
          <div>
            <h3>{activeNav?.label ?? "Mission Control"}</h3>
            <p className="office-subtitle">{nextStepByTab[tab]}</p>
          </div>
          <div className="app-topbar-actions">
            <div className="ui-experience-switch">
              <span>Experience</span>
              <button
                type="button"
                className={uiMode === "simple" ? "active" : ""}
                onClick={() => setUiMode("simple")}
              >
                Simple
              </button>
              <button
                type="button"
                className={uiMode === "advanced" ? "active" : ""}
                onClick={() => setUiMode("advanced")}
              >
                Advanced
              </button>
            </div>
            <span className="ui-experience-note">
              {uiMode === "simple" ? "Guided defaults" : "Full controls"}
            </span>
            <label className="ui-technical-toggle">
              <GCSwitch
                checked={showTechnicalDetails}
                onCheckedChange={setShowTechnicalDetails}
                label="Technical details"
              />
            </label>
            <label className="ui-technical-toggle">
              Workspace
              <GCSelect
                value={activeWorkspaceId}
                onChange={setActiveWorkspaceId}
                options={[...workspaceOptions, { workspaceId: activeWorkspaceId, name: activeWorkspaceId }]
                  .filter((item, index, arr) => arr.findIndex((other) => other.workspaceId === item.workspaceId) === index)
                  .map((item) => ({ value: item.workspaceId, label: item.name }))}
              />
            </label>
            <GlobalFreshnessPill streamState={streamState} streamStatus={streamStatus} />
            <button type="button" onClick={() => setPaletteOpen(true)}>Quick Actions</button>
          </div>
        </header>
        {streamState === "error" || streamState === "closed" ? (
          <div className="status-banner warning">
            {appCopy.streamBanner.replace("{state}", streamState)}
          </div>
        ) : null}
        <article className="card content-next-step">
          <h3>{appCopy.nextStepTitle}</h3>
          <p className="office-subtitle">{nextStepByTab[tab]}</p>
          <HelpHint label="Next step help" text="This hint is contextual to the current tab and keeps page headers compact." />
        </article>
        {content}
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={commandItems}
      />
      <NotificationStack
        items={notifications}
        onDismiss={(id) => setNotifications((current) => current.filter((item) => item.id !== id))}
      />
    </div>
  );
}

