import type { CronJobRecord } from "@personal-ai/contracts";
import type { DatabaseSync } from "node:sqlite";

interface CronJobRow {
  job_id: string;
  name: string;
  schedule: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  updated_at: string;
}

export class CronJobRepository {
  private readonly upsertStmt;
  private readonly listStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.upsertStmt = db.prepare(`
      INSERT INTO cron_jobs (
        job_id, name, schedule, enabled, last_run_at, next_run_at, updated_at
      ) VALUES (
        @jobId, @name, @schedule, @enabled, @lastRunAt, @nextRunAt, @updatedAt
      )
      ON CONFLICT(job_id) DO UPDATE SET
        name = excluded.name,
        schedule = excluded.schedule,
        enabled = excluded.enabled,
        last_run_at = excluded.last_run_at,
        next_run_at = excluded.next_run_at,
        updated_at = excluded.updated_at
    `);

    this.listStmt = db.prepare("SELECT * FROM cron_jobs ORDER BY job_id ASC");
  }

  public upsert(job: CronJobRecord, now = new Date().toISOString()): CronJobRecord {
    this.upsertStmt.run({
      jobId: job.jobId,
      name: job.name,
      schedule: job.schedule,
      enabled: job.enabled ? 1 : 0,
      lastRunAt: job.lastRunAt ?? null,
      nextRunAt: job.nextRunAt ?? null,
      updatedAt: now,
    });

    return job;
  }

  public list(): CronJobRecord[] {
    const rows = this.listStmt.all() as unknown as CronJobRow[];
    return rows.map((row) => ({
      jobId: row.job_id,
      name: row.name,
      schedule: row.schedule,
      enabled: Boolean(row.enabled),
      lastRunAt: row.last_run_at ?? undefined,
      nextRunAt: row.next_run_at ?? undefined,
    }));
  }
}
