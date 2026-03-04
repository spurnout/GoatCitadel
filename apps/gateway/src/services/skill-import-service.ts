import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { parseSkillMarkdown } from "@goatcitadel/skills";
import type {
  SkillImportCandidate,
  SkillImportHistoryRecord,
  SkillImportSourceType,
  SkillImportValidationResult,
  SkillMergedSourceResult,
  SkillSourceListResponse,
  SkillSourceProvider,
  SkillSourceResultRecord,
  SkillSourceSearchRecord,
} from "@goatcitadel/contracts";
import type { SystemSettingsRepository } from "@goatcitadel/storage";

const IMPORT_HISTORY_KEY = "skill_import_history_v1";
const MAX_IMPORT_HISTORY = 300;
const execFileAsync = promisify(execFile);

interface MaterializedSkillSource {
  sourceDir: string;
  skillDir: string;
  skillFilePath: string;
  candidate: SkillImportCandidate;
  cleanup?: () => Promise<void>;
}

interface SkillImportInput {
  sourceRef: string;
  sourceType?: SkillImportSourceType;
  sourceProvider?: SkillSourceProvider;
}

interface SkillInstallInput extends SkillImportInput {
  force?: boolean;
  confirmHighRisk?: boolean;
}

const FALLBACK_SOURCE_ITEMS: SkillSourceResultRecord[] = [
  {
    sourceProvider: "agentskill",
    sourceUrl: "https://agentskill.sh/readme",
    name: "AgentSkill Catalog",
    description: "Marketplace index and docs for SKILL.md style assets.",
    tags: ["catalog", "docs", "skills"],
  },
  {
    sourceProvider: "agentskill",
    sourceUrl: "https://agentskill.sh/install",
    name: "AgentSkill Install Guide",
    description: "Installation and bootstrap guidance for marketplace skills.",
    tags: ["install", "guide"],
  },
  {
    sourceProvider: "skillsmp",
    sourceUrl: "https://skillsmp.com/docs",
    name: "SkillsMP Docs",
    description: "Reference docs for SkillsMP marketplace integration.",
    tags: ["docs", "skills"],
  },
  {
    sourceProvider: "skillsmp",
    sourceUrl: "https://skillsmp.com/",
    name: "SkillsMP Catalog",
    description: "Marketplace listings for reusable agent skills.",
    tags: ["catalog", "marketplace"],
  },
];

export class SkillImportService {
  public constructor(
    private readonly rootDir: string,
    private readonly systemSettings: SystemSettingsRepository,
  ) {}

