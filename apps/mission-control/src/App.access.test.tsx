import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const consumeGatewayAccessBootstrapFromLocationMock = vi.fn();
const connectEventStreamMock = vi.fn();
const fetchWorkspacesMock = vi.fn();
const getGatewayApiBaseUrlMock = vi.fn();
const preflightGatewayAccessMock = vi.fn();

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    consumeGatewayAccessBootstrapFromLocation: consumeGatewayAccessBootstrapFromLocationMock,
    connectEventStream: connectEventStreamMock,
    fetchWorkspaces: fetchWorkspacesMock,
    getGatewayApiBaseUrl: getGatewayApiBaseUrlMock,
    preflightGatewayAccess: preflightGatewayAccessMock,
  };
});

vi.mock("./pages/DashboardPage", () => ({
  DashboardPage: () => <div>dashboard-ready</div>,
}));

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

function installMockWindow(): void {
  const location = {
    protocol: "http:",
    hostname: "localhost",
    href: "http://localhost:5173/?tab=dashboard",
    pathname: "/",
    origin: "http://localhost:5173",
    search: "?tab=dashboard",
    hash: "",
  };
  const history = {
    replaceState: () => undefined,
    pushState: () => undefined,
  };
  const win = {
    location,
    history,
    navigator: {
      clipboard: {
        writeText: async () => undefined,
      },
      userAgent: "vitest",
    },
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (handle: number) => globalThis.clearTimeout(handle),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    matchMedia: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: win,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: {
      body: {},
      hidden: false,
      visibilityState: "visible",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: win.navigator,
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    writable: true,
    value: history,
  });
}

function renderTreeText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("App gateway access gate", () => {
  beforeEach(() => {
    installMockWindow();
    consumeGatewayAccessBootstrapFromLocationMock.mockReturnValue({ consumed: false });
    connectEventStreamMock.mockImplementation(() => () => undefined);
    fetchWorkspacesMock.mockResolvedValue({ items: [] });
    getGatewayApiBaseUrlMock.mockReturnValue("http://bld:8787");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the access gate and does not start SSE when auth is required", async () => {
    const { App } = await import("./App");
    preflightGatewayAccessMock.mockResolvedValue({
      status: "needs-auth",
      message: "Gateway credentials are required to continue.",
      healthDetail: "Gateway health check OK (200).",
      authMode: "token",
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<App />);
    });
    await flush();

    const text = renderTreeText(renderer!);
    expect(text).toContain("Mission Control access gate");
    expect(text).toContain("Gateway credentials are required to continue.");
    expect(connectEventStreamMock).not.toHaveBeenCalled();
  });

  it("starts Mission Control normally after a ready preflight result", async () => {
    const { App } = await import("./App");
    preflightGatewayAccessMock.mockResolvedValue({
      status: "ready",
      message: "Gateway reachability and access checks passed.",
      healthDetail: "Gateway health check OK (200).",
      onboardingState: {
        completed: true,
        checklist: [],
        settings: {
          environment: "coverage",
          defaultToolProfile: "standard",
          budgetMode: "balanced",
          workspaceDir: "workspace",
          writeJailRoots: [],
          readOnlyRoots: [],
          networkAllowlist: [],
          approvalExplainer: {
            enabled: false,
            mode: "async",
            minRiskLevel: "danger",
            timeoutMs: 1000,
            maxPayloadChars: 1000,
          },
          memory: {
            enabled: false,
            qmd: {
              enabled: false,
              applyToChat: false,
              applyToOrchestration: false,
              minPromptChars: 0,
              maxContextTokens: 0,
              cacheTtlSeconds: 0,
            },
          },
          auth: {
            mode: "token",
            allowLoopbackBypass: false,
            tokenConfigured: true,
            basicConfigured: false,
          },
          llm: {
            activeProviderId: "glm",
            activeModel: "glm-5",
            providers: [],
          },
          mesh: {
            enabled: false,
            mode: "lan",
            nodeId: "mesh-local",
            mdns: false,
            staticPeers: [],
            requireMtls: true,
            tailnetEnabled: false,
          },
          npu: {
            enabled: false,
            autoStart: false,
            sidecarUrl: "http://127.0.0.1:11440",
            status: {
              processState: "stopped",
              desiredState: "stopped",
              healthy: false,
              backend: "local",
              sidecarUrl: "http://127.0.0.1:11440",
              updatedAt: new Date().toISOString(),
              capability: {
                isWindowsArm64: false,
                onnxRuntimeAvailable: false,
                onnxRuntimeGenAiAvailable: false,
                qnnExecutionProviderAvailable: false,
                supported: false,
                details: [],
              },
            },
          },
          features: {
            durableKernelV1Enabled: false,
            replayOverridesV1Enabled: false,
            memoryLifecycleAdminV1Enabled: false,
            connectorDiagnosticsV1Enabled: false,
            computerUseGuardrailsV1Enabled: false,
            bankrBuiltinEnabled: false,
            cronReviewQueueV1Enabled: false,
            replayRegressionV1Enabled: false,
          },
        },
      },
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<App />);
    });
    await flush();

    const text = renderTreeText(renderer!);
    expect(text).toContain("dashboard-ready");
    expect(connectEventStreamMock).toHaveBeenCalledTimes(1);
  });
});
