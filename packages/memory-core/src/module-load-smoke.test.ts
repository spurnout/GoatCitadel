import { describe, expect, it } from "vitest";

describe("memory-core module load smoke", () => {
  it("loads memory-core exports", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeTruthy();
    expect(typeof mod.composeDistilledContext).toBe("function");
  });
});