  public async listSources(query?: string, limit = 25): Promise<SkillSourceListResponse> {
    const normalizedQuery = query?.trim().toLowerCase() || undefined;
    const providerResults = await Promise.all([
      this.searchProvider("agentskill", normalizedQuery, limit),
      this.searchProvider("skillsmp", normalizedQuery, limit),
    ]);

    const providerStatus: SkillSourceSearchRecord[] = providerResults.map((item) => item.providerStatus);
    providerStatus.push(
      {
        provider: "local",
        providerLabel: "Local",
        available: true,
        status: "ok",
      },
      {
        provider: "github",
        providerLabel: "GitHub",
        available: true,
        status: "ok",
      },
    );

    const combined = [
      ...providerResults.flatMap((item) => item.items),
      ...FALLBACK_SOURCE_ITEMS.filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        const haystack = `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    ];

    const merged = mergeSourceItems(combined).slice(0, Math.max(1, Math.min(limit, 100)));

    return {
      query: normalizedQuery,
      generatedAt: new Date().toISOString(),
      providers: providerStatus,
      items: merged,
    };
  }

  public async validateImport(input: SkillImportInput): Promise<SkillImportValidationResult> {
    const importId = randomUUID();
    let materialized: MaterializedSkillSource | undefined;
    try {
      materialized = await this.materializeSkillSource(input);
      const validation = await this.validateMaterialized(materialized);
      this.appendHistory({
        importId,
        action: "validate",
        outcome: validation.valid ? "accepted" : "rejected",
        sourceProvider: validation.candidate.sourceProvider,
        sourceRef: validation.candidate.sourceRef,
        sourceType: validation.candidate.sourceType,
        canonicalKey: validation.candidate.canonicalKey,
        skillName: validation.inferredSkillName,
        skillId: validation.inferredSkillId,
        riskLevel: validation.riskLevel,
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
        },
        createdAt: new Date().toISOString(),
      });
      return validation;
    } catch (error) {
      const sourceType = inferSourceType(input.sourceRef, input.sourceType);
      const sourceProvider = inferSourceProvider(input.sourceRef, input.sourceProvider);
      this.appendHistory({
        importId,
        action: "validate",
        outcome: "failed",
        sourceProvider,
        sourceRef: input.sourceRef,
        sourceType,
        canonicalKey: buildCanonicalKey({
          sourceProvider,
          sourceType,
          sourceRef: input.sourceRef,
        }),
        details: {
          error: (error as Error).message,
        },
        createdAt: new Date().toISOString(),
      });
      throw error;
    } finally {
      await materialized?.cleanup?.().catch(() => undefined);
    }
  }

  public async installImport(input: SkillInstallInput): Promise<{
    validation: SkillImportValidationResult;
    installedPath: string;
    sourceManifestPath: string;
  }> {
    const importId = randomUUID();
    let materialized: MaterializedSkillSource | undefined;
    try {
      materialized = await this.materializeSkillSource(input);
      const validation = await this.validateMaterialized(materialized);
      if (!validation.valid) {
        this.appendHistory({
          importId,
          action: "install",
          outcome: "rejected",
          sourceProvider: validation.candidate.sourceProvider,
          sourceRef: validation.candidate.sourceRef,
          sourceType: validation.candidate.sourceType,
          canonicalKey: validation.candidate.canonicalKey,
          skillName: validation.inferredSkillName,
          skillId: validation.inferredSkillId,
          riskLevel: validation.riskLevel,
          details: {
            errors: validation.errors,
          },
          createdAt: new Date().toISOString(),
        });
        throw new Error(`Skill import validation failed: ${validation.errors.join("; ")}`);
      }
      if (validation.riskLevel === "high" && !input.confirmHighRisk) {
        this.appendHistory({
          importId,
          action: "install",
          outcome: "rejected",
          sourceProvider: validation.candidate.sourceProvider,
          sourceRef: validation.candidate.sourceRef,
          sourceType: validation.candidate.sourceType,
          canonicalKey: validation.candidate.canonicalKey,
          skillName: validation.inferredSkillName,
          skillId: validation.inferredSkillId,
          riskLevel: validation.riskLevel,
          details: {
            error: "high_risk_confirmation_required",
          },
          createdAt: new Date().toISOString(),
        });
        throw new Error("High-risk skill import requires explicit confirmation.");
      }

      const inferredId = validation.inferredSkillId || `import-${Date.now()}`;
      const installedPath = path.resolve(this.rootDir, "skills", "extra", inferredId);
      const targetExists = fsSync.existsSync(installedPath);
      if (targetExists && !input.force) {
        throw new Error(`Skill install target already exists: ${installedPath}`);
      }
      if (targetExists && input.force) {
        await fs.rm(installedPath, { recursive: true, force: true });
      }
      await fs.mkdir(path.dirname(installedPath), { recursive: true });
      await fs.cp(materialized.skillDir, installedPath, { recursive: true, force: Boolean(input.force) });

      const sourceManifestPath = path.join(installedPath, "source.json");
      await fs.writeFile(
        sourceManifestPath,
        JSON.stringify(
          {
            installedAt: new Date().toISOString(),
            candidate: validation.candidate,
            riskLevel: validation.riskLevel,
            warnings: validation.warnings,
            checks: validation.checks,
          },
          null,
          2,
        ),
        "utf8",
      );

      this.appendHistory({
        importId,
        action: "install",
        outcome: "accepted",
        sourceProvider: validation.candidate.sourceProvider,
        sourceRef: validation.candidate.sourceRef,
        sourceType: validation.candidate.sourceType,
        canonicalKey: validation.candidate.canonicalKey,
        skillName: validation.inferredSkillName,
        skillId: validation.inferredSkillId,
        riskLevel: validation.riskLevel,
        details: {
          installedPath: path.relative(this.rootDir, installedPath).replaceAll("\\", "/"),
        },
        createdAt: new Date().toISOString(),
      });

      return {
        validation,
        installedPath,
        sourceManifestPath,
      };
    } catch (error) {
      const sourceType = inferSourceType(input.sourceRef, input.sourceType);
      const sourceProvider = inferSourceProvider(input.sourceRef, input.sourceProvider);
      this.appendHistory({
        importId,
        action: "install",
        outcome: "failed",
        sourceProvider,
        sourceRef: input.sourceRef,
        sourceType,
        canonicalKey: buildCanonicalKey({
          sourceProvider,
          sourceType,
          sourceRef: input.sourceRef,
        }),
        details: {
          error: (error as Error).message,
        },
        createdAt: new Date().toISOString(),
      });
      throw error;
    } finally {
      await materialized?.cleanup?.().catch(() => undefined);
    }
  }

  public listHistory(limit = 100): SkillImportHistoryRecord[] {
    const rows = this.systemSettings.get<SkillImportHistoryRecord[]>(IMPORT_HISTORY_KEY)?.value ?? [];
    return rows.slice(0, Math.max(1, Math.min(limit, 300)));
  }

  private appendHistory(record: SkillImportHistoryRecord): void {
    const rows = this.systemSettings.get<SkillImportHistoryRecord[]>(IMPORT_HISTORY_KEY)?.value ?? [];
    this.systemSettings.set(IMPORT_HISTORY_KEY, [record, ...rows].slice(0, MAX_IMPORT_HISTORY));
  }

  private async searchProvider(
    provider: "agentskill" | "skillsmp",
    query: string | undefined,
    limit: number,
  ): Promise<{ providerStatus: SkillSourceSearchRecord; items: SkillSourceResultRecord[] }> {
    const started = Date.now();
    const providerLabel = provider === "agentskill" ? "AgentSkill" : "SkillsMP";
    const targetUrl = provider === "agentskill" ? "https://agentskill.sh/" : "https://skillsmp.com/";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "user-agent": "GoatCitadel/0.1",
        },
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const items = extractMarketplaceLinks(provider, html)
        .map((url) => ({
          sourceProvider: provider,
          sourceUrl: url,
          name: humanizeSkillName(url),
          description: `${providerLabel} listing candidate`,
          tags: provider === "agentskill" ? ["agentskill"] : ["skillsmp"],
        }))
        .filter((item) => {
          if (!query) {
            return true;
          }
          const haystack = `${item.name} ${item.description}`.toLowerCase();
          return haystack.includes(query);
        })
        .slice(0, Math.max(1, Math.min(limit, 100)));

      return {
        providerStatus: {
          provider,
          providerLabel,
          available: true,
          status: "ok",
          latencyMs: Date.now() - started,
        },
        items,
      };
    } catch (error) {
      const fallbackItems = FALLBACK_SOURCE_ITEMS.filter((item) => item.sourceProvider === provider)
        .filter((item) => {
          if (!query) {
            return true;
          }
          const haystack = `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
          return haystack.includes(query);
        })
        .slice(0, Math.max(1, Math.min(limit, 100)));
      return {
        providerStatus: {
          provider,
          providerLabel,
          available: fallbackItems.length > 0,
          status: fallbackItems.length > 0 ? "degraded" : "unavailable",
          error: (error as Error).message,
          latencyMs: Date.now() - started,
        },
        items: fallbackItems,
      };
    }
  }

  private async materializeSkillSource(input: SkillImportInput): Promise<MaterializedSkillSource> {
    const sourceType = inferSourceType(input.sourceRef, input.sourceType);
    const sourceProvider = inferSourceProvider(input.sourceRef, input.sourceProvider);
    const sourceRef = input.sourceRef.trim();
    if (!sourceRef) {
      throw new Error("sourceRef is required");
    }

    if (sourceType === "local_path") {
      const sourceDir = path.resolve(sourceRef);
      const stat = await fs.stat(sourceDir).catch(() => undefined);
      if (!stat || !stat.isDirectory()) {
        throw new Error(`Local source path is not a directory: ${sourceDir}`);
      }
      const skillDir = await resolveSkillDir(sourceDir);
      return {
        sourceDir,
        skillDir,
        skillFilePath: path.join(skillDir, "SKILL.md"),
        candidate: {
          sourceProvider,
          sourceType,
          sourceRef,
          canonicalKey: buildCanonicalKey({
            sourceProvider,
            sourceType,
            sourceRef,
          }),
          skillRootPath: skillDir,
        },
      };
    }

    if (sourceType === "local_zip") {
      const zipPath = path.resolve(sourceRef);
      const stat = await fs.stat(zipPath).catch(() => undefined);
      if (!stat || !stat.isFile()) {
        throw new Error(`Local zip path is not a file: ${zipPath}`);
      }
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "goatcitadel-skill-zip-"));
      const extracted = path.join(tempRoot, "extracted");
      await fs.mkdir(extracted, { recursive: true });
      await extractZip(zipPath, extracted);
      const skillDir = await resolveSkillDir(extracted);
      return {
        sourceDir: extracted,
        skillDir,
        skillFilePath: path.join(skillDir, "SKILL.md"),
        candidate: {
          sourceProvider,
          sourceType,
          sourceRef,
          canonicalKey: buildCanonicalKey({
            sourceProvider,
            sourceType,
            sourceRef,
          }),
          skillRootPath: skillDir,
        },
        cleanup: async () => {
          await fs.rm(tempRoot, { recursive: true, force: true });
        },
      };
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "goatcitadel-skill-git-"));
    const cloneDir = path.join(tempRoot, "repo");
    try {
      await execFileAsync("git", ["clone", "--depth", "1", sourceRef, cloneDir], {
        windowsHide: true,
      });
    } catch (error) {
      throw new Error(`Failed to clone git source: ${(error as Error).message}`);
    }
    const skillDir = await resolveSkillDir(cloneDir);
    return {
      sourceDir: cloneDir,
      skillDir,
      skillFilePath: path.join(skillDir, "SKILL.md"),
      candidate: {
        sourceProvider,
        sourceType,
        sourceRef,
        repositoryUrl: sourceRef,
        canonicalKey: buildCanonicalKey({
          sourceProvider,
          sourceType,
          sourceRef,
        }),
        skillRootPath: skillDir,
      },
      cleanup: async () => {
        await fs.rm(tempRoot, { recursive: true, force: true });
      },
    };
  }

  private async validateMaterialized(source: MaterializedSkillSource): Promise<SkillImportValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let inferredSkillName: string | undefined;
    let inferredSkillId: string | undefined;
    let declaredTools: string[] = [];
    let requires: string[] = [];
    let instructionPreview = "";
    let frontmatterValid = false;
    let descriptionQuality = false;

    let rawSkill = "";
    try {
      rawSkill = await fs.readFile(source.skillFilePath, "utf8");
      const parsed = parseSkillMarkdown(rawSkill);
      frontmatterValid = true;
      inferredSkillName = parsed.frontmatter.name.trim();
      inferredSkillId = normalizeSkillId(parsed.frontmatter.name);
      declaredTools = parsed.frontmatter.metadata?.tools ?? [];
      requires = parsed.frontmatter.metadata?.requires ?? [];
      descriptionQuality = parsed.frontmatter.description.trim().length >= 24
        && parsed.frontmatter.description.trim().split(/\s+/).length >= 4;
      if (!descriptionQuality) {
        warnings.push("Description is very short; quality score reduced.");
      }
      instructionPreview = parsed.body.slice(0, 500);
    } catch (error) {
      errors.push(`Invalid SKILL.md: ${(error as Error).message}`);
    }

    const scan = await scanSkillDirectory(source.skillDir);
    const suspiciousScripts = scan.suspiciousSignals.length > 0;
    const networkIndicators = scan.networkSignals.length > 0;
    const licenseDetected = scan.licenseFiles.length > 0;

    if (suspiciousScripts) {
      warnings.push("Potentially risky script indicators detected.");
    }
    if (networkIndicators) {
      warnings.push("Network usage indicators detected in skill files.");
    }
    if (!licenseDetected) {
      warnings.push("No license file detected.");
    }

    const valid = errors.length === 0;
    const riskLevel = deriveRiskLevel({
      suspiciousScripts,
      networkIndicators,
      descriptionQuality,
      valid,
    });

    return {
      valid,
      riskLevel,
      errors,
      warnings,
      checks: {
        frontmatterValid,
        descriptionQuality,
        suspiciousScripts,
        networkIndicators,
        licenseDetected,
      },
      candidate: source.candidate,
      inferredSkillName,
      inferredSkillId,
      installPath: inferredSkillId ? `skills/extra/${inferredSkillId}` : undefined,
      declaredTools,
      requires,
      networkSignals: scan.networkSignals,
      suspiciousSignals: scan.suspiciousSignals,
      licenseFiles: scan.licenseFiles,
      instructionPreview,
    };
  }
}

