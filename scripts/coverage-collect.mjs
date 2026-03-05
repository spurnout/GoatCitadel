import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import ts from "typescript";

const repoRoot = process.cwd();
const artifactsDir = path.join(repoRoot, "artifacts", "coverage");
const summaryJsonPath = path.join(artifactsDir, "coverage-summary.json");
const summaryMdPath = path.join(artifactsDir, "coverage-summary.md");
const DEFAULT_LINE_THRESHOLD = 65;
const DEFAULT_BRANCH_THRESHOLD = 45;

const warnings = [];

await removeCoverageDirectories(path.join(repoRoot, "apps"));
await removeCoverageDirectories(path.join(repoRoot, "packages"));

execSync("pnpm -r --if-present test:coverage", {
  cwd: repoRoot,
  stdio: "inherit",
});
execSync("pnpm --filter @goatcitadel/gateway --if-present coverage:smoke", {
  cwd: repoRoot,
  stdio: "inherit",
});
execSync("pnpm --filter @goatcitadel/gateway --if-present coverage:exercise", {
  cwd: repoRoot,
  stdio: "inherit",
});

const coverageFiles = await findCoverageFinalFiles(repoRoot);
const coverageMap = await loadCoverageMap(coverageFiles, warnings);
const sourceFiles = await collectSourceFiles(repoRoot);

let coveredFiles = 0;
let uncoveredFiles = 0;
let lineTotal = 0;
let lineCovered = 0;
let branchTotal = 0;
let branchCovered = 0;
const uncoveredSample = [];

for (const filePath of sourceFiles) {
  const normalized = normalizePathForLookup(filePath);
  const entry = coverageMap.get(normalized);
  const metrics = entry
    ? computeCoverageMetrics(entry)
    : {
      lineTotal: await countRelevantLines(filePath),
      lineCovered: 0,
      branchTotal: 0,
      branchCovered: 0,
    };

  lineTotal += metrics.lineTotal;
  lineCovered += metrics.lineCovered;
  branchTotal += metrics.branchTotal;
  branchCovered += metrics.branchCovered;

  if (metrics.lineCovered > 0 || metrics.branchCovered > 0) {
    coveredFiles += 1;
  } else {
    uncoveredFiles += 1;
    if (uncoveredSample.length < 200) {
      uncoveredSample.push(path.relative(repoRoot, filePath).replaceAll("\\", "/"));
    }
  }
}

const fileCoveragePercent = sourceFiles.length === 0
  ? 0
  : Number(((coveredFiles / sourceFiles.length) * 100).toFixed(2));
const linePercent = lineTotal === 0
  ? 0
  : Number(((lineCovered / lineTotal) * 100).toFixed(2));
const branchPercent = branchTotal === 0
  ? 100
  : Number(((branchCovered / branchTotal) * 100).toFixed(2));

const resolvedThresholds = resolveThresholds(warnings);

const summary = {
  generatedAt: new Date().toISOString(),
  sourceFiles: sourceFiles.length,
  coveredFiles,
  uncoveredFiles,
  fileCoveragePercent,
  linePercent,
  branchPercent,
  lineTotals: {
    covered: lineCovered,
    total: lineTotal,
  },
  branchTotals: {
    covered: branchCovered,
    total: branchTotal,
  },
  effectiveThresholds: {
    line: resolvedThresholds.line.value,
    branch: resolvedThresholds.branch.value,
  },
  thresholdSource: {
    line: resolvedThresholds.line.source,
    branch: resolvedThresholds.branch.source,
  },
  warnings,
  coverageFinalFiles: coverageFiles.map((filePath) => path.relative(repoRoot, filePath).replaceAll("\\", "/")),
  uncoveredSample,
};

await fs.mkdir(artifactsDir, { recursive: true });
await fs.writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await fs.writeFile(summaryMdPath, buildMarkdownSummary(summary), "utf8");

console.log(`[coverage] summary written to ${path.relative(repoRoot, summaryJsonPath)}`);
console.log(`[coverage] line coverage: ${summary.linePercent}% (${summary.lineTotals.covered}/${summary.lineTotals.total})`);
console.log(`[coverage] branch coverage: ${summary.branchPercent}% (${summary.branchTotals.covered}/${summary.branchTotals.total})`);

