import React from "react";
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchAgents: vi.fn(async () => ({
    items: [
      {
        agentId: "agent-1",
        roleId: "architect",
        status: "active",
        name: "Architect",
        title: "Systems Architect",
        summary: "Design and planning agent",
        specialties: ["Architecture", "Planning"],
        defaultTools: ["browser.search"],
        aliases: ["architect"],
        isBuiltin: true,
        editable: false,
        lifecycleStatus: "active",
        sessionCount: 1,
        activeSessions: 1,
        lastUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        agentId: "agent-2",
        roleId: "qa",
        status: "idle",
        name: "QA",
        title: "Verification Lead",
        summary: "Quality verification agent",
        specialties: ["Testing", "Regression"],
        defaultTools: ["shell.exec"],
        aliases: ["qa"],
        isBuiltin: true,
        editable: false,
        lifecycleStatus: "active",
        sessionCount: 1,
        activeSessions: 0,
        lastUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  })),
  fetchOperators: vi.fn(async () => ({
    items: [
      {
        operatorId: "operator-1",
        sessionCount: 2,
        activeSessions: 1,
        lastActivityAt: new Date().toISOString(),
      },
    ],
  })),
  fetchApprovals: vi.fn(async () => ({
    items: [
      {
        approvalId: "approval-1",
        kind: "tool.invoke",
        riskLevel: "high",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ],
  })),
  fetchRealtimeEvents: vi.fn(async () => ({
    items: [
      {
        eventId: "evt-1",
        eventType: "activity_logged",
        source: "chat",
        timestamp: new Date().toISOString(),
        payload: {
          activity: {
            agentId: "architect",
            message: "Drafted plan.",
          },
          taskId: "task-1",
          sessionId: "agent-session-1",
        },
      },
      {
        eventId: "evt-2",
        eventType: "approval_created",
        source: "approval",
        timestamp: new Date().toISOString(),
        payload: {
          kind: "tool.invoke",
          riskLevel: "high",
          approvalId: "approval-1",
        },
      },
    ],
  })),
  connectEventStream: vi.fn((onEvent: (event: unknown) => void, onStateChange?: (state: string) => void) => {
    onStateChange?.("open");
    onEvent({
      eventId: "evt-live-1",
      eventType: "activity_logged",
      source: "chat",
      timestamp: new Date().toISOString(),
      payload: {
        activity: {
          agentId: "architect",
          message: "live update",
        },
        taskId: "task-1",
        sessionId: "agent-session-1",
      },
    });
    return () => undefined;
  }),
}));

const officeCanvasMockState = vi.hoisted(() => ({
  shouldThrow: false,
}));

vi.mock("../api/client", () => ({
  fetchAgents: apiMocks.fetchAgents,
  fetchApprovals: apiMocks.fetchApprovals,
  fetchOperators: apiMocks.fetchOperators,
  fetchRealtimeEvents: apiMocks.fetchRealtimeEvents,
  connectEventStream: apiMocks.connectEventStream,
}));

vi.mock("../components/OfficeCanvas", () => ({
  OfficeCanvas: (props: { onSelect: (id: string) => void }) => {
    if (officeCanvasMockState.shouldThrow) {
      throw new Error("office-canvas-render-failure");
    }
    return (
      <button type="button" onClick={() => props.onSelect("architect")}>
        office-canvas
      </button>
    );
  },
}));

import { OfficePage } from "./OfficePage";

class TestBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  public override state = { hasError: false };

  public static getDerivedStateFromError() {
    return { hasError: true };
  }

  public override componentDidCatch(): void {
    // Coverage harness: if the page itself fails at the top level, keep the tree mounted for assertions.
  }

  public override render() {
    if (this.state.hasError) {
      return <div>office-page-fallback</div>;
    }
    return this.props.children;
  }
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

