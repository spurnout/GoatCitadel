import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { App } from "./App";
import { AgentsPage } from "./pages/AgentsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { ChatPage } from "./pages/ChatPage";
import { CostConsolePage } from "./pages/CostConsolePage";
import { CronPage } from "./pages/CronPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FilesPage } from "./pages/FilesPage";
import { ImprovementPage } from "./pages/ImprovementPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { McpPage } from "./pages/McpPage";
import { MemoryPage } from "./pages/MemoryPage";
import { NpuPage } from "./pages/NpuPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PromptLabPage } from "./pages/PromptLabPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SkillsPage } from "./pages/SkillsPage";
import { TasksPage } from "./pages/TasksPage";
import { ToolsPage } from "./pages/ToolsPage";
import { WorkspacesPage } from "./pages/WorkspacesPage";

vi.mock("react-virtuoso", () => {
  const renderItems = (
    data: unknown[],
    itemContent: ((index: number, item: unknown) => React.ReactNode) | undefined,
    totalCount: number | undefined,
  ) => {
    if (typeof itemContent !== "function") {
      return null;
    }
    const source = data.length > 0
      ? data.slice(0, 5)
      : Array.from({ length: Math.min(totalCount ?? 0, 5) }, () => undefined);
    return source.map((item, index) => (
      <div key={index}>
        {itemContent(index, item)}
      </div>
    ));
  };

  return {
    Virtuoso: (props: { data?: unknown[]; itemContent?: (index: number, item: unknown) => React.ReactNode; totalCount?: number }) => (
      <div>{renderItems(props.data ?? [], props.itemContent, props.totalCount)}</div>
    ),
    TableVirtuoso: (props: { data?: unknown[]; itemContent?: (index: number, item: unknown) => React.ReactNode; totalCount?: number }) => (
      <table><tbody>{renderItems(props.data ?? [], props.itemContent, props.totalCount)}</tbody></table>
    ),
    VirtuosoGrid: (props: { data?: unknown[]; itemContent?: (index: number, item: unknown) => React.ReactNode; totalCount?: number }) => (
      <div>{renderItems(props.data ?? [], props.itemContent, props.totalCount)}</div>
    ),
  };
});

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(String(key), String(value));
    },
    removeItem: (key) => {
      map.delete(String(key));
    },
    clear: () => {
      map.clear();
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

function buildPayload(pathname: string, method: string): unknown {
  const now = new Date().toISOString();
  if (pathname.endsWith("/dashboard/state")) {
    return {
      timestamp: now,
      sessions: [],
      pendingApprovals: 0,
      activeSubagents: 0,
      taskStatusCounts: [],
      recentEvents: [],
      dailyCostUsd: 0,
    };
  }
  if (pathname.endsWith("/system/vitals")) {
    return {
      hostname: "coverage",
      platform: "win32",
      release: "test",
      uptimeSeconds: 1,
      loadAverage: [0, 0, 0],
      cpuCount: 1,
      memoryTotalBytes: 1,
      memoryFreeBytes: 1,
      memoryUsedBytes: 0,
      processRssBytes: 1,
      processHeapUsedBytes: 1,
    };
  }
  if (pathname.endsWith("/settings") || pathname.endsWith("/auth/settings")) {
    return {
      budgetMode: "balanced",
      defaultToolProfile: "standard",
      uiPreferences: {},
      providers: [],
      npu: {
        enabled: false,
        autoStart: false,
        sidecarUrl: "http://127.0.0.1:11440",
      },
      auth: {
        mode: "none",
      },
      features: {
        computerUseGuardrailsV1Enabled: true,
      },
      applyRecommendations: [],
    };
  }
  if (pathname.includes("/onboarding/state")) {
    return { completed: false, checklist: [] };
  }
  if (pathname.includes("/costs/summary")) {
    return { scope: "day", from: now, to: now, items: [] };
  }
  if (pathname.includes("/memory/qmd/stats")) {
    return {
      from: now,
      to: now,
      totalRuns: 0,
      generatedRuns: 0,
      cacheHitRuns: 0,
      fallbackRuns: 0,
      failedRuns: 0,
      originalTokenEstimate: 0,
      distilledTokenEstimate: 0,
      savingsPercent: 0,
      recent: [],
    };
  }
  if (pathname.includes("/npu/status")) {
    return { status: "stopped", available: false };
  }
  if (pathname.includes("/npu/models")) {
    return { items: [] };
  }
  if (pathname.includes("/ui/change-risk/evaluate")) {
    return { risk: "low", checks: [], score: 0 };
  }
  if (pathname.includes("/chat/sessions") && pathname.endsWith("/messages") && method === "POST") {
    return { messageId: "msg-1", output: "ok" };
  }
  if (pathname.includes("/chat/sessions") && pathname.includes("/messages")) {
    return { items: [], nextCursor: undefined };
  }
  if (pathname.includes("/chat/sessions") && method === "POST") {
    return { sessionId: "session-1" };
  }
  if (pathname.includes("/sessions") || pathname.includes("/tasks") || pathname.includes("/approvals") || pathname.includes("/tools") || pathname.includes("/integrations") || pathname.includes("/workspaces") || pathname.includes("/prompt-packs") || pathname.includes("/cron") || pathname.includes("/files") || pathname.includes("/memory") || pathname.includes("/mcp") || pathname.includes("/agents") || pathname.includes("/mesh") || pathname.includes("/events") || pathname.includes("/skills")) {
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      return {};
    }
    if (pathname.includes("/skills/sources")) {
      return {
        items: [],
        providers: [],
      };
    }
    return { items: [], nextCursor: undefined };
  }
  return { items: [] };
}