function inferSourceType(sourceRef: string, explicit?: SkillImportSourceType): SkillImportSourceType {
  if (explicit) {
    return explicit;
  }
  const trimmed = sourceRef.trim();
  if (/^https?:\/\//i.test(trimmed) || /^git@/i.test(trimmed)) {
    return "git_url";
  }
  if (trimmed.toLowerCase().endsWith(".zip")) {
    return "local_zip";
  }
  return "local_path";
}

function inferSourceProvider(sourceRef: string, explicit?: SkillSourceProvider): SkillSourceProvider {
  if (explicit) {
    return explicit;
  }
  const lowered = sourceRef.toLowerCase();
  if (lowered.includes("agentskill.sh")) {
    return "agentskill";
  }
  if (lowered.includes("skillsmp.com")) {
    return "skillsmp";
  }
  if (lowered.includes("github.com") || lowered.startsWith("git@")) {
    return "github";
  }
  return "local";
}

function buildCanonicalKey(input: {
  sourceProvider: SkillSourceProvider;
  sourceType: SkillImportSourceType;
  sourceRef: string;
  sourceUrl?: string;
  repositoryUrl?: string;
}): string {
  const repo = input.repositoryUrl ?? input.sourceUrl ?? input.sourceRef;
  const normalizedRepo = normalizeRepoReference(repo);
  if (normalizedRepo) {
    return normalizedRepo;
  }
  const hash = createHash("sha1").update(input.sourceRef).digest("hex").slice(0, 12);
  return `${input.sourceProvider}:${input.sourceType}:${hash}`;
}

