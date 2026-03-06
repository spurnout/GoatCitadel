import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let answers: string[] = [];
const questionMock = vi.fn(async () => answers.shift() ?? "");
const closeMock = vi.fn();
const createInterfaceMock = vi.fn(() => ({
  question: questionMock,
  close: closeMock,
}));

vi.mock("node:readline/promises", () => ({
  createInterface: createInterfaceMock,
}));

describe("onboarding tui entrypoint coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    answers = new Array(32).fill("");
    questionMock.mockClear();
    closeMock.mockClear();
    createInterfaceMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOATCITADEL_GATEWAY_URL;
  });

  it("runs wizard flow using default answers", async () => {
    const initialState = {
      completed: false,
      completedAt: null,
      completedBy: null,
      checklist: [
        { key: "gateway", label: "Gateway", status: "done" },
        { key: "auth", label: "Auth", status: "pending" },
      ],
      settings: {
        defaultToolProfile: "minimal",
        budgetMode: "balanced",
        networkAllowlist: [],
        auth: {
          mode: "none",
          allowLoopbackBypass: true,
        },
        llm: {
          activeProviderId: "openai",
          activeModel: "gpt-4.1-mini",
          providers: [
            {
              providerId: "openai",
              label: "OpenAI",
              baseUrl: "https://api.openai.com/v1",
              defaultModel: "gpt-4.1-mini",
            },
          ],
        },
        mesh: {
          enabled: false,
          mode: "lan",
          nodeId: "node-local",
          mdns: true,
          staticPeers: [],
          requireMtls: false,
          tailnetEnabled: false,
        },
      },
    };

    const bootstrap = {
      appliedAt: new Date().toISOString(),
      state: {
        completed: true,
        checklist: [
          { key: "gateway", label: "Gateway", status: "done" },
          { key: "auth", label: "Auth", status: "done" },
        ],
      },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(bootstrap), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./onboarding-tui.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createInterfaceMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(questionMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalledWith("Onboarding wizard failed.");
  });

  it("covers token auth, secure-store key save, and mesh-enabled branches", async () => {
    answers = [
      "", // gateway url
      "2", // auth mode token
      "token-123", // gateway token
      "custom", // provider template custom
      "custom-provider",
      "Custom Provider",
      "http://127.0.0.1:1234/v1",
      "custom-model",
      "custom-model",
      "sk-123", // provider api key
      "y", // save provider key to secure store
      "GOAT_KEY", // provider env
      "2", // tool profile standard
      "3", // budget mode power
      "host.local", // network allowlist
      "y", // mesh enabled
      "3", // mesh mode tailnet
      "node-custom", // mesh node id
      "n", // mesh mdns
      "peer1,peer2", // mesh peers
      "y", // mesh require mtls
      "y", // mesh tailnet enabled
      "y", // mark complete
      "coverage-operator", // completed by
    ];

    const initialState = {
      completed: false,
      checklist: [{ key: "auth", label: "Auth", status: "pending" }],
      settings: {
        defaultToolProfile: "minimal",
        budgetMode: "balanced",
        networkAllowlist: [],
        auth: {
          mode: "none",
          allowLoopbackBypass: true,
        },
        llm: {
          activeProviderId: "openai",
          activeModel: "gpt-4.1-mini",
          providers: [
            {
              providerId: "openai",
              label: "OpenAI",
              baseUrl: "https://api.openai.com/v1",
              defaultModel: "gpt-4.1-mini",
            },
          ],
        },
        mesh: {
          enabled: false,
          mode: "lan",
          nodeId: "node-local",
          mdns: true,
          staticPeers: [],
          requireMtls: false,
          tailnetEnabled: false,
        },
      },
    };

    const bootstrap = {
      appliedAt: new Date().toISOString(),
      state: {
        completed: true,
        checklist: [{ key: "auth", label: "Auth", status: "done" }],
      },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(bootstrap), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    await import("./onboarding-tui.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bootstrapCall = fetchMock.mock.calls[1];
    expect(String(bootstrapCall?.[0])).toContain("/api/v1/onboarding/bootstrap");
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("logs failures when onboarding request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    await import("./onboarding-tui.js");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalledWith("Onboarding wizard failed.");
  });
});
