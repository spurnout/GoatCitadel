import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("storage module load smoke", () => {
  it("loads storage exports", async () => {
    const mod = await import("./index.js");
    assert.ok(mod);
    assert.equal(typeof mod.Storage, "function");
  });
});

