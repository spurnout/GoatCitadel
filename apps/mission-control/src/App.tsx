import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { connectEventStream } from "./api/client";
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

const OfficePage = lazy(async () => {
  const module = await import("./pages/OfficePage");
  return { default: module.OfficePage };
});

type Tab =
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
  | "tasks";

const allTabs: Tab[] = [
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
];

const navItems: Array<{ id: Tab; label: string; code: string }> = [
  { id: "dashboard", label: "Dashboard", code: "DB" },
  { id: "system", label: "System", code: "SYS" },
  { id: "files", label: "Files", code: "FS" },
  { id: "memory", label: "Memory", code: "MEM" },
  { id: "agents", label: "Agents", code: "AG" },
  { id: "office", label: "Office", code: "HQ" },
  { id: "activity", label: "Activity", code: "ACT" },
  { id: "cron", label: "Cron", code: "CRN" },
  { id: "sessions", label: "Sessions", code: "SES" },
  { id: "skills", label: "Skills", code: "SKL" },
  { id: "costs", label: "Costs", code: "USD" },
  { id: "settings", label: "Settings", code: "CFG" },
  { id: "approvals", label: "Approvals", code: "APR" },
  { id: "tasks", label: "Tasks", code: "TSK" },
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

  useEffect(() => {
    const close = connectEventStream(() => {
      setRefreshKey((value) => value + 1);
    });

    return () => {
      close();
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
        <Suspense fallback={<p>Loading WebGL office...</p>}>
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
    return <TasksPage refreshKey={refreshKey} />;
  }, [refreshKey, tab]);

  return (
    <div className="layout-shell">
      <aside className="sidebar">
        <h1>Mission Control</h1>
        <p className="sidebar-subtitle">Local Operator Console</p>
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
          <p>Mode: local</p>
          <p>{clock}</p>
        </footer>
      </aside>
      <main className="content">{content}</main>
    </div>
  );
}
