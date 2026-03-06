#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const defaultRepoUrl = process.env.GOATCITADEL_REPO_URL || "https://github.com/spurnout/GoatCitadel.git";
const preferredBaseDir = path.join(os.homedir(), ".GoatCitadel");
const legacyBaseDir = path.join(os.homedir(), ".goatcitadel");
const pnpmVersion = "10.29.3";

const args = process.argv.slice(2);
const command = args[0] || "help";
const rawRest = args.slice(1);
const installArgs = command === "install" || command === "update"
  ? parseInstallArgs(rawRest)
  : { passthrough: rawRest };
const repoUrl = installArgs.repoUrl || defaultRepoUrl;
const baseDir = resolveBaseDir(installArgs.installDir);
const appDir = path.join(baseDir, "app");
const rest = installArgs.passthrough;

async function main() {
  if (command === "help" || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "install" || command === "update") {
    installOrUpdate();
    return;
  }

  if (!fs.existsSync(path.join(appDir, "package.json"))) {
    console.log("GoatCitadel is not installed yet. Bootstrapping now...");
    installOrUpdate();
  }

  if (command === "up") {
    runPnpm(["--dir", appDir, "dev", ...rest]);
    return;
  }
  if (command === "gateway") {
    runPnpm(["--dir", appDir, "dev:gateway", ...rest]);
    return;
  }
  if (command === "ui") {
    runPnpm(["--dir", appDir, "dev:ui", ...rest]);
    return;
  }
  if (command === "onboard") {
    runPnpm(["--dir", appDir, "onboarding:tui", ...rest]);
    return;
  }
  if (command === "tui") {
    runPnpm(["--dir", appDir, "tui", ...rest]);
    return;
  }
  if (command === "tools") {
    runPnpm(["--dir", appDir, "tools", ...rest]);
    return;
  }
  if (command === "admin") {
    runPnpm(["--dir", appDir, "admin", ...rest]);
    return;
  }
  if (command === "smoke") {
    runPnpm(["--dir", appDir, "smoke", ...rest]);
    return;
  }
  if (command === "npu" || command === "npu-sidecar") {
    run("python", [path.join(appDir, "apps", "npu-sidecar", "server.py"), ...rest]);
    return;
  }
  if (command === "doctor") {
    doctor(rest);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

function installOrUpdate() {
  const gitCmd = requireCommand("git");
  requireCommand("node");
  const corepackCmd = requireCommand("corepack");

  fs.mkdirSync(baseDir, { recursive: true });

  if (fs.existsSync(path.join(appDir, ".git"))) {
    console.log(`Updating GoatCitadel in ${appDir}...`);
    run(gitCmd, ["-C", appDir, "fetch", "--all", "--prune"]);
    run(gitCmd, ["-C", appDir, "pull", "--ff-only"]);
  } else {
    if (fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
    console.log(`Cloning GoatCitadel from ${repoUrl}...`);
    run(gitCmd, ["clone", repoUrl, appDir]);
  }

  run(corepackCmd, ["enable"]);
  run(corepackCmd, ["prepare", `pnpm@${pnpmVersion}`, "--activate"]);
  runPnpm(["--dir", appDir, "install", "--frozen-lockfile"]);

  console.log("");
  console.log("GoatCitadel install complete.");
  console.log(`Install directory: ${appDir}`);
  console.log("Run:");
  console.log("  goatcitadel onboard");
  console.log("  goatcitadel up");
}

function parseInstallArgs(argv) {
  let installDir;
  let repoUrlOverride;
  const passthrough = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--install-dir") {
      installDir = argv[index + 1];
      if (!installDir) {
        throw new Error("Missing value for --install-dir");
      }
      index += 1;
      continue;
    }
    if (value === "--repo") {
      repoUrlOverride = argv[index + 1];
      if (!repoUrlOverride) {
        throw new Error("Missing value for --repo");
      }
      index += 1;
      continue;
    }
    passthrough.push(value);
  }
  return {
    installDir,
    repoUrl: repoUrlOverride,
    passthrough,
  };
}

function resolveBaseDir(installDirOverride) {
  if (installDirOverride?.trim()) {
    return path.resolve(installDirOverride.trim());
  }
  if (process.env.GOATCITADEL_HOME?.trim()) {
    return path.resolve(process.env.GOATCITADEL_HOME.trim());
  }
  return fs.existsSync(path.join(preferredBaseDir, "app"))
    ? preferredBaseDir
    : fs.existsSync(path.join(legacyBaseDir, "app"))
      ? legacyBaseDir
      : preferredBaseDir;
}

function doctor(extraArgs = []) {
  console.log("Running GoatCitadel doctor...");
  runPnpm(["--dir", appDir, "--filter", "@goatcitadel/gateway", "run", "doctor", ...extraArgs]);
}

function maybeShowVersion(cmd, cmdArgs) {
  const result = spawnCommandSync(cmd, cmdArgs, { encoding: "utf8" });
  if (result.error) {
    console.log(`  ${cmd}: not found`);
    return;
  }
  const out = (result.stdout || result.stderr || "").trim();
  console.log(`  ${cmd}: ${out || "ok"}`);
}

function requireCommand(cmd) {
  const resolved = resolveCommandExecutable(cmd);
  if (!resolved) {
    throw new Error(`Missing required command: ${cmd}`);
  }
  return resolved;
}

function commandAvailable(cmd) {
  return resolveCommandExecutable(cmd) !== null;
}

function resolveCommandExecutable(cmd) {
  const candidates = process.platform === "win32"
    ? [cmd, `${cmd}.cmd`, `${cmd}.exe`]
    : [cmd];
  for (const candidate of candidates) {
    const result = spawnCommandSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  return null;
}

function resolvePnpmRunner() {
  const localPnpm = path.join(baseDir, "bin", process.platform === "win32" ? "pnpm.cmd" : "pnpm");
  if (fs.existsSync(localPnpm)) {
    return {
      cmd: localPnpm,
      prefix: [],
    };
  }

  const candidates = process.platform === "win32"
    ? ["pnpm.cmd", "pnpm", "pnpm.exe"]
    : ["pnpm"];

  for (const candidate of candidates) {
    const result = spawnCommandSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) {
      return {
        cmd: candidate,
        prefix: [],
      };
    }
  }

  const corepackCmd = resolveCommandExecutable("corepack");
  if (corepackCmd) {
    return {
      cmd: corepackCmd,
      prefix: ["pnpm"],
    };
  }

  throw new Error("pnpm is not available. Run `corepack enable` or reinstall GoatCitadel prerequisites.");
}

function runPnpm(args) {
  const runner = resolvePnpmRunner();
  run(runner.cmd, [...runner.prefix, ...args]);
}

function run(cmd, cmdArgs) {
  const result = spawnCommandSync(cmd, cmdArgs, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${cmd} exited with code ${result.status}`);
  }
}

function spawnCommandSync(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, {
    shell: isWindowsBatchCommand(cmd),
    ...options,
  });
}

function isWindowsBatchCommand(cmd) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
}

function printHelp() {
  console.log(`GoatCitadel CLI

Usage:
  goatcitadel <command>
  goat <command> (short shell shortcut; works in PowerShell)

Commands:
  install    Install GoatCitadel from GitHub [--install-dir <path>] [--repo <url>]
  update     Update existing install from GitHub [--install-dir <path>] [--repo <url>]
  up         Start gateway + mission control
  gateway    Start gateway only
  ui         Start mission control UI only
  onboard    Run TUI onboarding wizard
  tui        Run terminal Mission Control
  tools      Tool access CLI (catalog/grants/invoke)
  admin      Backup/retention admin CLI
  smoke      Run smoke tests
  npu        Run local NPU sidecar (Python)
  doctor     Run diagnostics + safe repair (flags: --audit-only --no-repair --deep --yes --json --profile)
  help       Show this help

Install defaults:
  repo       ${defaultRepoUrl}
  base dir   ${baseDir}
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