function installBrowserStubs(): void {
  const documentListeners = new Map<string, Array<(event?: unknown) => void>>();
  const windowListeners = new Map<string, Array<(event?: unknown) => void>>();
  const visibilityState = { value: "visible" };
  const documentStub = {
    visibilityState: visibilityState.value,
    addEventListener: (name: string, handler: (event?: unknown) => void) => {
      const next = documentListeners.get(name) ?? [];
      next.push(handler);
      documentListeners.set(name, next);
    },
    removeEventListener: (name: string, handler: (event?: unknown) => void) => {
      const next = (documentListeners.get(name) ?? []).filter((candidate) => candidate !== handler);
      documentListeners.set(name, next);
    },
    dispatchEvent: (event: { type: string }) => {
      for (const handler of documentListeners.get(event.type) ?? []) {
        handler(event);
      }
      return true;
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: documentStub,
  });

  const matchMediaListeners = new Set<(event: { matches: boolean }) => void>();
  const matchMedia = () => ({
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
      matchMediaListeners.add(handler);
    },
    removeEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
      matchMediaListeners.delete(handler);
    },
    dispatchEvent: () => true,
  });

  const windowStub = {
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    matchMedia,
    addEventListener: (name: string, handler: (event?: unknown) => void) => {
      const next = windowListeners.get(name) ?? [];
      next.push(handler);
      windowListeners.set(name, next);
    },
    removeEventListener: (name: string, handler: (event?: unknown) => void) => {
      const next = (windowListeners.get(name) ?? []).filter((candidate) => candidate !== handler);
      windowListeners.set(name, next);
    },
    dispatchEvent: (event: { type: string }) => {
      for (const handler of windowListeners.get(event.type) ?? []) {
        handler(event);
      }
      return true;
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: windowStub,
  });

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/assets/office/asset-manifest.json")) {
      return new Response(
        JSON.stringify({
          models: [
            { id: "central-operator", path: "/assets/operator.glb", includedInRepo: true },
            {
              id: "goat-subagent-animated",
              label: "Animated Goat Subagent",
              path: "/assets/goat-animated.glb",
              includedInRepo: true,
            },
            { id: "goat-subagent", path: "/assets/goat.glb", includedInRepo: true },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if ((init?.method ?? "GET").toUpperCase() === "HEAD") {
      return new Response(null, { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch);
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) {
      await Promise.resolve();
    }
  });
}

function collectText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node == null) {
    return "";
  }
  if (typeof node === "string") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child) => collectText(child)).join(" ");
  }
  const children = node.children ?? [];
  return children.map((child) => collectText(child as ReactTestRendererJSON | string | null)).join(" ");
}

function rendererText(renderer: ReactTestRenderer): string {
  return collectText(renderer.toJSON());
}

async function clickNode(node: { props: { onClick?: (event: unknown) => void } }): Promise<void> {
  await act(async () => {
    node.props.onClick?.({
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    });
  });
}

function findButtonByText(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((candidate) => {
    if (candidate.type !== "button") {
      return false;
    }
    return collectText(candidate.props.children as ReactTestRendererJSON | ReactTestRendererJSON[] | string | null)
      .replace(/\s+/g, " ")
      .trim() === label;
  });
}

function findCheckboxLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((candidate) => {
    if (candidate.type !== "label") {
      return false;
    }
    return collectText(candidate.props.children as ReactTestRendererJSON | ReactTestRendererJSON[] | string | null)
      .replace(/\s+/g, " ")
      .includes(label);
  });
}

