import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { PromptPackScoreRepository } from "./prompt-pack-score-repo.js";

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}-wal`, { force: true });
      fs.rmSync(`${file}-shm`, { force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

function createRepo(): PromptPackScoreRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-prompt-pack-score-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new PromptPackScoreRepository(db);
}

describe("PromptPackScoreRepository", () => {
  it("rejects score values outside 0..2", () => {
    const repo = createRepo();

    assert.throws(() => {
      repo.create({
        scoreId: "score-1",
        packId: "pack-1",
        testId: "test-1",
        runId: "run-1",
        routingScore: 3 as 0 | 1 | 2,
        honestyScore: 1,
        handoffScore: 1,
        robustnessScore: 1,
        usabilityScore: 1,
      });
    }, /routingScore must be an integer between 0 and 2/);
  });
});
