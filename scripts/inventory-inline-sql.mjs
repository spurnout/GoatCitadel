import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const target = path.join(repoRoot, "apps", "gateway", "src", "services", "gateway-service.ts");
const outputPath = path.join(repoRoot, "artifacts", "architecture", "inline-sql-inventory.md");

let content = "";
try {
  content = await fs.readFile(target, "utf8");
} catch {
  console.error(`[inventory:inline-sql] unable to read ${path.relative(repoRoot, target)}.`);
  process.exit(1);
}

const lines = content.split(/\r?\n/);
const entries = [];
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index] ?? "";
  if (/(storage\.db|gatewayDb)\.(prepare|exec)\(/.test(line)) {
    entries.push({ line: index + 1, kind: /\.exec\(/.test(line) ? "exec" : "prepare", text: line.trim() });
  }
}

const markdown = [
  "# Gateway Inline SQL Inventory",
  "",
  `- Generated: ${new Date().toISOString()}`,
  `- File: \`${path.relative(repoRoot, target).replaceAll("\\", "/")}\``,
  `- Total inline calls: **${entries.length}**`,
  "",
  "## Calls",
  entries.length === 0 ? "- none" : entries.map((entry) => `- L${entry.line} [${entry.kind}] \`${entry.text.replace(/`/g, "\\`")}\``).join("\n"),
  "",
].join("\n");

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, markdown, "utf8");
console.log(`[inventory:inline-sql] wrote ${path.relative(repoRoot, outputPath)}`);
