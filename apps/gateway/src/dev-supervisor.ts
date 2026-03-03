import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFile } from "./env-file.js";

loadLocalEnvFile();

const gatewayHost = process.env.GATEWAY_HOST ?? "0.0.0.0";
const gatewayHealthHost = resolveGatewayHealthHost(gatewayHost);
const gatewayPort = Number(process.env.GATEWAY_PORT ?? 8787);
const warnUnauthNonLoopback = resolveWarnUnauthNonLoopback();
const pollMs = Number(process.env.GOATCITADEL_GATEWAY_WATCH_POLL_MS ?? 1200);
const restartWindowMs = Number(process.env.GOATCITADEL_GATEWAY_RESTART_WINDOW_MS ?? 60_000);
const restartMaxFailures = Number(process.env.GOATCITADEL_GATEWAY_RESTART_MAX_FAILURES ?? 5);
const restartBaseBackoffMs = Number(process.env.GOATCITADEL_GATEWAY_RESTART_BASE_BACKOFF_MS ?? 1000);
const restartMaxBackoffMs = Number(process.env.GOATCITADEL_GATEWAY_RESTART_MAX_BACKOFF_MS ?? 30_000);
const restartCircuitOpenMs = Number(process.env.GOATCITADEL_GATEWAY_RESTART_CIRCUIT_MS ?? 60_000);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const gatewayDir = path.join(repoRoot, "apps", "gateway");

const watchRoots = [
  path.join(gatewayDir, "src"),
  path.join(repoRoot, "packages", "contracts", "src"),
  path.join(repoRoot, "packages", "storage", "src"),
  path.join(repoRoot, "packages", "gateway-core", "src"),
  path.join(repoRoot, "packages", "policy-engine", "src"),
  path.join(repoRoot, "packages", "skills", "src"),
  path.join(repoRoot, "packages", "orchestration", "src"),
  path.join(repoRoot, "packages", "mesh-core", "src"),
];

let child: ChildProcess | null = null;
let shuttingDown = false;
let restarting = false;
let polling = false;
let lastSignature = "";
let restartTimer: NodeJS.Timeout | null = null;
let circuitOpenUntil = 0;
const failureTimestamps: number[] = [];

async function main(): Promise<void> {
  console.log(`[gateway-supervisor] root: ${repoRoot}`);
  console.log(`[gateway-supervisor] watching for changes (${pollMs}ms poll)`);
  console.log(`[gateway-supervisor] target health: http://${gatewayHealthHost}:${gatewayPort}/health`);
  console.log(
    `[gateway-supervisor] restart budget: max ${restartMaxFailures} failures per ${restartWindowMs}ms`,
  );
  if (warnUnauthNonLoopback && shouldWarnUnauthNonLoopbackBind(gatewayHost)) {
    console.warn(
      "[gateway-supervisor] warning: non-loopback bind without explicit auth env detected. "
      + "Consider GOATCITADEL_AUTH_TOKEN or GOATCITADEL_AUTH_MODE=basic for safer remote access.",
    );
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  lastSignature = await computeSignature();
  await restartGateway("initial start");

  setInterval(() => {
    void pollForChanges();
  }, pollMs).unref();
}

async function pollForChanges(): Promise<void> {
  if (polling || restarting || shuttingDown) {
    return;
  }
  polling = true;
  try {
    const next = await computeSignature();
    if (next !== lastSignature) {
      lastSignature = next;
      await restartGateway("source/config change");
    }
  } finally {
    polling = false;
  }
}

async function restartGateway(reason: string): Promise<void> {
  if (restarting || shuttingDown) {
    return;
  }
  const now = Date.now();
  if (now < circuitOpenUntil) {
    const remaining = circuitOpenUntil - now;
    console.warn(
      `[gateway-supervisor] restart circuit is open for ${remaining}ms (reason=${reason})`,
    );
    scheduleRestartAfter(remaining, "circuit reopen");
    return;
  }
  restarting = true;
  try {
    clearRestartTimer();
    console.log(`[gateway-supervisor] restarting gateway (${reason})`);
    await stopChild("restart");
    await startChild();
  } finally {
    restarting = false;
  }
}

async function startChild(): Promise<void> {
  const { command, args } = buildGatewayStartCommand();

  child = spawn(command, args, {
    cwd: gatewayDir,
    env: {
      ...process.env,
      GOATCITADEL_ROOT_DIR: repoRoot,
      GATEWAY_HOST: gatewayHost,
      GATEWAY_PORT: String(gatewayPort),
      GOATCITADEL_GATEWAY_SUPERVISED: "1",
    },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  const currentPid = child.pid;
  if (!currentPid) {
    throw new Error("failed to start gateway child process");
  }

  child.on("exit", (code, signal) => {
    if (child?.pid === currentPid) {
      child = null;
    }
    if (shuttingDown || restarting) {
      return;
    }
    console.warn(
      `[gateway-supervisor] gateway exited (pid=${currentPid}, code=${code ?? "null"}, signal=${signal ?? "null"}). Waiting for file changes...`,
    );
    const delay = registerFailureAndGetDelay("process_exit");
    if (delay !== null) {
      scheduleRestartAfter(delay, "process exit");
    }
  });

  const healthy = await waitForGatewayHealth(15_000);
  if (healthy) {
    resetFailureBudget();
    console.log(`[gateway-supervisor] gateway online (pid=${currentPid})`);
    return;
  }

  console.warn("[gateway-supervisor] gateway did not become healthy in time");
  const delay = registerFailureAndGetDelay("health_timeout");
  if (delay !== null) {
    scheduleRestartAfter(delay, "health timeout");
  }
}

function buildGatewayStartCommand(): { command: string; args: string[] } {
  if (process.platform === "win32") {
    // Node 24 on Windows can throw spawn EINVAL when launching *.cmd directly.
    // Using cmd /c is stable and keeps behavior identical for local dev usage.
    const comspec = process.env.ComSpec || "cmd.exe";
    return {
      command: comspec,
      args: ["/d", "/s", "/c", "pnpm exec tsx src/main.ts"],
    };
  }
  return {
    command: "pnpm",
    args: ["exec", "tsx", "src/main.ts"],
  };
}

async function stopChild(reason: string): Promise<void> {
  const running = child;
  if (!running?.pid) {
    return;
  }

  const pid = running.pid;
  console.log(`[gateway-supervisor] stopping gateway (pid=${pid}, reason=${reason})`);

  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        running.kill("SIGTERM");
      }
      await sleep(1200);
      if (isProcessAlive(pid)) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          running.kill("SIGKILL");
        }
      }
    }
  } catch {
    // ignore kill failures; we still wait for port closure below.
  }

  child = null;
  const portClosed = await waitForPortClosed(10_000);
  if (!portClosed) {
    console.warn(
      `[gateway-supervisor] warning: gateway port ${gatewayHost}:${gatewayPort} did not release before timeout`,
    );
  }
}

