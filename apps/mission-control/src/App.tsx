import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  connectEventStream,
  fetchOnboardingState,
  type EventStreamConnectionState,
  type EventStreamStatus,
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
import { CommandPalette } from "./components/CommandPalette";
import { HelpHint } from "./components/HelpHint";
import { appCopy } from "./content/copy";

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
  | "skills"
  | "costs"
  | "settings"
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
  "skills",
  "costs",
  "settings",
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
  const [tab, setTab] = useState<Tab>(() => readTabFromLocation());
  const [refreshKey, setRefreshKey] = useState(0);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  const [streamState, setStreamState] = useState<EventStreamConnectionState>("connecting");
  const [streamStatus, setStreamStatus] = useState<EventStreamStatus>({
    state: "connecting",
    reconnectAttempts: 0,
  });
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleOnboardingCompleted = useCallback(() => {
    setOnboardingComplete(true);
    setRefreshKey((value) => value + 1);
    setTab("dashboard");
  }, []);

  useEffect(() => {
    const close = connectEventStream(
      () => {
        setRefreshKey((value) => value + 1);
      },
      setStreamState,
      setStreamStatus,
    );

    return () => {
      close();
    };
  }, []);

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
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [tab]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      return <FilesPage refreshKey={refreshKey} />;
    }
    if (tab === "memory") {
      return <MemoryPage refreshKey={refreshKey} />;
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
      return <ChatPage refreshKey={refreshKey} />;
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
    if (tab === "tools") {
      return <ToolsPage refreshKey={refreshKey} />;
    }
    if (tab === "approvals") {
      return <ApprovalsPage refreshKey={refreshKey} />;
    }
    if (tab === "tasks") {
      return <TasksPage refreshKey={refreshKey} />;
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
  }, [refreshKey, tab, handleOnboardingCompleted]);

  return (
    <div className="layout-shell">
      <aside className="sidebar">
        <h1>{appCopy.brandTitle}</h1>
        <p className="sidebar-subtitle">{appCopy.brandSubtitle}</p>
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
                  <button
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
          <p>{clock}</p>
        </footer>
      </aside>
      <main className="content">
        {streamState !== "open" ? (
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
    </div>
  );
}
