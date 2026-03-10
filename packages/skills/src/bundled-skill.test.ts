import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSkillMarkdown } from "./frontmatter.js";
import { SkillsService } from "./loader.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const bundledDir = path.join(repoRoot, "skills", "bundled");
const skillDir = path.join(bundledDir, "goatcitadel-native-safe-self-improvement");
const skillFile = path.join(skillDir, "SKILL.md");

describe("goatcitadel-native-safe-self-improvement bundled skill", () => {
  it("parses normalized frontmatter metadata", async () => {
    const raw = await fs.readFile(skillFile, "utf8");
    const parsed = parseSkillMarkdown(raw);

    expect(parsed.frontmatter.name).toBe("GoatCitadel Native Safe Improvement");
    expect(parsed.frontmatter.metadata?.version).toBe("0.2.0");
    expect(parsed.frontmatter.metadata?.tags).toContain("self-improvement");
    expect(parsed.frontmatter.metadata?.tools).toEqual(["fs.read", "fs.write", "memory.read"]);
    expect(parsed.frontmatter.metadata?.keywords).toContain("routing gap");
    expect(parsed.frontmatter.metadata?.keywords).toContain("goatcitadel native safe improvement");
  });

  it("loads from the bundled skills source", async () => {
    const service = new SkillsService([{ source: "bundled", dir: bundledDir }]);
    const loaded = await service.reload();
    const skill = loaded.find((item) => item.name === "GoatCitadel Native Safe Improvement");

    expect(skill).toBeTruthy();
    expect(skill?.source).toBe("bundled");
    expect(skill?.declaredTools).toEqual(["fs.read", "fs.write", "memory.read"]);
    expect(skill?.keywords).toContain("post-task reflection");
  });

  it("supports explicit-by-name text and guarded auto activation without matching unrelated coding prompts", async () => {
    const service = new SkillsService([{ source: "bundled", dir: bundledDir }]);
    await service.reload();

    const explicit = service.resolveActivation({
      text: "Please use goatcitadel native safe improvement for this correction log.",
    });
    expect(explicit.selected.map((skill) => skill.name)).toContain("GoatCitadel Native Safe Improvement");

    const guardedAuto = service.resolveActivation({
      text: "That's wrong. From now on log this as workflow friction and a routing gap.",
    });
    expect(guardedAuto.selected.map((skill) => skill.name)).toContain("GoatCitadel Native Safe Improvement");

    const unrelated = service.resolveActivation({
      text: "Fix the TypeScript error in the gateway route and add a regression test.",
    });
    expect(unrelated.selected.map((skill) => skill.name)).not.toContain("GoatCitadel Native Safe Improvement");
  });
});
