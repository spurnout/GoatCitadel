import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const summaryPath = path.join(repoRoot, "artifacts", "coverage", "coverage-summary.json");
const threshold = parseThreshold(process.env.GOATCITADEL_COVERAGE_FILE_THRESHOLD, 50);

let summaryRaw = "";
try {
  summaryRaw = await fs.readFile(summaryPath, "utf8");
} catch {
  console.error(`[coverage:gate] summary not found at ${path.relative(repoRoot, summaryPath)}. Run pnpm coverage:collect first.`);
  process.exit(1);
}

const summary = JSON.parse(summaryRaw);
const percent = Number(summary.fileCoveragePercent ?? 0);
if (!Number.isFinite(percent)) {
  console.error("[coverage:gate] invalid fileCoveragePercent in summary artifact.");
  process.exit(1);
}

if (percent < threshold) {
  console.error(
    `[coverage:gate] failed: file coverage ${percent}% is below required ${threshold}%. ` +
    `Covered ${summary.coveredFiles ?? 0}/${summary.sourceFiles ?? 0} files.`,
  );
  process.exit(1);
}

console.log(
  `[coverage:gate] passed: file coverage ${percent}% meets threshold ${threshold}%. ` +
  `Covered ${summary.coveredFiles ?? 0}/${summary.sourceFiles ?? 0} files.`,
);

function parseThreshold(raw, fallback) {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

