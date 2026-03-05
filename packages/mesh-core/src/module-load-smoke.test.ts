import { describe, expect, it } from "vitest";

describe("mesh-core module load smoke", () => {
  it("loads mesh-core exports", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeTruthy();
    expect(typeof mod.MeshService).toBe("function");
  });
});

