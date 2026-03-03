import { describe, expect, it } from "vitest";
import { isTailnetDevOrigin, isTailnetOrPrivateHost, resolveTailnetShortHostAllowlist } from "./cors-origin-guard.js";

describe("cors-origin-guard", () => {
  it("requires explicit allowlist for short hostnames", () => {
    expect(isTailnetOrPrivateHost("bld", new Set())).toBe(false);
    expect(isTailnetOrPrivateHost("bld", new Set(["bld"]))).toBe(true);
  });

  it("accepts ts.net and private ranges", () => {
    expect(isTailnetOrPrivateHost("node.ts.net", new Set())).toBe(true);
    expect(isTailnetOrPrivateHost("10.0.0.8", new Set())).toBe(true);
    expect(isTailnetOrPrivateHost("100.72.1.9", new Set())).toBe(true);
  });

  it("allows only dev ports for tailnet dev origins", () => {
    expect(isTailnetDevOrigin("http://bld:5173", new Set(["bld"]))).toBe(true);
    expect(isTailnetDevOrigin("http://bld:8787", new Set(["bld"]))).toBe(false);
  });

  it("derives default short-host allowlist safely", () => {
    const hosts = resolveTailnetShortHostAllowlist({
      GATEWAY_HOST: "0.0.0.0",
    });
    expect(hosts.has("bld")).toBe(true);
  });
});
