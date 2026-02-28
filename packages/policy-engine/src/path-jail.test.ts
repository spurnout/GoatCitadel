import { describe, expect, it } from "vitest";
import { assertWritePathInJail } from "./sandbox/path-jail.js";

describe("assertWritePathInJail", () => {
  it("allows writes in jail", () => {
    expect(() => assertWritePathInJail("./workspace/file.txt", ["./workspace"]))
      .not.toThrow();
  });

  it("blocks traversal outside jail", () => {
    expect(() => assertWritePathInJail("./workspace/../secret.txt", ["./workspace"]))
      .toThrow(/outside write jail/i);
  });
});