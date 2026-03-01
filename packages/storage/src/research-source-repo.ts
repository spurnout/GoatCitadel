import type { DatabaseSync } from "node:sqlite";
import type { ResearchSourceRecord } from "@goatcitadel/contracts";

interface ResearchSourceRow {
  source_id: string;
  run_id: string;
  title: string | null;
  url: string;
  snippet: string | null;
  rank: number;
  created_at: string;
}

export class ResearchSourceRepository {
  private readonly insertStmt;
  private readonly listByRunStmt;
  private readonly deleteByRunStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO research_sources (
        source_id, run_id, title, url, snippet, rank, created_at
      ) VALUES (
        @sourceId, @runId, @title, @url, @snippet, @rank, @createdAt
      )
    `);
    this.listByRunStmt = db.prepare(`
      SELECT * FROM research_sources
      WHERE run_id = @runId
      ORDER BY rank ASC, created_at ASC
      LIMIT @limit
    `);
    this.deleteByRunStmt = db.prepare("DELETE FROM research_sources WHERE run_id = ?");
  }

  public replaceForRun(runId: string, sources: Array<{
    sourceId: string;
    title?: string;
    url: string;
    snippet?: string;
    rank: number;
    createdAt?: string;
  }>): ResearchSourceRecord[] {
    this.deleteByRunStmt.run(runId);
    const now = new Date().toISOString();
    for (const source of sources) {
      this.insertStmt.run({
        sourceId: source.sourceId,
        runId,
        title: source.title ?? null,
        url: source.url,
        snippet: source.snippet ?? null,
        rank: source.rank,
        createdAt: source.createdAt ?? now,
      });
    }
    return this.listByRun(runId, Math.max(50, sources.length + 10));
  }

  public listByRun(runId: string, limit = 200): ResearchSourceRecord[] {
    const rows = this.listByRunStmt.all({
      runId,
      limit: Math.max(1, Math.min(limit, 1000)),
    }) as unknown as ResearchSourceRow[];
    return rows.map(mapRow);
  }
}

function mapRow(row: ResearchSourceRow): ResearchSourceRecord {
  return {
    sourceId: row.source_id,
    runId: row.run_id,
    title: row.title ?? undefined,
    url: row.url,
    snippet: row.snippet ?? undefined,
    rank: row.rank,
    createdAt: row.created_at,
  };
}
