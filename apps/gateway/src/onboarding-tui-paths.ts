import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

interface ResolveGoatCitadelAppDirOptions {
  cwd?: string;
  envAppDir?: string;
  moduleUrl?: string;
}

export function isGoatCitadelAppDir(appDir: string): boolean {
  if (!appDir.trim()) {
    return false;
  }
  const resolved = path.resolve(appDir);
  const requiredPaths = [
    "package.json",
    "pnpm-workspace.yaml",
    path.join("apps", "gateway", "package.json"),
  ];
  return requiredPaths.every((relativePath) => fs.existsSync(path.join(resolved, relativePath)));
}

export function resolveGoatCitadelAppDir(options: ResolveGoatCitadelAppDirOptions = {}): string | undefined {
  const envAppDir = options.envAppDir ?? process.env.GOATCITADEL_APP_DIR;
  if (envAppDir?.trim() && isGoatCitadelAppDir(envAppDir.trim())) {
    return path.resolve(envAppDir.trim());
  }

  const fromCwd = findGoatCitadelAppDir(options.cwd ?? process.cwd());
  if (fromCwd) {
    return fromCwd;
  }

  const moduleDir = path.dirname(fileURLToPath(options.moduleUrl ?? import.meta.url));
  return findGoatCitadelAppDir(moduleDir);
}

function findGoatCitadelAppDir(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    if (isGoatCitadelAppDir(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}
