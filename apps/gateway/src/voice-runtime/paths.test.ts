import { describe, expect, it } from "vitest";
import { detectManagedVoicePlatform } from "./paths.js";

describe("detectManagedVoicePlatform", () => {
  it("supports Windows ARM64 via managed x64 emulation runtime", () => {
    expect(detectManagedVoicePlatform("win32", "arm64")).toBe("windows-arm64");
  });

  it("returns null for unsupported triplets", () => {
    expect(detectManagedVoicePlatform("linux", "arm64")).toBeNull();
  });
});
