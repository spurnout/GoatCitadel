import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, "apps", "mission-control", "src");

async function collectTsxFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTsxFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith(".tsx")) {
      return [fullPath];
    }
    return [];
  }));
  return files.flat();
}

function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

async function main() {
  const files = await collectTsxFiles(TARGET_DIR);
  const violations = [];
  const missingTypeRegex = /<button\b(?![^>]*\btype\s*=)[^>]*>/gms;

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    let match;
    while ((match = missingTypeRegex.exec(content)) !== null) {
      const line = getLineNumber(content, match.index);
      violations.push({
        filePath,
        line,
        snippet: match[0].replace(/\s+/g, " ").slice(0, 120),
      });
    }
  }

  if (violations.length > 0) {
    console.error("Button type check failed. Add explicit type=\"button\" or type=\"submit\".");
    for (const violation of violations) {
      const relative = path.relative(ROOT, violation.filePath).replace(/\\/g, "/");
      console.error(`- ${relative}:${violation.line} -> ${violation.snippet}`);
    }
    process.exit(1);
  }

  console.log("Button type check passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
