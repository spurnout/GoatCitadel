import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { connectEventStream, fetchOnboardingState, type EventStreamConnectionState } from "./api/client";
import { DashboardPage } from "./pages/DashboardPage";
import { SystemPage } from "./pages/SystemPage";
import { FilesPage } from "./pages/FilesPage";
import { MemoryPage } from "./pages/MemoryPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ActivityPage } from "./pages/ActivityPage";
import { CronPage } from "./pages/CronPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SkillsPage } from "./pages/SkillsPage";
import { CostConsolePage } from "./pages/CostConsolePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { TasksPage } from "./pages/TasksPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { MeshPage } from "./pages/MeshPage";
import { OnboardingPage } from "./pages/OnboardingPage";

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
  | "skills"
  | "costs"
  | "settings"
  | "approvals"
  | "tasks"
  | "integrations"
  | "mesh";

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
  "skills",
  "costs",
  "settings",
  "approvals",
  "tasks",
  "integrations",
  "mesh",
];

const navItems: Array<{ id: Tab; label: string; code: string }> = [
  { id: "onboarding", label: "Launch Wizard", code: "NEW" },
  { id: "dashboard", label: "Summit (Dashboard)", code: "SUM" },
  { id: "system", label: "Engine (System)", code: "ENG" },
  { id: "files", label: "Trail Files", code: "FS" },
  { id: "memory", label: "Memory Pasture", code: "MEM" },
  { id: "agents", label: "Goat Crew (Agents)", code: "HERD" },
  { id: "office", label: "Herd HQ (Office)", code: "HQ" },
  { id: "activity", label: "Pulse (Activity)", code: "ACT" },
  { id: "cron", label: "Bell Tower (Cron)", code: "CRN" },
  { id: "sessions", label: "Runs (Sessions)", code: "SES" },
  { id: "skills", label: "Playbook (Skills)", code: "SKL" },
  { id: "costs", label: "Feed Ledger (Costs)", code: "USD" },
  { id: "settings", label: "Forge (Settings)", code: "CFG" },
  { id: "approvals", label: "Gatehouse (Approvals)", code: "APR" },
  { id: "tasks", label: "Trailboard (Tasks)", code: "TSK" },
  { id: "integrations", label: "Connections", code: "CNX" },
  { id: "mesh", label: "Mesh", code: "MSH" },
];

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
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    const close = connectEventStream(
      () => {
        setRefreshKey((value) => value + 1);
      },
      setStreamState,
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

  const content = useMemo(() => {
    if (tab === "onboarding") {
      return <OnboardingPage onCompleted={() => setOnboardingComplete(true)} />;
    }
    if (tab === "dashboard") {
      return <DashboardPage refreshKey={refreshKey} />;
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
    if (tab === "skills") {
      return <SkillsPage refreshKey={refreshKey} />;
    }
    if (tab === "costs") {
      return <CostConsolePage refreshKey={refreshKey} />;
    }
    if (tab === "settings") {
      return <SettingsPage refreshKey={refreshKey} />;
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
    return <IntegrationsPage refreshKey={refreshKey} />;
  }, [refreshKey, tab]);

  return (
    <div className="layout-shell">
      <aside className="sidebar">
        <h1>GoatCitadel</h1>
        <p className="sidebar-subtitle">Herd-Orchestrated Mission Control</p>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={tab === item.id ? "active" : ""}
            >
              <span className="nav-code">{item.code}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <p>Stream: {streamState}</p>
          <p>Onboarding: {onboardingComplete === null ? "unknown" : onboardingComplete ? "complete" : "required"}</p>
          <p>Mode: local herd</p>
          <p>{clock}</p>
        </footer>
      </aside>
      <main className="content">
        {streamState !== "open" ? (
          <div className="status-banner warning">
            Live stream is {streamState}. Mission Control will reconnect automatically.
          </div>
        ) : null}
        {content}
      </main>
    </div>
  );
}
