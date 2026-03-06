import type { OperatorSummary, SessionMeta } from "@goatcitadel/contracts";

export class OperatorSummaryCache {
  private cachedAt = 0;
  private cached: OperatorSummary[] | null = null;

  public constructor(private readonly ttlMs = 15_000) {}

  public get(sessions: SessionMeta[], now = Date.now()): OperatorSummary[] {
    if (this.cached && now - this.cachedAt < this.ttlMs) {
      return this.cached;
    }

    const activeThreshold = now - 10 * 60 * 1000;
    const byOperator = new Map<string, OperatorSummary>();

    for (const session of sessions) {
      const key = session.account;
      const existing = byOperator.get(key) ?? {
        operatorId: key,
        sessionCount: 0,
        activeSessions: 0,
        lastActivityAt: undefined,
      };

      existing.sessionCount += 1;
      if (Date.parse(session.lastActivityAt) >= activeThreshold) {
        existing.activeSessions += 1;
      }

      if (!existing.lastActivityAt || Date.parse(session.lastActivityAt) > Date.parse(existing.lastActivityAt)) {
        existing.lastActivityAt = session.lastActivityAt;
      }

      byOperator.set(key, existing);
    }

    this.cached = Array.from(byOperator.values()).sort((a, b) => {
      const left = Date.parse(a.lastActivityAt ?? "1970-01-01T00:00:00.000Z");
      const right = Date.parse(b.lastActivityAt ?? "1970-01-01T00:00:00.000Z");
      return right - left;
    });
    this.cachedAt = now;
    return this.cached;
  }

  public invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }
}
