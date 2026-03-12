import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "./tool-registry.js";

describe("tool registry", () => {
  it("includes browser session-state tools", () => {
    const catalog = createDefaultToolRegistry().toCatalog();
    expect(catalog.some((tool) => tool.toolName === "browser.cookies.get")).toBe(true);
    expect(catalog.some((tool) => tool.toolName === "browser.cookies.set")).toBe(true);
    expect(catalog.some((tool) => tool.toolName === "browser.cookies.clear")).toBe(true);
    expect(catalog.some((tool) => tool.toolName === "browser.storage.get")).toBe(true);
    expect(catalog.some((tool) => tool.toolName === "browser.storage.set")).toBe(true);
    expect(catalog.some((tool) => tool.toolName === "browser.storage.clear")).toBe(true);
    expect(catalog.some((tool) => tool.toolName === "browser.context.configure")).toBe(true);
  });

  it("excludes bankr tools by default", () => {
    const catalog = createDefaultToolRegistry().toCatalog();
    expect(catalog.some((tool) => tool.toolName.startsWith("bankr."))).toBe(false);
  });

  it("includes bankr tools when built-in support is explicitly enabled", () => {
    const catalog = createDefaultToolRegistry({ bankrBuiltinEnabled: true }).toCatalog();
    expect(catalog.some((tool) => tool.toolName.startsWith("bankr."))).toBe(true);
  });

  it("excludes bankr tools when built-in support is disabled", () => {
    const catalog = createDefaultToolRegistry({ bankrBuiltinEnabled: false }).toCatalog();
    expect(catalog.some((tool) => tool.toolName.startsWith("bankr."))).toBe(false);
  });
});