function normalizeRepoReference(value: string): string | undefined {
  try {
    const url = new URL(value);
    const cleaned = url.pathname.replace(/\.git$/i, "").replace(/^\/+/, "");
    if (!cleaned) {
      return undefined;
    }
    return `${url.hostname.toLowerCase()}/${cleaned.toLowerCase()}`;
  } catch {
    return undefined;
  }
}

function mergeSourceItems(items: SkillSourceResultRecord[]): SkillMergedSourceResult[] {
  const merged = new Map<string, SkillMergedSourceResult>();
  for (const item of items) {
    const canonicalKey = buildCanonicalKey({
      sourceProvider: item.sourceProvider,
      sourceType: "git_url",
      sourceRef: item.repositoryUrl ?? item.sourceUrl,
      sourceUrl: item.sourceUrl,
      repositoryUrl: item.repositoryUrl,
    });
    const qualityScore = scoreQuality(item);
    const freshnessScore = scoreFreshness(item.updatedAt);
    const trustScore = scoreTrust(item.sourceProvider, item.repositoryUrl);
    const combinedScore = Number((qualityScore * 0.4 + freshnessScore * 0.25 + trustScore * 0.35).toFixed(3));

    const existing = merged.get(canonicalKey);
    if (!existing) {
      merged.set(canonicalKey, {
        ...item,
        canonicalKey,
        alternateProviders: [],
        qualityScore,
        freshnessScore,
        trustScore,
        combinedScore,
      });
      continue;
    }

    const nextProviders = new Set<SkillSourceProvider>([
      existing.sourceProvider,
      ...existing.alternateProviders,
      item.sourceProvider,
    ]);
    const nextPrimary = existing.combinedScore >= combinedScore ? existing : {
      ...existing,
      ...item,
      qualityScore,
      freshnessScore,
      trustScore,
      combinedScore,
    };
    nextPrimary.alternateProviders = [...nextProviders].filter((provider) => provider !== nextPrimary.sourceProvider);
    merged.set(canonicalKey, nextPrimary);
  }

  return [...merged.values()].sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) {
      return b.combinedScore - a.combinedScore;
    }
    return a.name.localeCompare(b.name);
  });
}

