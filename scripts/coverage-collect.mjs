import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const artifactsDir = path.join(repoRoot, "artifacts", "coverage");
const summaryJsonPath = path.join(artifactsDir, "coverage-summary.json");
const summaryMdPath = path.join(artifactsDir, "coverage-summary.md");

await removeCoverageDirectories(path.join(repoRoot, "apps"));
await removeCoverageDirectories(path.join(repoRoot, "packages"));

execSync(
  "pnpm -r --if-present test:coverage",
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

const coverageFiles = await findCoverageFinalFiles(repoRoot);
const coverageMap = await loadCoverageMap(coverageFiles);
const sourceFiles = await collectSourceFiles(repoRoot);

const coveredFiles = sourceFiles.filter((filePath) => isSourceFileCovered(filePath, coverageMap));
const uncoveredFiles = sourceFiles.filter((filePath) => !isSourceFileCovered(filePath, coverageMap));
const fileCoveragePercent = sourceFiles.length === 0
  ? 0
  : Number(((coveredFiles.length / sourceFiles.length) * 100).toFixed(2));

const summary = {
  generatedAt: new Date().toISOString(),
  sourceFiles: sourceFiles.length,
  coveredFiles: coveredFiles.length,
  uncoveredFiles: uncoveredFiles.length,
  fileCoveragePercent,
  thresholdPercent: 50,
  coverageFinalFiles: coverageFiles.map((filePath) => path.relative(repoRoot, filePath).replaceAll("\\", "/")),
  uncoveredSample: uncoveredFiles
    .slice(0, 200)
    .map((filePath) => path.relative(repoRoot, filePath).replaceAll("\\", "/")),
};

await fs.mkdir(artifactsDir, { recursive: true });
await fs.writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await fs.writeFile(summaryMdPath, buildMarkdownSummary(summary), "utf8");

console.log(`[coverage] summary written to ${path.relative(repoRoot, summaryJsonPath)}`);
console.log(`[coverage] file coverage: ${summary.fileCoveragePercent}% (${summary.coveredFiles}/${summary.sourceFiles})`);

async function removeCoverageDirectories(root) {
  const entries = await safeReadDir(root);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const coverageDir = path.join(root, entry.name, "coverage");
    await fs.rm(coverageDir, { recursive: true, force: true });
  }
}

async function findCoverageFinalFiles(root) {
  const candidates = [];
  for (const base of ["apps", "packages"]) {
    const dir = path.join(root, base);
    const entries = await safeReadDir(dir);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const coverageFile = path.join(dir, entry.name, "coverage", "coverage-final.json");
      try {
        await fs.access(coverageFile);
        candidates.push(coverageFile);
      } catch {
        // package may not produce coverage output (no tests)
      }
    }
  }
  return candidates;
}

async function loadCoverageMap(files) {
  const map = new Map();
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    for (const [coveredPath, data] of Object.entries(parsed)) {
      const normalized = normalizePathForLookup(String(coveredPath));
      const statements = data && typeof data === "object" && "s" in data
        ? Object.values(data.s ?? {})
        : [];
      const hit = statements.some((count) => Number(count) > 0);
      if (hit) {
        map.set(normalized, true);
      } else if (!map.has(normalized)) {
        map.set(normalized, false);
      }
    }
  }
  return map;
}

async function collectSourceFiles(root) {
  const out = [];
  for (const base of ["apps", "packages"]) {
    const baseDir = path.join(root, base);
    await walk(baseDir, out);
  }
  return out;
}

async function walk(current, out) {
  const entries = await safeReadDir(current);
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "coverage") {
        continue;
      }
      await walk(fullPath, out);
      continue;
    }
    if (!fullPath.includes(`${path.sep}src${path.sep}`)) {
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    if (
      entry.name.endsWith(".d.ts")
      || entry.name.endsWith(".test.ts")
      || entry.name.endsWith(".test.tsx")
      || entry.name.endsWith(".spec.ts")
      || entry.name.endsWith(".spec.tsx")
    ) {
      continue;
    }
    out.push(path.resolve(fullPath));
  }
}

function isSourceFileCovered(filePath, coverageMap) {
  const normalized = normalizePathForLookup(filePath);
  return coverageMap.get(normalized) === true;
}

function normalizePathForLookup(inputPath) {
  const withoutFileScheme = inputPath.replace(/^file:\/\//i, "");
  return path.resolve(withoutFileScheme).replaceAll("\\", "/").toLowerCase();
}

async function safeReadDir(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function buildMarkdownSummary(summary) {
  const coverageFiles = summary.coverageFinalFiles.length > 0
    ? summary.coverageFinalFiles.map((item) => `- \`${item}\``).join("\n")
    : "- none";
  const uncovered = summary.uncoveredSample.length > 0
    ? summary.uncoveredSample.map((item) => `- \`${item}\``).join("\n")
    : "- none";
  return [
    "# Coverage Summary",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- File coverage: ${summary.fileCoveragePercent}%`,
    `- Covered files: ${summary.coveredFiles}/${summary.sourceFiles}`,
    `- Uncovered files: ${summary.uncoveredFiles}`,
    `- Gate threshold: ${summary.thresholdPercent}%`,
    "",
    "## Coverage Reports",
    coverageFiles,
    "",
    "## Uncovered Sample (first 200)",
    uncovered,
    "",
  ].join("\n");
}
