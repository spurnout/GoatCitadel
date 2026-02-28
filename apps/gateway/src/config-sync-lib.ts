import fs from "node:fs/promises";
import path from "node:path";

const UNIFIED_FILENAME = "goatcitadel.json";

interface SectionTarget {
  aliases: string[];
  filename: string;
}

const SECTION_TARGETS: SectionTarget[] = [
  { aliases: ["assistant"], filename: "assistant.config.json" },
  { aliases: ["toolPolicy", "tool-policy"], filename: "tool-policy.json" },
  { aliases: ["budgets"], filename: "budgets.json" },
  { aliases: ["llm", "llmProviders", "llm-providers"], filename: "llm-providers.json" },
  { aliases: ["cronJobs", "cron", "cron-jobs"], filename: "cron-jobs.json" },
];

export interface UnifiedConfigSyncResult {
  unifiedPath: string;
  createdUnified: boolean;
  syncedSections: string[];
}

export interface UnifiedConfigSyncOptions {
  createUnifiedIfMissing?: boolean;
}

export async function syncUnifiedConfig(
  rootDir: string,
  options: UnifiedConfigSyncOptions = {},
): Promise<UnifiedConfigSyncResult> {
  const configDir = path.join(rootDir, "config");
  const unifiedPath = path.join(configDir, UNIFIED_FILENAME);
  const createUnifiedIfMissing = options.createUnifiedIfMissing ?? false;
  let createdUnified = false;
  let unifiedRaw: string;

  try {
    unifiedRaw = await fs.readFile(unifiedPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    if (!createUnifiedIfMissing) {
      return {
        unifiedPath,
        createdUnified: false,
        syncedSections: [],
      };
    }

    const initialUnified = await buildUnifiedFromSplitFiles(configDir);
    await writeJsonIfChanged(unifiedPath, initialUnified);
    createdUnified = true;
    unifiedRaw = JSON.stringify(initialUnified);
  }

  const parsed = parseJson(unifiedRaw, unifiedPath);
  if (!isRecord(parsed)) {
    throw new Error(`Unified config must be a JSON object: ${unifiedPath}`);
  }

  const syncedSections: string[] = [];
  for (const target of SECTION_TARGETS) {
    const sectionValue = readSection(parsed, target.aliases);
    if (sectionValue === undefined) {
      continue;
    }

    const normalized = normalizeSection(sectionValue, target.filename);
    const outPath = path.join(configDir, target.filename);
    const changed = await writeJsonIfChanged(outPath, normalized);
    if (changed) {
      syncedSections.push(target.filename);
    }
  }

  return {
    unifiedPath,
    createdUnified,
    syncedSections,
  };
}

async function buildUnifiedFromSplitFiles(configDir: string): Promise<Record<string, unknown>> {
  const assistant = await readJson(path.join(configDir, "assistant.config.json"));
  const toolPolicy = await readJson(path.join(configDir, "tool-policy.json"));
  const budgets = await readJson(path.join(configDir, "budgets.json"));
  const llm = await readJson(path.join(configDir, "llm-providers.json"));
  const cronJobs = await readJson(path.join(configDir, "cron-jobs.json"));

  return {
    version: 1,
    assistant,
    toolPolicy,
    budgets,
    llm,
    cronJobs,
  };
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseJson(raw, filePath);
}

function parseJson(raw: string, filePath: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const reason = (error as Error).message;
    throw new Error(`Invalid JSON in ${filePath}: ${reason}`);
  }
}

function normalizeSection(value: unknown, filename: string): unknown {
  if (filename === "cron-jobs.json") {
    if (Array.isArray(value)) {
      return { jobs: value };
    }
    if (!isRecord(value)) {
      throw new Error(
        `Invalid section for ${filename} in config/goatcitadel.json (expected object or array)`,
      );
    }
    return value;
  }

  if (!isRecord(value)) {
    throw new Error(
      `Invalid section for ${filename} in config/goatcitadel.json (expected object)`,
    );
  }
  return value;
}

function readSection(payload: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = payload[alias];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

async function writeJsonIfChanged(filePath: string, data: unknown): Promise<boolean> {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let current = "";
  try {
    current = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (current === next) {
    return false;
  }

  await fs.writeFile(filePath, next, "utf8");
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
