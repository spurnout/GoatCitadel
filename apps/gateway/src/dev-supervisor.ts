import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const gatewayHost = process.env.GATEWAY_HOST ?? "127.0.0.1";
const gatewayPort = Number(process.env.GATEWAY_PORT ?? 8787);
const pollMs = Number(process.env.GOATCITADEL_GATEWAY_WATCH_POLL_MS ?? 1200);
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
  path.join(repoRoot, "config", "assistant.config.json"),
  path.join(repoRoot, "config", "tool-policy.json"),
  path.join(repoRoot, "config", "budgets.json"),
  path.join(repoRoot, "config", "llm-providers.json"),
  path.join(repoRoot, "config", "cron-jobs.json"),
  path.join(repoRoot, "config", "goatcitadel.json"),
];

let child: ChildProcess | null = null;
let shuttingDown = false;
let restarting = false;
let polling = false;
let lastSignature = "";

async function main(): Promise<void> {
  console.log(`[gateway-supervisor] root: ${repoRoot}`);
  console.log(`[gateway-supervisor] watching for changes (${pollMs}ms poll)`);
  console.log(`[gateway-supervisor] target health: http://${gatewayHost}:${gatewayPort}/health`);

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
  restarting = true;
  try {
    console.log(`[gateway-supervisor] restarting gateway (${reason})`);
    await stopChild("restart");
    await startChild();
  } finally {
    restarting = false;
  }
}

async function startChild(): Promise<void> {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const args = ["exec", "tsx", "src/main.ts"];

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
    console.log(
      `[gateway-supervisor] gateway exited (pid=${currentPid}, code=${code ?? "null"}, signal=${signal ?? "null"}). Waiting for file changes...`,
    );
  });

  const healthy = await waitForGatewayHealth(15_000);
  if (healthy) {
    console.log(`[gateway-supervisor] gateway online (pid=${currentPid})`);
    return;
  }

  console.log("[gateway-supervisor] gateway did not become healthy in time; waiting for next change");
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
  await waitForPortClosed(10_000);
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

async function waitForPortClosed(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await isPortOpen();
    if (!open) {
      return;
    }
    await sleep(250);
  }
}

async function isGatewayHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`http://${gatewayHost}:${gatewayPort}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function isPortOpen(): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: gatewayHost, port: gatewayPort });
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
  console.log(`[gateway-supervisor] shutdown signal: ${signal}`);
  await stopChild(signal);
  process.exitCode = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[gateway-supervisor] fatal: ${(error as Error).message}`);
  process.exitCode = 1;
});
