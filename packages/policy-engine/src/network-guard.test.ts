import { describe, expect, it } from "vitest";
import { isHostAllowed } from "./sandbox/network-guard.js";

describe("isHostAllowed", () => {
  it("matches exact host", () => {
    expect(isHostAllowed("api.openai.com", ["api.openai.com"]))
      .toBe(true);
  });

  it("matches wildcard host", () => {
    expect(isHostAllowed("https://foo.example.com/path", ["*.example.com"]))
      .toBe(true);
  });

  it("rejects host not on allowlist", () => {
    expect(isHostAllowed("evil.com", ["*.example.com"]))
      .toBe(false);
  });
});