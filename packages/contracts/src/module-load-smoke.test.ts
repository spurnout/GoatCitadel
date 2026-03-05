import { describe, expect, it } from "vitest";

describe("contracts module load smoke", () => {
  it("loads contracts index exports", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeTruthy();
    expect(typeof mod).toBe("object");
  });
});