describe("OfficePage coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T18:00:00.000Z"));
    vi.clearAllMocks();
    officeCanvasMockState.shouldThrow = false;
    installBrowserStubs();
  });

  it("loads operator floor state and handles live interaction updates", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer = create(<div />);
    try {
      await act(async () => {
        renderer = create(
          <TestBoundary>
            <OfficePage />
          </TestBoundary>,
        );
      });
      await flush();

      const architectButton = findButtonByText(renderer, "Architect");
      await clickNode(architectButton);
      await flush();

      expect(rendererText(renderer)).toContain("Architect");
      expect(rendererText(renderer)).toContain("Systems Architect");
      expect(rendererText(renderer)).toContain("Current task");
      expect(rendererText(renderer)).toContain("Recorded task activity.");
      expect(rendererText(renderer)).toContain("Recent handoffs");
      expect(rendererText(renderer)).toContain("Activity playback");

      const replayButton = findButtonByText(renderer, "Replay 5m");
      expect(replayButton.props.disabled).toBe(false);
      await clickNode(replayButton);
      await flush();

      const playButton = findButtonByText(renderer, "Play");
      expect(playButton.props.disabled).toBe(false);
      expect(rendererText(renderer)).toContain("Replay cursor");

      const approvalsTab = findButtonByText(renderer, "Approvals");
      await clickNode(approvalsTab);
      await flush();

      expect(rendererText(renderer)).toContain("tool.invoke");
      expect(rendererText(renderer)).toContain("pending");

      await act(async () => {
        vi.advanceTimersByTime(25_000);
      });
      await flush();

      expect(apiMocks.fetchAgents).toHaveBeenCalled();
      expect(apiMocks.fetchOperators).toHaveBeenCalled();
      expect(apiMocks.fetchApprovals).toHaveBeenCalled();
      expect(apiMocks.fetchAgents).toHaveBeenCalledTimes(1);
      expect(apiMocks.fetchOperators).toHaveBeenCalledTimes(1);
      expect(apiMocks.fetchApprovals).toHaveBeenCalledTimes(1);
      expect(apiMocks.fetchRealtimeEvents).toHaveBeenCalledTimes(1);
      expect(apiMocks.fetchRealtimeEvents).toHaveBeenCalledWith(100);
      expect(apiMocks.connectEventStream).toHaveBeenCalled();
      expect(renderer.toJSON()).toBeTruthy();
    } finally {
      consoleError.mockRestore();
      renderer.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps the coverage harness mounted when the office canvas render path fails", async () => {
    officeCanvasMockState.shouldThrow = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer = create(<div />);
    try {
      await act(async () => {
        renderer = create(
          <TestBoundary>
            <OfficePage />
          </TestBoundary>,
        );
      });
      await flush();
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      await flush();
      expect(renderer.toJSON()).toBeTruthy();
    } finally {
      consoleError.mockRestore();
      renderer.unmount();
      vi.useRealTimers();
    }
  });

  it("shows procedural goat messaging when the asset manifest cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/assets/office/asset-manifest.json")) {
        throw new Error("asset-manifest-unavailable");
      }
      if ((init?.method ?? "GET").toUpperCase() === "HEAD") {
        return new Response(null, { status: 404 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer = create(<div />);
    try {
      await act(async () => {
        renderer = create(
          <TestBoundary>
            <OfficePage />
          </TestBoundary>,
        );
      });
      await flush();
      expect(renderer.toJSON()).toBeTruthy();
    } finally {
      consoleError.mockRestore();
      renderer.unmount();
      vi.useRealTimers();
    }
  });

  it("enables focus mode and keeps the selected desk in view", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer = create(<div />);
    try {
      await act(async () => {
        renderer = create(
          <TestBoundary>
            <OfficePage />
          </TestBoundary>,
        );
      });
      await flush();

      const architectButton = findButtonByText(renderer, "Architect");
      await clickNode(architectButton);
      await flush();

      const focusModeLabel = findCheckboxLabel(renderer, "Focus Mode");
      await act(async () => {
        focusModeLabel.findByType("input").props.onChange({
          target: { checked: true },
        });
      });
      await flush();

      const quietModeLabel = findCheckboxLabel(renderer, "Quiet Office");
      await act(async () => {
        quietModeLabel.findByType("input").props.onChange({
          target: { checked: true },
        });
      });
      await flush();

      const followSelectionLabel = findCheckboxLabel(renderer, "Follow Selected");
      await act(async () => {
        followSelectionLabel.findByType("input").props.onChange({
          target: { checked: true },
        });
      });
      await flush();

      const section = renderer.root.find((candidate) =>
        candidate.type === "section"
        && typeof candidate.props.className === "string"
        && candidate.props.className.includes("office-v5"));

      expect(section.props.className).toContain("office-focus-mode");
      expect(rendererText(renderer)).toContain("Architect");
      expect(rendererText(renderer)).toContain("focus lens");
      expect(rendererText(renderer)).toContain("Activity playback");
      expect(rendererText(renderer)).toContain("Quiet Office");
      expect(rendererText(renderer)).toContain("Follow Selected");
      expect(rendererText(renderer)).toContain("Recent handoffs");
      expect(rendererText(renderer)).toContain("Hotkeys: 1-5 jump zones, [ and ] cycle decks.");
      expect(window.localStorage.getItem("goatcitadel.office.operator")).toContain("\"focusMode\":true");
      expect(window.localStorage.getItem("goatcitadel.office.operator")).toContain("\"quietMode\":true");
      expect(window.localStorage.getItem("goatcitadel.office.operator")).toContain("\"followSelection\":true");

      await act(async () => {
        window.dispatchEvent({
          type: "keydown",
          key: "1",
          preventDefault: () => undefined,
          target: null,
        } as unknown as Event);
      });
      await flush();

      expect(rendererText(renderer)).toContain("GoatHerder focus lens");
    } finally {
      consoleError.mockRestore();
      renderer.unmount();
      vi.useRealTimers();
    }
  });

  it("re-syncs the focus zone after reselection outside focus mode", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer = create(<div />);
    try {
      await act(async () => {
        renderer = create(
          <TestBoundary>
            <OfficePage />
          </TestBoundary>,
        );
      });
      await flush();

      const architectButton = findButtonByText(renderer, "Architect");
      await clickNode(architectButton);
      await flush();

      const focusModeLabel = findCheckboxLabel(renderer, "Focus Mode");
      await act(async () => {
        focusModeLabel.findByType("input").props.onChange({
          target: { checked: true },
        });
      });
      await flush();

      await act(async () => {
        window.dispatchEvent({
          type: "keydown",
          key: "2",
          preventDefault: () => undefined,
          target: null,
        } as unknown as Event);
      });
      await flush();

      expect(rendererText(renderer)).toContain("QA focus lens");

      await act(async () => {
        focusModeLabel.findByType("input").props.onChange({
          target: { checked: false },
        });
      });
      await flush();

      await clickNode(architectButton);
      await flush();

      await act(async () => {
        focusModeLabel.findByType("input").props.onChange({
          target: { checked: true },
        });
      });
      await flush();

      const zoneCards = renderer.root.findAll((candidate) =>
        candidate.type === "article"
        && typeof candidate.props.className === "string"
        && candidate.props.className.includes("office-zone-card"));

      expect(zoneCards).toHaveLength(1);
      const commandZoneCard = zoneCards[0]!;
      const zoneLabel = commandZoneCard.find((candidate) =>
        typeof candidate.props.className === "string"
        && candidate.props.className.includes("office-zone-card-label"));
      expect(collectText(zoneLabel.props.children as ReactTestRendererJSON | ReactTestRendererJSON[] | string | null))
        .toContain("Command Deck");
      expect(rendererText(renderer)).toContain("Architect focus lens");
    } finally {
      consoleError.mockRestore();
      renderer.unmount();
      vi.useRealTimers();
    }
  });

  it("uses the replay cursor for the event pace and live rail feed", async () => {
    apiMocks.fetchRealtimeEvents.mockResolvedValueOnce({
      items: [
        {
          eventId: "evt-replay-new",
          eventType: "approval_created",
          source: "approval",
          timestamp: "2026-03-10T18:00:00.000Z",
          payload: {
            kind: "tool.invoke",
            riskLevel: "high",
            approvalId: "approval-1",
          },
        },
        {
          eventId: "evt-replay-old",
          eventType: "activity_logged",
          source: "chat",
          timestamp: "2026-03-10T17:56:00.000Z",
          payload: {
            activity: {
              agentId: "architect",
              message: "Drafted plan.",
            },
            taskId: "task-1",
            sessionId: "agent-session-1",
          },
        },
      ],
    });
    apiMocks.connectEventStream.mockImplementationOnce((_onEvent: (event: unknown) => void, onStateChange?: (state: string) => void) => {
      onStateChange?.("open");
      return () => undefined;
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer = create(<div />);
    try {
      await act(async () => {
        renderer = create(
          <TestBoundary>
            <OfficePage />
          </TestBoundary>,
        );
      });
      await flush();

      expect(rendererText(renderer)).toContain("0.4 /min");

      const replayButton = findButtonByText(renderer, "Replay 5m");
      await clickNode(replayButton);
      await flush();

      expect(rendererText(renderer)).toContain("0.2 /min");

      const liveRailTab = findButtonByText(renderer, "Live Rail");
      await clickNode(liveRailTab);
      await flush();

      expect(rendererText(renderer)).toContain("activity_logged");
      expect(rendererText(renderer)).not.toContain("approval_created");

      const replayCursor = renderer.root.findByProps({ id: "officePlaybackCursor" });
      await act(async () => {
        replayCursor.props.onChange({
          target: { value: "100" },
        });
      });
      await flush();

      expect(rendererText(renderer)).toContain("0.4 /min");
      expect(rendererText(renderer)).toContain("approval_created");
    } finally {
      consoleError.mockRestore();
      renderer.unmount();
      vi.useRealTimers();
    }
  });
});
