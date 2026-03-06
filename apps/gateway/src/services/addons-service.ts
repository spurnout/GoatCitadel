import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import type {
  AddonActionResponse,
  AddonCatalogEntry,
  AddonHealthCheckRecord,
  AddonInstalledRecord,
  AddonInstallRequest,
  AddonRuntimeStatus,
  AddonStatusRecord,
  AddonUninstallResponse,
} from "@goatcitadel/contracts";

interface AddonManifestFile {
  items: Record<string, AddonInstalledRecord>;
}

const ARENA_REPO_URL = "https://github.com/spurnout/goatcitadel-arena";
const ARENA_SERVER_PORT = 3099;
const ARENA_SERVER_HEALTH_URL = `http://127.0.0.1:${ARENA_SERVER_PORT}/health`;
const MANIFEST_VERSION: AddonManifestFile = {
  items: {},
};

const ADDON_CATALOG: AddonCatalogEntry[] = [
  {
    addonId: "arena",
    label: "Arena",
    description: "Optional AI gladiator arena add-on for match play, commentary, and fun agent battles.",
    owner: "spurnout",
    repoUrl: ARENA_REPO_URL,
    sameOwnerAsGoatCitadel: true,
    trustTier: "restricted",
    category: "fun_optional",
    runtimeType: "separate_repo_app",
    installCommands: [
      {
        command: "git",
        args: ["clone", "--depth", "1", ARENA_REPO_URL, "<install-dir>"],
        note: "Downloads the add-on into the GoatCitadel add-ons root.",
      },
      {
        command: "corepack",
        args: ["pnpm", "install", "--frozen-lockfile"],
        note: "Installs the Arena workspace dependencies.",
      },
      {
        command: "corepack",
        args: ["pnpm", "-r", "run", "build"],
        note: "Builds the Arena packages and server.",
      },
    ],
    webEntryMode: "none",
    requiresSeparateRepoDownload: true,
    healthChecks: [
      {
        key: "provenance",
        status: "warn",
        message: "Arena downloads code from a separate repository owned by the same publisher as GoatCitadel.",
      },
      {
        key: "ui",
        status: "warn",
        message: "Arena currently exposes a server/runtime foundation; full in-app UI display depends on a future web surface.",
      },
    ],
  },
];

export class AddonsService {
  private readonly goatHomeDir: string;
  private readonly addonsRootDir: string;
  private readonly manifestPath: string;

  public constructor(private readonly rootDir: string) {
    this.goatHomeDir = resolveGoatCitadelHome(rootDir);
    this.addonsRootDir = path.join(this.goatHomeDir, "addons");
    this.manifestPath = path.join(this.addonsRootDir, "manifest.json");
  }

  public listCatalog(): AddonCatalogEntry[] {
    return ADDON_CATALOG.map((item) => structuredClone(item));
  }

