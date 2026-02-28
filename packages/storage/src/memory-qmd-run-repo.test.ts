import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { MemoryQmdRunRepository } from "./memory-qmd-run-repo.js";

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}-wal`, { force: true });
      fs.rmSync(`${file}-shm`, { force: true });
    } catch {
      // ignore
    }
  }
});

function createRepo(): MemoryQmdRunRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-memory-run-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new MemoryQmdRunRepository(db);
}

describe("MemoryQmdRunRepository", () => {
  it("stores run records and computes aggregate stats", () => {
    const repo = createRepo();
    repo.append({
      scope: "chat",
      status: "generated",
      durationMs: 150,
      candidateCount: 12,
      citationsCount: 4,
      originalTokenEstimate: 1000,
      distilledTokenEstimate: 450,
      savingsPercent: 55,
      createdAt: "2026-02-28T10:00:00.000Z",
    });
    repo.append({
      scope: "chat",
      status: "cache_hit",
      durationMs: 10,
      candidateCount: 12,
      citationsCount: 4,
      originalTokenEstimate: 1000,
      distilledTokenEstimate: 450,
      savingsPercent: 55,
      createdAt: "2026-02-28T10:30:00.000Z",
    });

    const stats = repo.stats("2026-02-28T00:00:00.000Z", "2026-02-28T23:59:59.999Z");
    assert.equal(stats.totalRuns, 2);
    assert.equal(stats.generatedRuns, 1);
    assert.equal(stats.cacheHitRuns, 1);
    assert.equal(stats.originalTokenEstimate, 2000);
    assert.equal(stats.distilledTokenEstimate, 900);
    assert.equal(stats.savingsPercent, 55);
  });
});
