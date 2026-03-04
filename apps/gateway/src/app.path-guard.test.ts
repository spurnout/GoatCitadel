import { describe, expect, it } from "vitest";
import { isSuspiciousEncodedPath } from "./path-guard.js";

describe("gateway encoded-path guard", () => {
  it("accepts normal API paths", () => {
    expect(isSuspiciousEncodedPath("/api/v1/sessions?limit=50")).toBe(false);
    expect(isSuspiciousEncodedPath("/health")).toBe(false);
  });

  it("rejects encoded traversal-like sequences", () => {
    expect(isSuspiciousEncodedPath("/api/v1/%2e%2e/secrets")).toBe(true);
    expect(isSuspiciousEncodedPath("/api/v1/%252e%252e/secrets")).toBe(true);
  });

  it("rejects encoded slash/backslash segments", () => {
    expect(isSuspiciousEncodedPath("/api/v1/channels/%2Ffoo/inbound")).toBe(true);
    expect(isSuspiciousEncodedPath("/api/v1/channels/%5Cfoo/inbound")).toBe(true);
  });

  it("rejects malformed encoded paths", () => {
    expect(isSuspiciousEncodedPath("/api/v1/%zz/inbound")).toBe(true);
  });
});