async function removeCoverageDirectories(root) {
  const entries = await safeReadDir(root);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const packageDir = path.join(root, entry.name);
    const packageEntries = await safeReadDir(packageDir);
    for (const packageEntry of packageEntries) {
      if (!packageEntry.isDirectory()) {
        continue;
      }
      if (!packageEntry.name.startsWith("coverage")) {
        continue;
      }
      await fs.rm(path.join(packageDir, packageEntry.name), { recursive: true, force: true });
    }
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
      const packageDir = path.join(dir, entry.name);
      const packageEntries = await safeReadDir(packageDir);
      for (const packageEntry of packageEntries) {
        if (!packageEntry.isDirectory()) {
          continue;
        }
        if (!packageEntry.name.startsWith("coverage")) {
          continue;
        }
        const coverageFile = path.join(packageDir, packageEntry.name, "coverage-final.json");
        try {
          await fs.access(coverageFile);
          candidates.push(coverageFile);
        } catch {
          // report folder may not contain coverage-final
        }
      }
    }
  }
  return candidates;
}

async function loadCoverageMap(files, warningsList) {
  const map = new Map();
  for (const filePath of files) {
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      warningsList.push(`Unable to read coverage report: ${path.relative(repoRoot, filePath)}`);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warningsList.push(`Invalid JSON in coverage report: ${path.relative(repoRoot, filePath)}`);
      continue;
    }

    for (const [coveredPath, data] of Object.entries(parsed)) {
      const normalized = normalizePathForLookup(String(coveredPath));
      const existing = map.get(normalized);
      map.set(normalized, existing ? mergeCoverageEntries(existing, data) : data);
    }
  }
  return map;
}

function mergeCoverageEntries(left, right) {
  const merged = {
    ...left,
    ...right,
    s: mergeHitMap(left.s, right.s),
    l: mergeHitMap(left.l, right.l),
    b: mergeBranchMap(left.b, right.b),
    statementMap: {
      ...(left.statementMap ?? {}),
      ...(right.statementMap ?? {}),
    },
    fnMap: {
      ...(left.fnMap ?? {}),
      ...(right.fnMap ?? {}),
    },
    branchMap: {
      ...(left.branchMap ?? {}),
      ...(right.branchMap ?? {}),
    },
  };
  return merged;
}

function mergeHitMap(left = {}, right = {}) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const previous = Number(merged[key] ?? 0);
    const next = Number(value ?? 0);
    merged[key] = Number.isFinite(previous) && Number.isFinite(next)
      ? Math.max(previous, next)
      : next;
  }
  return merged;
}

function mergeBranchMap(left = {}, right = {}) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const existing = Array.isArray(merged[key]) ? merged[key] : [];
    const incoming = Array.isArray(value) ? value : [];
    const length = Math.max(existing.length, incoming.length);
    const next = [];
    for (let index = 0; index < length; index += 1) {
      const previous = Number(existing[index] ?? 0);
      const current = Number(incoming[index] ?? 0);
      next.push(Number.isFinite(previous) && Number.isFinite(current) ? Math.max(previous, current) : current);
    }
    merged[key] = next;
  }
  return merged;
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

function computeCoverageMetrics(entry) {
  const statements = entry && typeof entry === "object" && "s" in entry
    ? Object.entries(entry.s ?? {})
    : [];

  const statementMap = entry && typeof entry === "object" && "statementMap" in entry
    ? entry.statementMap ?? {}
    : {};

  const lineCoverage = entry && typeof entry === "object" && "l" in entry
    ? entry.l ?? {}
    : {};

  const lineHits = new Map();
  if (lineCoverage && typeof lineCoverage === "object") {
    for (const [lineNumber, count] of Object.entries(lineCoverage)) {
      const line = Number(lineNumber);
      if (!Number.isFinite(line) || line <= 0) {
        continue;
      }
      const current = lineHits.get(line) ?? false;
      lineHits.set(line, current || Number(count) > 0);
    }
  }

  for (const [statementId, count] of statements) {
    const location = statementMap[statementId];
    const line = Number(location?.start?.line);
    if (!Number.isFinite(line) || line <= 0) {
      continue;
    }
    const current = lineHits.get(line) ?? false;
    lineHits.set(line, current || Number(count) > 0);
  }

  const lineTotal = lineHits.size;
  const lineCovered = [...lineHits.values()].filter(Boolean).length;

  const branchMap = entry && typeof entry === "object" && "b" in entry
    ? entry.b ?? {}
    : {};
  let branchTotal = 0;
  let branchCovered = 0;
  for (const counts of Object.values(branchMap)) {
    if (!Array.isArray(counts)) {
      continue;
    }
    branchTotal += counts.length;
    branchCovered += counts.filter((count) => Number(count) > 0).length;
  }

  return {
    lineTotal,
    lineCovered,
    branchTotal,
    branchCovered,
  };
}

