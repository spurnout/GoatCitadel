import { describe, expect, it } from "vitest";
import { renderBox } from "./render.js";

function visibleWidth(line: string): number {
  return [...line.replace(/\x1B\[[0-9;]*m/g, "")].length;
}

describe("renderBox", () => {
  it("keeps every line aligned for a title-only box", () => {
    const lines = renderBox("Title", [], "info").split("\n");
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(40);
  });

  it("keeps every line aligned for multi-line content", () => {
    const lines = renderBox("Current state", [
      "Provider: glm",
      "Model: glm-5",
      "Mode: balanced",
    ], "success").split("\n");
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);
  });

  it("clamps to the minimum width without shifting the right border", () => {
    const lines = renderBox("Hi", ["ok"], "warning").split("\n");
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(40);
  });
});
