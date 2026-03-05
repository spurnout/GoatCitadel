import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const target = path.join(repoRoot, "apps", "gateway", "src", "services", "gateway-service.ts");

let content = "";
try {
  content = await fs.readFile(target, "utf8");
} catch {
  console.error(`[check:no-inline-sql] unable to read ${path.relative(repoRoot, target)}.`);
  process.exit(1);
}

const pattern = /(storage\.db|gatewayDb)\.(prepare|exec)\(/g;
const lines = content.split(/\r?\n/);
const hits = [];
for (let index = 0; index < lines.length; index += 1) {
  if (pattern.test(lines[index] ?? "")) {
    hits.push({ line: index + 1, text: (lines[index] ?? "").trim() });
  }
  pattern.lastIndex = 0;
}

if (hits.length > 0) {
  console.error(`[check:no-inline-sql] found ${hits.length} inline DB prepare/exec calls in ${path.relative(repoRoot, target)}.`);
  for (const hit of hits.slice(0, 20)) {
    console.error(`  - ${hit.line}: ${hit.text}`);
  }
  if (hits.length > 20) {
    console.error(`  ... ${hits.length - 20} more`);
  }
  process.exit(1);
}

console.log(`[check:no-inline-sql] passed: no inline DB prepare/exec calls in ${path.relative(repoRoot, target)}.`);