  public async listInstalled(): Promise<AddonInstalledRecord[]> {
    const manifest = await this.readManifest();
    return Object.values(manifest.items).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async getStatus(addonId: string): Promise<AddonStatusRecord> {
    const addon = this.requireCatalogEntry(addonId);
    const manifest = await this.readManifest();
    const installed = manifest.items[addonId];
    const refreshed = installed ? await this.refreshInstalledRecord(addon, installed) : undefined;
    if (refreshed && this.hasInstalledRecordChanged(installed, refreshed)) {
      manifest.items[addonId] = refreshed;
      await this.writeManifest(manifest);
    }
    return {
      addon,
      installed: refreshed,
      status: refreshed?.runtimeStatus ?? "not_installed",
      healthChecks: await this.buildHealthChecks(addon, refreshed),
    };
  }

  public async install(addonId: string, input: AddonInstallRequest): Promise<AddonActionResponse> {
    const addon = this.requireCatalogEntry(addonId);
    if (!input.confirmRepoDownload) {
      throw new Error("Addon install requires explicit confirmation that a separate repository will be downloaded.");
    }
    await fs.mkdir(this.addonsRootDir, { recursive: true });

    const manifest = await this.readManifest();
    const targetDir = path.join(this.addonsRootDir, addonId);
    if (fsSync.existsSync(targetDir)) {
      const existing = manifest.items[addonId];
      if (existing) {
        return { status: await this.getStatus(addonId) };
      }
      throw new Error(`Addon target path already exists: ${targetDir}`);
    }

    runCommand("git", ["clone", "--depth", "1", addon.repoUrl, targetDir], this.rootDir);
    runCommand("corepack", ["pnpm", "install", "--frozen-lockfile"], targetDir);
    runCommand("corepack", ["pnpm", "-r", "run", "build"], targetDir);

    const now = new Date().toISOString();
    manifest.items[addonId] = {
      addonId,
      installedPath: targetDir,
      repoUrl: addon.repoUrl,
      owner: addon.owner,
      sameOwnerAsGoatCitadel: addon.sameOwnerAsGoatCitadel,
      trustTier: addon.trustTier,
      runtimeType: addon.runtimeType,
      webEntryMode: addon.webEntryMode,
      installRef: readGitRef(targetDir),
      installedAt: now,
      updatedAt: now,
      consentedAt: now,
      consentedBy: input.actorId?.trim() || "operator",
      runtimeStatus: "installed",
    };
    await this.writeManifest(manifest);
    return {
      status: await this.getStatus(addonId),
    };
  }

  public async update(addonId: string): Promise<AddonActionResponse> {
    const manifest = await this.readManifest();
    const current = this.requireInstalledRecord(addonId, manifest);
    if (!fsSync.existsSync(current.installedPath)) {
      throw new Error(`Installed add-on path is missing: ${current.installedPath}`);
    }
    runCommand("git", ["-C", current.installedPath, "pull", "--ff-only"], this.rootDir);
    runCommand("corepack", ["pnpm", "install", "--frozen-lockfile"], current.installedPath);
    runCommand("corepack", ["pnpm", "-r", "run", "build"], current.installedPath);
    manifest.items[addonId] = {
      ...current,
      installRef: readGitRef(current.installedPath),
      updatedAt: new Date().toISOString(),
      runtimeStatus: current.runtimeStatus === "running" ? "running" : "installed",
      lastError: undefined,
    };
    await this.writeManifest(manifest);
    return {
      status: await this.getStatus(addonId),
    };
  }

  public async launch(addonId: string): Promise<AddonActionResponse> {
    const manifest = await this.readManifest();
    const current = this.requireInstalledRecord(addonId, manifest);
    if (addonId !== "arena") {
      throw new Error(`Launch flow is not implemented for add-on ${addonId}.`);
    }
    if (!fsSync.existsSync(current.installedPath)) {
      throw new Error(`Installed add-on path is missing: ${current.installedPath}`);
    }
    const alreadyRunning = typeof current.pid === "number" && isProcessRunning(current.pid);
    if (!alreadyRunning) {
      const child = spawnDetachedCommand(
        "corepack",
        ["pnpm", "--filter", "@arena/server", "start"],
        current.installedPath,
        {
          ARENA_HOST: "127.0.0.1",
          ARENA_PORT: String(ARENA_SERVER_PORT),
          CORS_ORIGIN: "http://127.0.0.1:5173",
          GOATCITADEL_BASE_URL: "http://127.0.0.1:8787",
        },
      );
      current.pid = child.pid;
    }

    const ready = await waitForHealth(ARENA_SERVER_HEALTH_URL, 12_000);
    const updated: AddonInstalledRecord = {
      ...current,
      runtimeStatus: ready ? "running" : "error",
      updatedAt: new Date().toISOString(),
      lastError: ready ? undefined : `Arena health check did not become ready at ${ARENA_SERVER_HEALTH_URL}.`,
    };
    manifest.items[addonId] = updated;
    await this.writeManifest(manifest);
    return {
      status: await this.getStatus(addonId),
    };
  }

  public async stop(addonId: string): Promise<AddonActionResponse> {
    const manifest = await this.readManifest();
    const current = this.requireInstalledRecord(addonId, manifest);
    if (typeof current.pid === "number") {
      killProcessTree(current.pid);
    }
    const updated: AddonInstalledRecord = {
      ...current,
      pid: undefined,
      runtimeStatus: "stopped",
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    manifest.items[addonId] = updated;
    await this.writeManifest(manifest);
    return {
      status: await this.getStatus(addonId),
    };
  }

  public async uninstall(addonId: string): Promise<AddonUninstallResponse> {
    const manifest = await this.readManifest();
    const current = this.requireInstalledRecord(addonId, manifest);
    if (typeof current.pid === "number") {
      killProcessTree(current.pid);
    }
    await fs.rm(current.installedPath, { recursive: true, force: true });
    delete manifest.items[addonId];
    await this.writeManifest(manifest);
    return {
      addonId,
      removed: true,
    };
  }

  private async buildHealthChecks(
    addon: AddonCatalogEntry,
    installed?: AddonInstalledRecord,
  ): Promise<AddonHealthCheckRecord[]> {
    const checks: AddonHealthCheckRecord[] = [...addon.healthChecks];
    if (!installed) {
      checks.push({
        key: "install",
        status: "warn",
        message: "Add-on is not installed yet.",
      });
      return checks;
    }

    checks.push({
      key: "installed_path",
      status: fsSync.existsSync(installed.installedPath) ? "pass" : "fail",
      message: fsSync.existsSync(installed.installedPath)
        ? `Installed at ${installed.installedPath}.`
        : `Installed path is missing: ${installed.installedPath}.`,
    });

    const arenaServerEntry = path.join(installed.installedPath, "apps", "server", "dist", "index.js");
    checks.push({
      key: "build_output",
      status: fsSync.existsSync(arenaServerEntry) ? "pass" : "warn",
      message: fsSync.existsSync(arenaServerEntry)
        ? "Arena server build output exists."
        : "Arena build output is missing; rerun update/build if launch fails.",
    });

    if (installed.runtimeStatus === "running") {
      const healthy = await waitForHealth(ARENA_SERVER_HEALTH_URL, 1_500);
      checks.push({
        key: "health",
        status: healthy ? "pass" : "fail",
        message: healthy
          ? `Health check passed at ${ARENA_SERVER_HEALTH_URL}.`
          : `Health check failed at ${ARENA_SERVER_HEALTH_URL}.`,
      });
    } else {
      checks.push({
        key: "health",
        status: "warn",
        message: "Add-on runtime is not running yet.",
      });
    }

    return checks;
  }

  private async refreshInstalledRecord(
    addon: AddonCatalogEntry,
    installed: AddonInstalledRecord,
  ): Promise<AddonInstalledRecord> {
    if (!fsSync.existsSync(installed.installedPath)) {
      return {
        ...installed,
        runtimeStatus: "error",
        lastError: `Installed path is missing: ${installed.installedPath}.`,
        updatedAt: new Date().toISOString(),
      };
    }
    const hasRunningPid = typeof installed.pid === "number" && isProcessRunning(installed.pid);
    if (!hasRunningPid && installed.runtimeStatus === "running") {
      return {
        ...installed,
        pid: undefined,
        runtimeStatus: "stopped",
        updatedAt: new Date().toISOString(),
      };
    }
    if (addon.addonId === "arena" && hasRunningPid) {
      const healthy = await waitForHealth(ARENA_SERVER_HEALTH_URL, 1_500);
      if (!healthy) {
        return {
          ...installed,
          runtimeStatus: "error",
          lastError: `Arena process is running but health check failed at ${ARENA_SERVER_HEALTH_URL}.`,
          updatedAt: new Date().toISOString(),
        };
      }
    }
    return installed;
  }

  private requireCatalogEntry(addonId: string): AddonCatalogEntry {
    const addon = ADDON_CATALOG.find((item) => item.addonId === addonId);
    if (!addon) {
      throw new Error(`Unknown add-on: ${addonId}`);
    }
    return structuredClone(addon);
  }

  private requireInstalledRecord(addonId: string, manifest: AddonManifestFile): AddonInstalledRecord {
    const installed = manifest.items[addonId];
    if (!installed) {
      throw new Error(`Add-on ${addonId} is not installed.`);
    }
    return installed;
  }

  private async readManifest(): Promise<AddonManifestFile> {
    await fs.mkdir(this.addonsRootDir, { recursive: true });
    if (!fsSync.existsSync(this.manifestPath)) {
      return structuredClone(MANIFEST_VERSION);
    }
    try {
      const raw = await fs.readFile(this.manifestPath, "utf8");
      const parsed = JSON.parse(raw) as AddonManifestFile;
      return {
        items: parsed.items ?? {},
      };
    } catch {
      return structuredClone(MANIFEST_VERSION);
    }
  }

  private async writeManifest(manifest: AddonManifestFile): Promise<void> {
    await fs.mkdir(this.addonsRootDir, { recursive: true });
    await fs.writeFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  private hasInstalledRecordChanged(
    previous: AddonInstalledRecord | undefined,
    next: AddonInstalledRecord,
  ): boolean {
    return JSON.stringify(previous) !== JSON.stringify(next);
  }
}

function resolveGoatCitadelHome(rootDir: string): string {
  const envHome = process.env.GOATCITADEL_HOME?.trim();
  if (envHome) {
    return path.resolve(envHome);
  }

  const normalizedRoot = path.resolve(rootDir);
  if (path.basename(normalizedRoot).toLowerCase() === "app") {
    const parent = path.dirname(normalizedRoot);
    if (path.basename(parent).toLowerCase() === ".goatcitadel") {
      return parent;
    }
  }

  return path.join(os.homedir(), ".GoatCitadel");
}

function runCommand(command: string, args: string[], cwd: string): void {
  if (process.platform === "win32") {
    const commandLine = [command, ...args].map(quoteWindowsArg).join(" ");
    execFileSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
    });
    return;
  }
  execFileSync(command, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  });
}

function quoteWindowsArg(value: string): string {
  if (!/[\\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\"", "\\\"")}"`;
}

function spawnDetachedCommand(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string>,
): { pid: number } {
  if (process.platform === "win32") {
    const commandLine = [command, ...args].map(quoteWindowsArg).join(" ");
    const child = spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        ...extraEnv,
      },
    });
    child.unref();
    if (typeof child.pid !== "number") {
      throw new Error("Failed to start add-on process.");
    }
    return { pid: child.pid };
  }

  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  child.unref();
  if (typeof child.pid !== "number") {
    throw new Error("Failed to start add-on process.");
  }
  return { pid: child.pid };
}

function readGitRef(targetDir: string): string | undefined {
  try {
    const result = execFileSync("git", ["-C", targetDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return result.trim() || undefined;
  } catch {
    return undefined;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    process.kill(pid, "SIGTERM");
  } catch {
    // Best effort stop; status refresh will mark failures later.
  }
}

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        return true;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}
