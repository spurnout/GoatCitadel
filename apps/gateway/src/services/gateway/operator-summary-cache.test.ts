import { describe, expect, it, vi } from "vitest";
import type { OperatorSummary } from "@goatcitadel/contracts";
import { OperatorSummaryCache } from "./operator-summary-cache.js";

describe("OperatorSummaryCache", () => {
  const summaries: OperatorSummary[] = [
    {
      operatorId: "operator-a",
      sessionCount: 2,
      activeSessions: 1,
      lastActivityAt: "2026-03-05T10:05:00.000Z",
    },
    {
      operatorId: "operator-b",
      sessionCount: 1,
      activeSessions: 1,
      lastActivityAt: "2026-03-05T10:02:00.000Z",
    },
  ];

  it("reuses cached summaries within the TTL", () => {
    const cache = new OperatorSummaryCache(10_000);
    const loader = vi.fn(() => summaries);
    const first = cache.get(loader, Date.parse("2026-03-05T10:10:00.000Z"));
    const second = cache.get(() => [], Date.parse("2026-03-05T10:10:05.000Z"));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(second).toHaveLength(2);
    expect(second[0]).toMatchObject({
      operatorId: "operator-a",
      sessionCount: 2,
    });
  });

  it("invalidates cached summaries on demand", () => {
    const cache = new OperatorSummaryCache(10_000);
    const first = cache.get(() => summaries, Date.parse("2026-03-05T10:10:00.000Z"));
    cache.invalidate();
    const second = cache.get(() => [summaries[1]!], Date.parse("2026-03-05T10:10:01.000Z"));

    expect(second).not.toBe(first);
    expect(second).toEqual([
      expect.objectContaining({
        operatorId: "operator-b",
        sessionCount: 1,
      }),
    ]);
  });
});