function scoreQuality(item: SkillSourceResultRecord): number {
  let score = 0.4;
  if (item.description.trim().length >= 40) {
    score += 0.2;
  }
  if (item.tags.length >= 2) {
    score += 0.15;
  }
  if (item.repositoryUrl) {
    score += 0.2;
  }
  if (item.name.trim().length >= 6) {
    score += 0.05;
  }
  return Number(Math.min(1, score).toFixed(3));
}

function scoreFreshness(updatedAt: string | undefined): number {
  if (!updatedAt) {
    return 0.45;
  }
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedMs)) {
    return 0.45;
  }
  const ageDays = Math.max(0, (Date.now() - updatedMs) / 86_400_000);
  if (ageDays <= 30) {
    return 1;
  }
  if (ageDays <= 90) {
    return 0.8;
  }
  if (ageDays <= 180) {
    return 0.6;
  }
  return 0.4;
}

function scoreTrust(provider: SkillSourceProvider, repositoryUrl?: string): number {
  let score = provider === "local" ? 0.95 : provider === "github" ? 0.75 : 0.65;
  if (repositoryUrl && /github\.com/i.test(repositoryUrl)) {
    score += 0.1;
  }
  return Number(Math.min(1, score).toFixed(3));
}

function humanizeSkillName(url: string): string {
  try {
    const parsed = new URL(url);
    const pieces = parsed.pathname.split("/").filter(Boolean);
    const slug = pieces[pieces.length - 1] || "skill";
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Skill";
  }
}

