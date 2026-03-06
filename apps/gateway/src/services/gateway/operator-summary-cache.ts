import type { OperatorSummary } from "@goatcitadel/contracts";

export class OperatorSummaryCache {
  private cachedAt = 0;
  private cached: OperatorSummary[] | null = null;

  public constructor(private readonly ttlMs = 15_000) {}

  public get(loader: () => OperatorSummary[], now = Date.now()): OperatorSummary[] {
    if (this.cached && now - this.cachedAt < this.ttlMs) {
      return this.cached;
    }

    this.cached = loader();
    this.cachedAt = now;
    return this.cached;
  }

  public invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }
}
