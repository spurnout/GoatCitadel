import { describe, expect, it } from "vitest";
import { isTrustedGatewayHost } from "./client";

describe("isTrustedGatewayHost", () => {
  it("allows local and private hosts by default", () => {
    expect(isTrustedGatewayHost("localhost")).toBe(true);
    expect(isTrustedGatewayHost("127.0.0.1")).toBe(true);
    expect(isTrustedGatewayHost("10.0.0.15")).toBe(true);
    expect(isTrustedGatewayHost("100.115.92.2")).toBe(true);
    expect(isTrustedGatewayHost("bld.ts.net")).toBe(true);
  });

  it("rejects untrusted public hostnames without explicit allowlist", () => {
    expect(isTrustedGatewayHost("evil.example.com")).toBe(false);
  });

  it("allows explicitly configured hosts", () => {
    expect(isTrustedGatewayHost("gateway.internal", "gateway.internal,.corp.local")).toBe(true);
    expect(isTrustedGatewayHost("api.corp.local", "gateway.internal,.corp.local")).toBe(true);
  });
});
