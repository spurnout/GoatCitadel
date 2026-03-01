import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PromptPackRecord, PromptPackTestRecord } from "@goatcitadel/contracts";

interface PromptPackRow {
  pack_id: string;
  name: string;
  source_label: string | null;
  test_count: number;
  created_at: string;
  updated_at: string;
}

interface PromptPackTestRow {
  test_id: string;
  pack_id: string;
  code: string;
  title: string;
  prompt: string;
  order_index: number;
  created_at: string;
}

export class PromptPackRepository {
  private readonly getPackStmt;
  private readonly listPacksStmt;
  private readonly upsertPackStmt;
  private readonly deleteTestsByPackStmt;
  private readonly insertTestStmt;
  private readonly listTestsStmt;
  private readonly getTestStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getPackStmt = db.prepare("SELECT * FROM prompt_packs WHERE pack_id = ?");
    this.listPacksStmt = db.prepare(`
      SELECT * FROM prompt_packs
      ORDER BY updated_at DESC
      LIMIT @limit
    `);
    this.upsertPackStmt = db.prepare(`
      INSERT INTO prompt_packs (pack_id, name, source_label, test_count, created_at, updated_at)
      VALUES (@packId, @name, @sourceLabel, @testCount, @createdAt, @updatedAt)
      ON CONFLICT(pack_id) DO UPDATE SET
        name = excluded.name,
        source_label = excluded.source_label,
        test_count = excluded.test_count,
        updated_at = excluded.updated_at
    `);
    this.deleteTestsByPackStmt = db.prepare("DELETE FROM prompt_pack_tests WHERE pack_id = ?");
    this.insertTestStmt = db.prepare(`
      INSERT INTO prompt_pack_tests (test_id, pack_id, code, title, prompt, order_index, created_at)
      VALUES (@testId, @packId, @code, @title, @prompt, @orderIndex, @createdAt)
    `);
    this.listTestsStmt = db.prepare(`
      SELECT * FROM prompt_pack_tests
      WHERE pack_id = @packId
      ORDER BY order_index ASC, created_at ASC
      LIMIT @limit
    `);
    this.getTestStmt = db.prepare("SELECT * FROM prompt_pack_tests WHERE test_id = ?");
  }

  public getPack(packId: string): PromptPackRecord {
    const row = this.getPackStmt.get(packId) as PromptPackRow | undefined;
    if (!row) {
      throw new Error(`Prompt pack ${packId} not found`);
    }
    return mapPackRow(row);
  }

  public listPacks(limit = 100): PromptPackRecord[] {
    const rows = this.listPacksStmt.all({
      limit: Math.max(1, Math.min(limit, 1000)),
    }) as unknown as PromptPackRow[];
    return rows.map(mapPackRow);
  }

  public listTests(packId: string, limit = 1000): PromptPackTestRecord[] {
    const rows = this.listTestsStmt.all({
      packId,
      limit: Math.max(1, Math.min(limit, 5000)),
    }) as unknown as PromptPackTestRow[];
    return rows.map(mapTestRow);
  }

  public getTest(testId: string): PromptPackTestRecord {
    const row = this.getTestStmt.get(testId) as PromptPackTestRow | undefined;
    if (!row) {
      throw new Error(`Prompt pack test ${testId} not found`);
    }
    return mapTestRow(row);
  }

  public replacePackTests(input: {
    packId?: string;
    name: string;
    sourceLabel?: string;
    tests: Array<{
      code: string;
      title: string;
      prompt: string;
      orderIndex: number;
    }>;
  }): {
    pack: PromptPackRecord;
    tests: PromptPackTestRecord[];
  } {
    const now = new Date().toISOString();
    const packId = input.packId ?? `pack-${randomUUID()}`;
    const existing = this.getPackStmt.get(packId) as PromptPackRow | undefined;
    this.upsertPackStmt.run({
      packId,
      name: input.name,
      sourceLabel: input.sourceLabel ?? null,
      testCount: input.tests.length,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    });

    this.deleteTestsByPackStmt.run(packId);
    for (const test of input.tests) {
      this.insertTestStmt.run({
        testId: `ppt-${randomUUID()}`,
        packId,
        code: test.code,
        title: test.title,
        prompt: test.prompt,
        orderIndex: test.orderIndex,
        createdAt: now,
      });
    }

    return {
      pack: this.getPack(packId),
      tests: this.listTests(packId, Math.max(1000, input.tests.length + 10)),
    };
  }
}

function mapPackRow(row: PromptPackRow): PromptPackRecord {
  return {
    packId: row.pack_id,
    name: row.name,
    sourceLabel: row.source_label ?? undefined,
    testCount: row.test_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTestRow(row: PromptPackTestRow): PromptPackTestRecord {
  return {
    testId: row.test_id,
    packId: row.pack_id,
    code: row.code,
    title: row.title,
    prompt: row.prompt,
    orderIndex: row.order_index,
    createdAt: row.created_at,
  };
}

