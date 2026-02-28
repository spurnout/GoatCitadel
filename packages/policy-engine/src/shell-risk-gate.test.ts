import { describe, expect, it } from "vitest";
import { classifyShellRisk } from "./sandbox/shell-risk-gate.js";

describe("classifyShellRisk", () => {
  it("flags risky commands", () => {
    const risk = classifyShellRisk("git reset --hard", ["git reset --hard"]);
    expect(risk.risky).toBe(true);
  });

  it("keeps safe commands non-risky", () => {
    const risk = classifyShellRisk("git status", ["git reset --hard"]);
    expect(risk.risky).toBe(false);
  });
});