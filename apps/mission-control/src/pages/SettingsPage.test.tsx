import { describe, expect, it } from "vitest";
import { resolveAuthStorageMode } from "./SettingsPage";

describe("SettingsPage auth storage mode", () => {
  it("forces session mode when auth mode is none", () => {
    expect(resolveAuthStorageMode("none", true)).toBe("session");
    expect(resolveAuthStorageMode("none", false)).toBe("session");
  });

  it("uses persistent mode only when remember credentials is enabled", () => {
    expect(resolveAuthStorageMode("token", false)).toBe("session");
    expect(resolveAuthStorageMode("basic", false)).toBe("session");
    expect(resolveAuthStorageMode("token", true)).toBe("persistent");
    expect(resolveAuthStorageMode("basic", true)).toBe("persistent");
  });
});

