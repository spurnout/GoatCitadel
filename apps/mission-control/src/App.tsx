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
import { AddonsPage } from "./pages/AddonsPage";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalFreshnessPill } from "./components/GlobalFreshnessPill";
import { HelpHint } from "./components/HelpHint";
import { NotificationStack, type NotificationItem } from "./components/NotificationStack";
import { ClockBadge } from "./components/ClockBadge";
import { ShellActionGroup } from "./components/ShellActionGroup";
import { StatusChip } from "./components/StatusChip";
import { appCopy } from "./content/copy";
import { emitRefresh, type RefreshTopic } from "./state/refresh-bus";
import { useUiPreferences } from "./state/ui-preferences";
import { GCSelect, GCSwitch } from "./components/ui";

const OfficePage = lazy(async () => {
  const module = await import("./pages/OfficePage");
  return { default: module.OfficePage };
});

type Tab =
  | "addons"
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
  "addons",
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
  { topic: "dashboard", keywords: ["dashboard", "operator", "summit", "cron", "memory", "settings", "system", "onboarding", "llm"] },
  { topic: "promptLab", keywords: ["prompt_pack", "promptlab", "prompt_lab", "prompt-pack"] },
  { topic: "chat", keywords: ["chat", "message", "session", "delegate", "proactive", "learned_memory", "llm", "provider", "model", "onboarding", "settings"] },
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
  { topic: "npu", keywords: ["npu", "runtime", "sidecar", "model", "voice", "llm", "provider"] },
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
    density,
    setDensity,
    showTechnicalDetails,
    setShowTechnicalDetails,
    activeWorkspaceId,
    setActiveWorkspaceId,
  } = useUiPreferences();
  const [tab, setTab] = useState<Tab>(() => readTabFromLocation());
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
    () => [
      ...navItems.map((item) => ({
        id: `tab:${item.id}`,
        label: `Go to ${item.label}`,
        keywords: [item.id, item.code],
        run: () => setTab(item.id),
      })),
      {
        id: "mode:simple",
        label: "Switch to Simple experience",
        keywords: ["simple", "guided", "experience"],
        run: () => setUiMode("simple"),
      },
      {
        id: "mode:advanced",
        label: "Switch to Advanced experience",
        keywords: ["advanced", "full controls", "experience"],
        run: () => setUiMode("advanced"),
      },
      {
        id: "density:compact",
        label: "Use Compact density",
        keywords: ["compact", "density", "layout"],
        run: () => setDensity("compact"),
      },
      {
        id: "density:default",
        label: "Use Default density",
        keywords: ["default", "density", "layout"],
        run: () => setDensity("default"),
      },
      {
        id: "density:comfortable",
        label: "Use Comfortable density",
        keywords: ["comfortable", "density", "layout"],
        run: () => setDensity("comfortable"),
      },
      {
        id: "details:toggle",
        label: showTechnicalDetails ? "Hide technical details" : "Show technical details",
        keywords: ["technical", "details", "debug"],
        run: () => setShowTechnicalDetails(!showTechnicalDetails),
      },
    ],
    [setDensity, setShowTechnicalDetails, setUiMode, showTechnicalDetails],
  );

  const content = useMemo(() => {
    if (tab === "addons") {
      return <AddonsPage />;
    }
    if (tab === "onboarding") {
      return <OnboardingPage onCompleted={handleOnboardingCompleted} />;
    }
    if (tab === "dashboard") {
      return <DashboardPage onNavigate={(next) => setTab(next as Tab)} />;
    }
    if (tab === "system") {
      return <SystemPage />;
    }
    if (tab === "files") {
      return <FilesPage workspaceId={activeWorkspaceId} />;
    }
    if (tab === "memory") {
      return <MemoryPage workspaceId={activeWorkspaceId} />;
    }
    if (tab === "agents") {
      return <AgentsPage />;
    }
    if (tab === "office") {
      return (
        <Suspense fallback={<p>Loading Herd HQ...</p>}>
          <OfficePage />
        </Suspense>
      );
    }
    if (tab === "activity") {
      return <ActivityPage />;
    }
    if (tab === "cron") {
      return <CronPage />;
    }
    if (tab === "sessions") {
      return <SessionsPage />;
    }
    if (tab === "chat") {
      return <ChatPage workspaceId={activeWorkspaceId} />;
    }
    if (tab === "promptLab") {
      return <PromptLabPage workspaceId={activeWorkspaceId} />;
    }
    if (tab === "improvement") {
      return <ImprovementPage workspaceId={activeWorkspaceId} />;
    }
    if (tab === "skills") {
      return <SkillsPage />;
    }
    if (tab === "costs") {
      return <CostConsolePage />;
    }
    if (tab === "settings") {
      return <SettingsPage />;
    }
    if (tab === "workspaces") {
      return (
        <WorkspacesPage
          activeWorkspaceId={activeWorkspaceId}
          onWorkspaceChange={setActiveWorkspaceId}
        />
      );
    }
    if (tab === "tools") {
      return <ToolsPage />;
    }
    if (tab === "approvals") {
      return <ApprovalsPage />;
    }
    if (tab === "tasks") {
      return <TasksPage workspaceId={activeWorkspaceId} />;
    }
    if (tab === "mesh") {
      return <MeshPage />;
    }
    if (tab === "mcp") {
      return <McpPage />;
    }
    if (tab === "npu") {
      return <NpuPage />;
    }
    return <IntegrationsPage />;
  }, [activeWorkspaceId, tab, handleOnboardingCompleted, setActiveWorkspaceId]);

  return (
    <div
      className={`layout-shell theme-obsidian-crimson ui-mode-${uiMode} ui-density-${density}${showTechnicalDetails ? "" : " ui-hide-technical"}`}
      data-density={density}
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
        <button type="button" className="sidebar-command-trigger" onClick={() => setPaletteOpen(true)}>
          {appCopy.quickActionsButton}
        </button>
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.label} className="sidebar-section">
              <div className="sidebar-section-head">
                <p>{section.label}</p>
              </div>
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
          <div className="sidebar-footer-grid">
            <div className="sidebar-footer-item">
              <span className="sidebar-footer-label">{appCopy.sidebar.stream}</span>
              <StatusChip tone={streamStatus.state === "open" ? "live" : streamStatus.state === "error" ? "critical" : "warning"}>
                {streamState}
              </StatusChip>
            </div>
            <div className="sidebar-footer-item">
              <span className="sidebar-footer-label">{appCopy.sidebar.onboarding}</span>
              <span className="sidebar-footer-value">
                {onboardingComplete === null
                  ? appCopy.sidebar.unknown
                  : onboardingComplete
                    ? appCopy.sidebar.complete
                    : appCopy.sidebar.required}
              </span>
            </div>
            <div className="sidebar-footer-item">
              <span className="sidebar-footer-label">{appCopy.sidebar.reconnects}</span>
              <span className="sidebar-footer-value">{streamStatus.reconnectAttempts}</span>
            </div>
            <div className="sidebar-footer-item">
              <span className="sidebar-footer-label">{appCopy.sidebar.lastEvent}</span>
              <span className="sidebar-footer-value">
                {streamStatus.lastEventAt
                  ? new Date(streamStatus.lastEventAt).toLocaleTimeString()
                  : appCopy.sidebar.notAvailable}
              </span>
            </div>
          </div>
          <div className="sidebar-systems">
            <div className="sidebar-system-block">
              <span className="sidebar-footer-label">Experience</span>
              <div className="ui-experience-switch sidebar-experience-switch">
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
              <span className="sidebar-footer-value sidebar-system-note">
                {uiMode === "simple" ? "Guided defaults" : "Full controls"}
              </span>
            </div>
            <div className="sidebar-system-block">
              <span className="sidebar-footer-label">Citadel systems</span>
              <label className="ui-technical-toggle sidebar-technical-toggle">
                <GCSwitch
                  checked={showTechnicalDetails}
                  onCheckedChange={setShowTechnicalDetails}
                  label="Technical details"
                />
              </label>
            </div>
          </div>
          <div className="sidebar-footer-meta">
            <span>{appCopy.sidebar.mode}: {appCopy.sidebar.localMode}</span>
            <ClockBadge />
          </div>
        </footer>
      </aside>
      <main className="content shell-content">
        <header className="app-topbar shell-topbar">
          <div className="shell-topbar-copy">
            <div className="shell-topbar-title-row">
              <p className="shell-topbar-kicker">Citadel systems</p>
              <h3>Command Deck</h3>
            </div>
            <p className="office-subtitle shell-topbar-subtitle">
              <strong>{activeNav?.label ?? "Mission Control"}</strong>
            </p>
          </div>
          <div className="app-topbar-actions">
            <div className="shell-topbar-actions-left">
              <button type="button" className="shell-quick-action shell-command-trigger-topbar" onClick={() => setPaletteOpen(true)}>
                Command Palette
              </button>
              <GlobalFreshnessPill streamState={streamState} streamStatus={streamStatus} />
            </div>
            <div className="shell-topbar-actions-right">
              <ShellActionGroup className="shell-toggle-group">
                <span className="shell-action-label">Density</span>
                <div className="ui-experience-switch ui-density-switch">
                  <button type="button" className={density === "comfortable" ? "active" : ""} onClick={() => setDensity("comfortable")}>
                    Comfortable
                  </button>
                  <button type="button" className={density === "default" ? "active" : ""} onClick={() => setDensity("default")}>
                    Default
                  </button>
                  <button type="button" className={density === "compact" ? "active" : ""} onClick={() => setDensity("compact")}>
                    Compact
                  </button>
                </div>
              </ShellActionGroup>
              <ShellActionGroup>
                <label className="ui-technical-toggle shell-workspace-picker">
                  <span className="shell-action-label">Workspace</span>
                  <GCSelect
                    value={activeWorkspaceId}
                    onChange={setActiveWorkspaceId}
                    options={[...workspaceOptions, { workspaceId: activeWorkspaceId, name: activeWorkspaceId }]
                      .filter((item, index, arr) => arr.findIndex((other) => other.workspaceId === item.workspaceId) === index)
                      .map((item) => ({ value: item.workspaceId, label: item.name }))}
                  />
                </label>
              </ShellActionGroup>
              <HelpHint
                label="Command deck guidance"
                text={nextStepByTab[tab]}
              />
            </div>
          </div>
        </header>
        {streamState === "error" || streamState === "closed" ? (
          <div className="status-banner warning">
            {appCopy.streamBanner.replace("{state}", streamState)}
          </div>
        ) : null}
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