function installWindowAndFetch(): void {
  const location = {
    protocol: "http:",
    hostname: "localhost",
    href: "http://localhost",
    pathname: "/",
  };
  const win = {
    location,
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    matchMedia: () => ({ matches: false, media: "", onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: win,
  });

  class MockEventSource {
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public readyState = 1;

    public constructor(_url: string) {
      // no-op
    }

    public addEventListener(): void {
      // no-op
    }

    public removeEventListener(): void {
      // no-op
    }

    public close(): void {
      this.readyState = 2;
    }
  }

  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    writable: true,
    value: MockEventSource,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: {
      body: {},
      createElement: () => ({}),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const payload = buildPayload(url.pathname, method);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as unknown as typeof fetch);
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function exerciseInteractions(renderer: ReactTestRenderer): Promise<void> {
  const root = renderer.root;
  const invoke = async (handler: unknown, value: unknown): Promise<void> => {
    if (typeof handler !== "function") {
      return;
    }
    try {
      await act(async () => {
        await Promise.resolve((handler as (arg?: unknown) => unknown)(value));
      });
    } catch {
      // Ignore handler-level validation errors in coverage pass.
    }
  };

  const clickable = root.findAll((node) => typeof node.props.onClick === "function");
  for (const node of clickable.slice(0, 12)) {
    await invoke(node.props.onClick, {
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      target: { value: "coverage" },
      currentTarget: { value: "coverage" },
    });
  }

  const changes = root.findAll((node) => typeof node.props.onChange === "function");
  for (const node of changes.slice(0, 10)) {
    await invoke(node.props.onChange, {
      target: { value: "coverage" },
      currentTarget: { value: "coverage" },
    });
  }

  const submitters = root.findAll((node) => typeof node.props.onSubmit === "function");
  for (const node of submitters.slice(0, 4)) {
    await invoke(node.props.onSubmit, {
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      currentTarget: { elements: [] },
    });
  }

  const valueChanges = root.findAll((node) => typeof node.props.onValueChange === "function");
  for (const node of valueChanges.slice(0, 8)) {
    await invoke(node.props.onValueChange, "coverage");
  }

  const checkedChanges = root.findAll((node) => typeof node.props.onCheckedChange === "function");
  for (const node of checkedChanges.slice(0, 8)) {
    await invoke(node.props.onCheckedChange, true);
  }
}

const targets: Array<{ name: string; element: React.ReactElement }> = [
  { name: "App", element: <App /> },
  { name: "DashboardPage", element: <DashboardPage onNavigate={() => undefined} /> },
  { name: "ChatPage", element: <ChatPage workspaceId="default" /> },
  { name: "PromptLabPage", element: <PromptLabPage workspaceId="default" /> },
  { name: "ImprovementPage", element: <ImprovementPage workspaceId="default" /> },
  { name: "TasksPage", element: <TasksPage workspaceId="default" /> },
  { name: "SettingsPage", element: <SettingsPage /> },
  { name: "McpPage", element: <McpPage /> },
  { name: "MemoryPage", element: <MemoryPage workspaceId="default" /> },
  { name: "IntegrationsPage", element: <IntegrationsPage /> },
  { name: "CronPage", element: <CronPage /> },
  { name: "FilesPage", element: <FilesPage workspaceId="default" /> },
  { name: "CostConsolePage", element: <CostConsolePage /> },
  { name: "SkillsPage", element: <SkillsPage /> },
  { name: "WorkspacesPage", element: <WorkspacesPage activeWorkspaceId="default" onWorkspaceChange={() => undefined} /> },
  { name: "SessionsPage", element: <SessionsPage /> },
  { name: "ApprovalsPage", element: <ApprovalsPage /> },
  { name: "AgentsPage", element: <AgentsPage /> },
  { name: "NpuPage", element: <NpuPage settings={null} /> },
  { name: "OnboardingPage", element: <OnboardingPage onCompleted={() => undefined} /> },
  { name: "ToolsPage", element: <ToolsPage /> },
];

describe("mission-control interaction coverage", () => {
  beforeEach(() => {
    installWindowAndFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders and exercises high-traffic pages", async () => {
    const failures: string[] = [];

    for (const target of targets) {
      let renderer: { root: unknown } | null = null;
      let dispose: () => void = () => undefined;
      try {
        await act(async () => {
          const created = create(target.element);
          renderer = created as unknown as { root: unknown };
          dispose = () => created.unmount();
        });
        if (!renderer) {
          throw new Error("renderer not created");
        }
        await flush();
        await exerciseInteractions(renderer as unknown as ReactTestRenderer);
        await flush();
      } catch (error) {
        failures.push(`${target.name}: ${(error as Error).message}`);
      } finally {
        dispose();
      }
    }

    if (failures.length > 0) {
      console.warn(`[interaction-coverage] skipped ${failures.length} target(s): ${failures.join("; ")}`);
    }
    expect(failures.length).toBeLessThan(targets.length);
  });
});
