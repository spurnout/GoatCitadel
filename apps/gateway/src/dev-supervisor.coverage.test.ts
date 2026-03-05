import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();
const createConnectionMock = vi.fn();
const statMock = vi.fn();
const readdirMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

vi.mock("node:net", () => ({
  default: {
    createConnection: createConnectionMock,
  },
}));

vi.mock("node:fs/promises", () => ({
  stat: statMock,
  readdir: readdirMock,
}));

function createSocketMock(): {
  once: (event: string, callback: () => void) => unknown;
  setTimeout: (_ms: number, callback: () => void) => unknown;
  destroy: () => void;
} {
  const socket = {
    once: (_event: string, callback: () => void) => {
      if (_event === "error") {
        setTimeout(() => callback(), 0);
      }
      return socket;
    },
    setTimeout: (_ms: number, callback: () => void) => {
      setTimeout(() => callback(), 0);
      return socket;
    },
    destroy: () => undefined,
  };
  return socket;
}

describe("dev supervisor coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
    createConnectionMock.mockReset();
    statMock.mockReset();
    readdirMock.mockReset();

    process.env.GOATCITADEL_GATEWAY_WATCH_POLL_MS = "999999";
    process.env.GATEWAY_HOST = "127.0.0.1";
    process.env.GATEWAY_PORT = "8787";

    statMock.mockImplementation(async () => {
      throw new Error("not found");
    });
    readdirMock.mockResolvedValue([]);
    createConnectionMock.mockImplementation(() => createSocketMock());
    spawnSyncMock.mockReturnValue({ status: 0 });

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        pid: number;
        kill: () => boolean;
      };
      child.pid = 12345;
      child.kill = () => true;
      return child;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
  });

  afterEach(() => {
    delete process.env.GOATCITADEL_GATEWAY_WATCH_POLL_MS;
    delete process.env.GATEWAY_HOST;
    delete process.env.GATEWAY_PORT;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts and handles shutdown signal without throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./dev-supervisor.js");
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.emit("SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(spawnMock).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("[gateway-supervisor] fatal"));
  });
});
