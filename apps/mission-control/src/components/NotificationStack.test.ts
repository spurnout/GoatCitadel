import { describe, expect, it } from "vitest";
import { upsertNotificationItem, type NotificationItem } from "./NotificationStack";

describe("upsertNotificationItem", () => {
  it("deduplicates grouped notifications and increments the repeat count", () => {
    const current: NotificationItem[] = [{
      id: "existing",
      tone: "warning",
      message: "Live updates degraded. GoatCitadel is reconnecting.",
      timestamp: 100,
      groupKey: "stream-connection",
      count: 1,
    }];

    const next = upsertNotificationItem(current, {
      id: "new",
      tone: "warning",
      message: "Live updates degraded. GoatCitadel is reconnecting.",
      timestamp: 200,
      groupKey: "stream-connection",
    });

    expect(next).toEqual([{
      id: "existing",
      tone: "warning",
      message: "Live updates degraded. GoatCitadel is reconnecting.",
      timestamp: 200,
      groupKey: "stream-connection",
      count: 2,
    }]);
  });

  it("replaces grouped notifications when the tone or message changes", () => {
    const current: NotificationItem[] = [{
      id: "existing",
      tone: "warning",
      message: "Live updates degraded. GoatCitadel is reconnecting.",
      timestamp: 100,
      groupKey: "stream-connection",
      count: 3,
    }];

    const next = upsertNotificationItem(current, {
      id: "new",
      tone: "success",
      message: "Live updates connected.",
      timestamp: 250,
      groupKey: "stream-connection",
    });

    expect(next).toEqual([{
      id: "existing",
      tone: "success",
      message: "Live updates connected.",
      timestamp: 250,
      groupKey: "stream-connection",
      count: 1,
    }]);
  });
});
