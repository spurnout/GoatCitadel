import { describe, expect, it } from "vitest";
import { resolveViteAllowedHosts } from "./vite.config";

describe("resolveViteAllowedHosts", () => {
  it("returns safe defaults when env is not set", () => {
    const hosts = resolveViteAllowedHosts({});
    expect(hosts).toEqual(expect.arrayContaining(["localhost", "127.0.0.1", "bld", ".ts.net"]));
  });

  it("merges env allowlist entries with defaults", () => {
    const hosts = resolveViteAllowedHosts({
      GOATCITADEL_VITE_ALLOWED_HOSTS: "my-tailnet-host,internal.example",
    });
    expect(hosts).toEqual(expect.arrayContaining(["localhost", "my-tailnet-host", "internal.example"]));
  });
});
