import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { CostLedgerRepository } from "./cost-ledger-repo.js";

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

function createRepo(): CostLedgerRepository {
  const dbPath = path.join(os.tmpdir(), `personal-ai-cost-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new CostLedgerRepository(db);
}

describe("CostLedgerRepository", () => {
  it("aggregates by session/day/agent/task", () => {
    const repo = createRepo();
    repo.insert({
      sessionId: "s1",
      agentId: "agent-a",
      taskId: "task-1",
      tokenInput: 10,
      tokenOutput: 20,
      tokenCachedInput: 2,
      costUsd: 0.1,
      createdAt: "2026-02-27T10:00:00.000Z",
    });
    repo.insert({
      sessionId: "s2",
      agentId: "agent-a",
      taskId: "task-2",
      tokenInput: 5,
      tokenOutput: 5,
      tokenCachedInput: 1,
      costUsd: 0.05,
      createdAt: "2026-02-27T12:00:00.000Z",
    });

    const byDay = repo.summary("day", "2026-02-20T00:00:00.000Z", "2026-02-28T00:00:00.000Z");
    const byAgent = repo.summary("agent", "2026-02-20T00:00:00.000Z", "2026-02-28T00:00:00.000Z");
    const byTask = repo.summary("task", "2026-02-20T00:00:00.000Z", "2026-02-28T00:00:00.000Z");

    assert.equal(byDay[0]?.tokenTotal, 40);
    assert.equal(byAgent[0]?.key, "agent-a");
    assert.equal(byAgent[0]?.tokenTotal, 40);
    assert.equal(byTask.length, 2);
  });
});