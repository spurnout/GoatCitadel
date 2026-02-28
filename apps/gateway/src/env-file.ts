import fs from "node:fs";
import path from "node:path";

export interface EnvFileLoadResult {
  path?: string;
  applied: string[];
  skipped: string[];
}

let loaded = false;

export function loadLocalEnvFile(options?: { forceReload?: boolean }): EnvFileLoadResult {
  if (loaded && !options?.forceReload) {
    return { applied: [], skipped: [] };
  }
  loaded = true;

  const envPath = detectEnvFilePath();
  if (!envPath) {
    return { applied: [], skipped: [] };
  }

  let raw = "";
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch {
    return { applied: [], skipped: [] };
  }

  const parsed = parseEnv(raw);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined) {
      skipped.push(key);
      continue;
    }
    process.env[key] = value;
    applied.push(key);
  }

  return { path: envPath, applied, skipped };
}

function detectEnvFilePath(): string | undefined {
  const envRoot = process.env.GOATCITADEL_ROOT_DIR?.trim();
  const cwd = process.cwd();

  const rootCandidates = [
    envRoot ? path.resolve(envRoot) : undefined,
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
  ].filter(Boolean) as string[];

  const deduped = Array.from(new Set(rootCandidates));
  for (const root of deduped) {
    const configPath = path.join(root, "config", "assistant.config.json");
    const envPath = path.join(root, ".env");
    if (fs.existsSync(configPath) && fs.existsSync(envPath)) {
      return envPath;
    }
  }

  for (const root of deduped) {
    const envPath = path.join(root, ".env");
    if (fs.existsSync(envPath)) {
      return envPath;
    }
  }

  return undefined;
}

function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const candidate = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trimStart()
      : trimmed;

    const splitIndex = candidate.indexOf("=");
    if (splitIndex <= 0) {
      continue;
    }

    const key = candidate.slice(0, splitIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      continue;
    }

    let value = candidate.slice(splitIndex + 1).trim();
    if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\");
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      const inlineCommentIndex = value.indexOf(" #");
      if (inlineCommentIndex >= 0) {
        value = value.slice(0, inlineCommentIndex).trimEnd();
      }
    }

    out[key] = value;
  }

  return out;
}