function extractMarketplaceLinks(provider: "agentskill" | "skillsmp", html: string): string[] {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null = hrefRegex.exec(html);
  while (match) {
    const href = match[1] ?? "";
    const absolute = toAbsoluteMarketplaceUrl(provider, href);
    if (!absolute) {
      match = hrefRegex.exec(html);
      continue;
    }
    if (provider === "agentskill" && !/agentskill\.sh\/(skills?|learn|readme)/i.test(absolute)) {
      match = hrefRegex.exec(html);
      continue;
    }
    if (provider === "skillsmp" && !/skillsmp\.com\/(skills?|docs|marketplace)/i.test(absolute)) {
      match = hrefRegex.exec(html);
      continue;
    }
    found.add(absolute);
    match = hrefRegex.exec(html);
  }
  return [...found];
}

function toAbsoluteMarketplaceUrl(provider: "agentskill" | "skillsmp", href: string): string | undefined {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("mailto:")) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const base = provider === "agentskill" ? "https://agentskill.sh" : "https://skillsmp.com";
  return new URL(trimmed, base).toString();
}

async function resolveSkillDir(rootDir: string): Promise<string> {
  const direct = path.join(rootDir, "SKILL.md");
  if (fsSync.existsSync(direct)) {
    return rootDir;
  }

  const queue = [rootDir];
  let scannedDirs = 0;
  while (queue.length > 0 && scannedDirs < 250) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    scannedDirs += 1;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    const hasSkill = entries.some((entry) => entry.isFile() && entry.name === "SKILL.md");
    if (hasSkill) {
      return current;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.startsWith(".git")) {
        continue;
      }
      queue.push(path.join(current, entry.name));
    }
  }

  throw new Error("Unable to locate SKILL.md in the provided source.");
}