async function waitForGatewayHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isGatewayHealthy()) {
      return true;
    }
    await sleep(300);
  }
  return false;
}

async function waitForPortClosed(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await isPortOpen();
    if (!open) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function isGatewayHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`http://${gatewayHealthHost}:${gatewayPort}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function isPortOpen(): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: gatewayHealthHost, port: gatewayPort });
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1_000, () => finish(false));
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function computeSignature(): Promise<string> {
  const entries: string[] = [];
  for (const watchRoot of watchRoots) {
    await collectPathSignature(watchRoot, entries);
  }
  entries.sort();
  return entries.join("|");
}

async function collectPathSignature(targetPath: string, out: string[]): Promise<void> {
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(targetPath);
  } catch {
    return;
  }

  if (stat.isDirectory()) {
    const items = await fs.readdir(targetPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name === "node_modules" || item.name === "dist" || item.name === ".git") {
        continue;
      }
      await collectPathSignature(path.join(targetPath, item.name), out);
    }
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  if (![".ts", ".tsx", ".json"].includes(ext)) {
    return;
  }

  const relative = path.relative(repoRoot, targetPath).replaceAll("\\", "/");
  out.push(`${relative}:${stat.mtimeMs}`);
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  clearRestartTimer();
  console.log(`[gateway-supervisor] shutdown signal: ${signal}`);
  await stopChild(signal);
  process.exitCode = 0;
}

function registerFailureAndGetDelay(reason: string): number | null {
  const now = Date.now();
  pruneFailures(now);
  failureTimestamps.push(now);
  const failures = failureTimestamps.length;
  const computedDelay = Math.min(
    restartMaxBackoffMs,
    Math.round(restartBaseBackoffMs * (2 ** Math.max(0, failures - 1))),
  );

  if (failures > restartMaxFailures) {
    circuitOpenUntil = now + restartCircuitOpenMs;
    console.error(
      `[gateway-supervisor] restart budget exceeded (${failures}/${restartMaxFailures}) after ${reason}; circuit open for ${restartCircuitOpenMs}ms`,
    );
    return restartCircuitOpenMs;
  }

  return computedDelay;
}

function scheduleRestartAfter(delayMs: number, reason: string): void {
  if (shuttingDown || restarting || restartTimer) {
    return;
  }
  const delay = Math.max(100, delayMs);
  console.log(`[gateway-supervisor] scheduling restart in ${delay}ms (${reason})`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restartGateway(reason);
  }, delay);
  restartTimer.unref();
}

function clearRestartTimer(): void {
  if (!restartTimer) {
    return;
  }
  clearTimeout(restartTimer);
  restartTimer = null;
}

function pruneFailures(now = Date.now()): void {
  while (failureTimestamps.length > 0 && (now - (failureTimestamps[0] ?? now)) > restartWindowMs) {
    failureTimestamps.shift();
  }
}

function resetFailureBudget(): void {
  failureTimestamps.length = 0;
  circuitOpenUntil = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveGatewayHealthHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]") {
    return "127.0.0.1";
  }
  return host;
}

function resolveWarnUnauthNonLoopback(): boolean {
  const raw = process.env.GOATCITADEL_WARN_UNAUTH_NON_LOOPBACK?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function shouldWarnUnauthNonLoopbackBind(bindHost: string): boolean {
  if (isLoopbackHost(bindHost)) {
    return false;
  }
  const mode = process.env.GOATCITADEL_AUTH_MODE?.trim().toLowerCase() ?? "none";
  if (mode === "none") {
    return true;
  }
  if (mode === "token") {
    return !process.env.GOATCITADEL_AUTH_TOKEN?.trim();
  }
  if (mode === "basic") {
    return !(process.env.GOATCITADEL_AUTH_BASIC_USERNAME?.trim() && process.env.GOATCITADEL_AUTH_BASIC_PASSWORD?.trim());
  }
  return true;
}

function isLoopbackHost(value: string): boolean {
  const host = value.trim().toLowerCase();
  if (!host) {
    return false;
  }
  return host === "127.0.0.1"
    || host === "localhost"
    || host === "::1"
    || host === "[::1]";
}

main().catch((error) => {
  console.error(`[gateway-supervisor] fatal: ${(error as Error).message}`);
  process.exitCode = 1;
});
