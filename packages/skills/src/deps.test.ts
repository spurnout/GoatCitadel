import { describe, expect, it } from "vitest";
import type { LoadedSkill } from "@goatcitadel/contracts";
import { resolveDependencies } from "./deps.js";

function makeSkill(name: string, requires: string[]): LoadedSkill {
  return {
    skillId: name,
    name,
    source: "bundled",
    dir: `/tmp/${name}`,
    declaredTools: [],
    requires,
    keywords: [],
    instructionBody: "",
    mtime: "2025-01-01T00:00:00.000Z",
  };
}

describe("resolveDependencies", () => {
  it("resolves required skills", () => {
    const a = makeSkill("a", ["b"]);
    const b = makeSkill("b", []);
    const result = resolveDependencies([a], [a, b]);

    expect(result.blocked).toHaveLength(0);
    expect(result.ordered.map((s) => s.name)).toEqual(["b", "a"]);
  });

  it("detects cycles", () => {
    const a = makeSkill("a", ["b"]);
    const b = makeSkill("b", ["a"]);
    const result = resolveDependencies([a], [a, b]);

    expect(result.blocked.length).toBeGreaterThan(0);
    expect(result.ordered.map((s) => s.name)).toEqual([]);
  });
});
