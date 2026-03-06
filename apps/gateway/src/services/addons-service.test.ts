import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() =>
  vi.fn(() => ({
    pid: 4321,
    unref: vi.fn(),
  })),
);

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
  spawn: spawnMock,
}));

import { AddonsService, __internal } from "./addons-service.js";

describe("AddonsService", () => {
  let tempDir: string;
  let goatHome: string;

  beforeEach(async () => {
    execFileSyncMock.mockReset();
    spawnMock.mockClear();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "goatcitadel-addons-"));
    goatHome = path.join(tempDir, ".GoatCitadel");
    process.env.GOATCITADEL_HOME = goatHome;
  });

  afterEach(async () => {
    delete process.env.GOATCITADEL_HOME;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("quotes Windows command arguments with spaces and shell metacharacters", () => {
    const command = __internal.buildWindowsCommand([
      "git",
      "clone",
      "http://example.invalid/a&calc",
      "C:\\Users\\John Doe\\Goat Arena",
    ]);

    expect(command).toContain("\"http://example.invalid/a&calc\"");
    expect(command).toContain("\"C:\\\\Users\\\\John Doe\\\\Goat Arena\"");
  });

  it("rejects addon paths that escape the addons root", async () => {
    const addonsRoot = path.join(goatHome, "addons");
    await fs.mkdir(addonsRoot, { recursive: true });

    expect(() =>
      __internal.assertAddonPathWithinRoot(path.join(addonsRoot, "..", "..", "Documents"), addonsRoot),
    ).toThrow("escapes add-ons root");
  });

  it("rejects a tampered manifest before uninstalling", async () => {
    const addonsRoot = path.join(goatHome, "addons");
    await fs.mkdir(addonsRoot, { recursive: true });
    await fs.writeFile(
      path.join(addonsRoot, "manifest.json"),
      `${JSON.stringify({
        items: {
          arena: {
            addonId: "arena",
            installedPath: path.join(addonsRoot, "..", "..", "Documents"),
            repoUrl: "https://github.com/spurnout/goatcitadel-arena",
            owner: "spurnout",
            sameOwnerAsGoatCitadel: true,
            trustTier: "restricted",
            runtimeType: "separate_repo_app",
            webEntryMode: "none",
            installedAt: "2026-03-06T00:00:00.000Z",
            updatedAt: "2026-03-06T00:00:00.000Z",
            consentedAt: "2026-03-06T00:00:00.000Z",
            consentedBy: "operator",
            runtimeStatus: "installed",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const service = new AddonsService(tempDir);

    await expect(service.uninstall("arena")).rejects.toThrow("Invalid add-on manifest");
  });

  it("rolls back addon updates when install or build fails after pull", async () => {
    const addonsRoot = path.join(goatHome, "addons");
    const addonPath = path.join(addonsRoot, "arena");
    await fs.mkdir(addonPath, { recursive: true });
    await fs.writeFile(
      path.join(addonsRoot, "manifest.json"),
      `${JSON.stringify({
        items: {
          arena: {
            addonId: "arena",
            installedPath: addonPath,
            repoUrl: "https://github.com/spurnout/goatcitadel-arena",
            owner: "spurnout",
            sameOwnerAsGoatCitadel: true,
            trustTier: "restricted",
            runtimeType: "separate_repo_app",
            webEntryMode: "none",
            installRef: "abc123",
            installedAt: "2026-03-06T00:00:00.000Z",
            updatedAt: "2026-03-06T00:00:00.000Z",
            consentedAt: "2026-03-06T00:00:00.000Z",
            consentedBy: "operator",
            runtimeStatus: "installed",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    execFileSyncMock.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === "git" && args?.includes("rev-parse")) {
        return "abc123\n";
      }
      if (cmd === "cmd.exe") {
        const commandLine = args?.[3] ?? "";
        if (commandLine.includes("pull --ff-only")) {
          return "";
        }
        if (commandLine.includes("pnpm install --frozen-lockfile")) {
          throw new Error("pnpm install failed");
        }
        if (commandLine.includes("reset --hard abc123")) {
          return "";
        }
      }
      return "";
    });

    const service = new AddonsService(tempDir);

    await expect(service.update("arena")).rejects.toThrow("pnpm install failed");

    expect(execFileSyncMock).toHaveBeenCalledWith(
      "cmd.exe",
      expect.arrayContaining([expect.stringContaining("reset --hard abc123")]),
      expect.objectContaining({ cwd: addonPath }),
    );

    const manifest = JSON.parse(await fs.readFile(path.join(addonsRoot, "manifest.json"), "utf8")) as {
      items: Record<string, { installRef?: string; lastError?: string }>;
    };
    expect(manifest.items.arena).toBeDefined();
    expect(manifest.items.arena!.installRef).toBe("abc123");
    expect(manifest.items.arena!.lastError).toContain("pnpm install failed");
  });
});
