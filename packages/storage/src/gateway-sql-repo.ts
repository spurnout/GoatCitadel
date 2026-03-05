import type { DatabaseSync, StatementSync } from "node:sqlite";

export class GatewaySqlRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public prepare(sql: string): StatementSync {
    return this.db.prepare(sql);
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }
}
