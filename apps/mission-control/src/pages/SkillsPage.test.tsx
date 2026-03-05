import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANKR_MIGRATION_CARD_TITLE,
  BANKR_MIGRATION_DOC_PATH,
  BANKR_MIGRATION_TEMPLATE_PATH,
} from "./SkillsPage";

describe("SkillsPage Bankr migration card", () => {
  it("exports migration card constants", () => {
    expect(BANKR_MIGRATION_CARD_TITLE).toBe("Bankr is Optional");
    expect(BANKR_MIGRATION_DOC_PATH).toBe("docs/OPTIONAL_BANKR_SKILL.md");
    expect(BANKR_MIGRATION_TEMPLATE_PATH).toBe("templates/skills/bankr-optional/SKILL.md");
  });

  it("removes legacy built-in Bankr panel controls", () => {
    const source = readFileSync(new URL("./SkillsPage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Save Bankr policy");
    expect(source).not.toContain("Preview a Bankr action before execution");
    expect(source).toContain(BANKR_MIGRATION_CARD_TITLE);
  });
});
