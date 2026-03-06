import { describe, expect, it } from "vitest";
import { OperatorSummaryCache } from "./operator-summary-cache.js";

describe("OperatorSummaryCache", () => {
  const sessions = [
    {
      sessionId: "s1",
      account: "operator-a",
      lastActivityAt: "2026-03-05T10:00:00.000Z",
    },
    {
      sessionId: "s2",
      account: "operator-a",
      lastActivityAt: "2026-03-05T10:05:00.000Z",
    },
    {
      sessionId: "s3",
      account: "operator-b",
      lastActivityAt: "2026-03-05T10:02:00.000Z",
    },
  ] as never[];

  it("reuses cached summaries within the TTL", () => {
    const cache = new OperatorSummaryCache(10_000);
    const first = cache.get(sessions, Date.parse("2026-03-05T10:10:00.000Z"));
    const second = cache.get([], Date.parse("2026-03-05T10:10:05.000Z"));

    expect(second).toBe(first);
    expect(second).toHaveLength(2);
    expect(second[0]).toMatchObject({
      operatorId: "operator-a",
      sessionCount: 2,
    });
  });

  it("invalidates cached summaries on demand", () => {
    const cache = new OperatorSummaryCache(10_000);
    const first = cache.get(sessions, Date.parse("2026-03-05T10:10:00.000Z"));
    cache.invalidate();
    const second = cache.get([sessions[2] as never], Date.parse("2026-03-05T10:10:01.000Z"));

    expect(second).not.toBe(first);
    expect(second).toEqual([
      expect.objectContaining({
        operatorId: "operator-b",
        sessionCount: 1,
      }),
    ]);
  });
});
