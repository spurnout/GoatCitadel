import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "./tool-registry.js";

describe("tool registry", () => {
  it("includes bankr tools by default", () => {
    const catalog = createDefaultToolRegistry().toCatalog();
    expect(catalog.some((tool) => tool.toolName.startsWith("bankr."))).toBe(true);
  });

  it("excludes bankr tools when built-in support is disabled", () => {
    const catalog = createDefaultToolRegistry({ bankrBuiltinEnabled: false }).toCatalog();
    expect(catalog.some((tool) => tool.toolName.startsWith("bankr."))).toBe(false);
  });
});