async function extractZip(zipPath: string, targetDir: string): Promise<void> {
  try {
    await execFileAsync("tar", ["-xf", zipPath, "-C", targetDir], { windowsHide: true });
    return;
  } catch {
    // continue to fallback
  }

  if (process.platform === "win32") {
    const command = `Expand-Archive -Path "${zipPath.replaceAll("\"", "\"\"")}" -DestinationPath "${targetDir.replaceAll("\"", "\"\"")}" -Force`;
    await execFileAsync("powershell", ["-NoProfile", "-Command", command], { windowsHide: true });
    return;
  }

  throw new Error("Unable to extract zip file in this runtime. Extract locally and use sourceType=local_path.");
}

async function scanSkillDirectory(dir: string): Promise<{
  suspiciousSignals: string[];
  networkSignals: string[];
  licenseFiles: string[];
}> {
  const suspiciousSignals = new Set<string>();
  const networkSignals = new Set<string>();
  const licenseFiles = new Set<string>();
  const queue = [dir];
  let scannedFiles = 0;

  while (queue.length > 0 && scannedFiles < 220) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".git")) {
          queue.push(fullPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      scannedFiles += 1;
      if (/^(license|copying)(\..*)?$/i.test(entry.name)) {
        licenseFiles.add(path.relative(dir, fullPath).replaceAll("\\", "/"));
      }
      if (scannedFiles > 220) {
        break;
      }
      const text = await tryReadFileText(fullPath);
      if (!text) {
        continue;
      }
      if (/(rm\s+-rf|del\s+\/f|powershell\s+-enc|invoke-webrequest\s+.*\|\s*iex)/i.test(text)) {
        suspiciousSignals.add(path.relative(dir, fullPath).replaceAll("\\", "/"));
      }
      if (/(https?:\/\/|fetch\s*\(|axios\.|curl\s+)/i.test(text)) {
        networkSignals.add(path.relative(dir, fullPath).replaceAll("\\", "/"));
      }
    }
  }

  return {
    suspiciousSignals: [...suspiciousSignals],
    networkSignals: [...networkSignals],
    licenseFiles: [...licenseFiles],
  };
}

async function tryReadFileText(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 220_000) {
      return "";
    }
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch {
    return "";
  }
}

function deriveRiskLevel(input: {
  suspiciousScripts: boolean;
  networkIndicators: boolean;
  descriptionQuality: boolean;
  valid: boolean;
}): "low" | "medium" | "high" {
  if (!input.valid || input.suspiciousScripts) {
    return "high";
  }
  if (input.networkIndicators || !input.descriptionQuality) {
    return "medium";
  }
  return "low";
}

function normalizeSkillId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "imported-skill";
}