async function countRelevantLines(filePath) {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return 0;
  }

  const candidates = collectCandidateLines(raw);
  if (candidates.size === 0) {
    return 0;
  }

  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(filePath, raw, ts.ScriptTarget.Latest, true, scriptKind);
  const typeOnlyRanges = [];
  collectTypeOnlyRanges(source, typeOnlyRanges);
  for (const range of typeOnlyRanges) {
    for (let line = range.start; line <= range.end; line += 1) {
      candidates.delete(line);
    }
  }

  return candidates.size;
}

function collectCandidateLines(raw) {
  const candidates = new Set();
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }
    candidates.add(index + 1);
  }
  return candidates;
}

function collectTypeOnlyRanges(node, out) {
  if (isTypeOnlyNode(node)) {
    out.push(getNodeLineRange(node));
    return;
  }
  ts.forEachChild(node, (child) => collectTypeOnlyRanges(child, out));
}

function isTypeOnlyNode(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    return true;
  }
  if (ts.isImportDeclaration(node)) {
    return Boolean(node.importClause?.isTypeOnly);
  }
  if (ts.isExportDeclaration(node)) {
    return Boolean(node.isTypeOnly);
  }
  if (ts.isImportEqualsDeclaration(node)) {
    return Boolean(node.isTypeOnly);
  }
  if (hasDeclareModifier(node)) {
    return true;
  }
  return false;
}

function hasDeclareModifier(node) {
  const modifiers = node.modifiers ?? [];
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
}

function getNodeLineRange(node) {
  const source = node.getSourceFile();
  const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { start, end };
}

function normalizePathForLookup(inputPath) {
  const withoutFileScheme = inputPath.replace(/^file:\/\//i, "");
  return path.resolve(withoutFileScheme).replaceAll("\\", "/").toLowerCase();
}

function resolveThresholds(warningsList) {
  const allowLower = process.env.GOATCITADEL_ALLOW_LOWER_COVERAGE_GATE === "1";
  return {
    line: resolveThreshold(
      process.env.GOATCITADEL_COVERAGE_LINE_THRESHOLD,
      DEFAULT_LINE_THRESHOLD,
      "GOATCITADEL_COVERAGE_LINE_THRESHOLD",
      allowLower,
      warningsList,
    ),
    branch: resolveThreshold(
      process.env.GOATCITADEL_COVERAGE_BRANCH_THRESHOLD,
      DEFAULT_BRANCH_THRESHOLD,
      "GOATCITADEL_COVERAGE_BRANCH_THRESHOLD",
      allowLower,
      warningsList,
    ),
  };
}

function resolveThreshold(raw, fallback, envName, allowLower, warningsList) {
  if (!raw) {
    return { value: fallback, source: "default" };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    warningsList.push(`${envName}="${raw}" is invalid. Using default ${fallback}.`);
    return { value: fallback, source: "default_invalid_override" };
  }

  if (parsed < fallback && !allowLower) {
    warningsList.push(`${envName}=${parsed} is below default ${fallback}. Set GOATCITADEL_ALLOW_LOWER_COVERAGE_GATE=1 to allow lower gates.`);
    return { value: fallback, source: "default_clamped" };
  }

  if (parsed < fallback && allowLower) {
    warningsList.push(`${envName}=${parsed} is below default ${fallback} (allowed by GOATCITADEL_ALLOW_LOWER_COVERAGE_GATE=1).`);
  }

  return { value: parsed, source: "env" };
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
  const warningsSection = summary.warnings.length > 0
    ? summary.warnings.map((item) => `- ${item}`).join("\n")
    : "- none";

  return [
    "# Coverage Summary",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- File coverage: ${summary.fileCoveragePercent}% (${summary.coveredFiles}/${summary.sourceFiles})`,
    `- Line coverage: ${summary.linePercent}% (${summary.lineTotals.covered}/${summary.lineTotals.total})`,
    `- Branch coverage: ${summary.branchPercent}% (${summary.branchTotals.covered}/${summary.branchTotals.total})`,
    `- Effective thresholds: line ${summary.effectiveThresholds.line}%, branch ${summary.effectiveThresholds.branch}%`,
    `- Threshold source: line=${summary.thresholdSource.line}, branch=${summary.thresholdSource.branch}`,
    "",
    "## Warnings",
    warningsSection,
    "",
    "## Coverage Reports",
    coverageFiles,
    "",
    "## Uncovered Sample (first 200)",
    uncovered,
    "",
  ].join("\n");
}
