import { describe, expect, it } from "vitest";

describe("skills module load smoke", () => {
  it("loads skills exports", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeTruthy();
    expect(typeof mod.SkillsService).toBe("function");
  });
});

