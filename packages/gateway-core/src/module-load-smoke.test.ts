import { describe, expect, it } from "vitest";

describe("gateway-core module load smoke", () => {
  it("loads gateway-core exports", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeTruthy();
  });
});

