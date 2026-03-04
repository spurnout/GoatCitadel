import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { DurableRunRepository } from "./durable-run-repo.js";

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

function createRepo(): DurableRunRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-durable-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new DurableRunRepository(db);
}

describe("DurableRunRepository", () => {
  it("serializes checkpoint state payloads safely", () => {
    const repo = createRepo();
    const run = repo.createRun({
      workflowKey: "prompt_replay",
      payload: { testCode: "TEST-12" },
    });
    const expected = {
      status: "running",
      replay: {
        fromCheckpoint: "cp-01",
        withOverrides: { model: "glm/glm-5" },
      },
    };
    repo.createCheckpoint({
      runId: run.runId,
      checkpointKind: "manual_replay_requested",
      state: expected,
    });
    const checkpoints = repo.listCheckpoints(run.runId, 20);
    assert.equal(checkpoints.length, 1);
    assert.deepEqual(checkpoints[0]?.state, expected);
  });

  it("keeps retry attempts idempotent by run and attempt number", () => {
    const repo = createRepo();
    const run = repo.createRun({
      workflowKey: "daily_sync",
      payload: { scope: "workspace" },
    });

    repo.upsertRetry({
      runId: run.runId,
      attemptNo: 1,
      reason: "temporary timeout",
      nextRetryAt: "2026-03-03T12:00:00.000Z",
    });
    repo.upsertRetry({
      runId: run.runId,
      attemptNo: 1,
      reason: "temporary timeout (updated reason)",
      nextRetryAt: "2026-03-03T12:30:00.000Z",
    });

    const retries = repo.listRetries(run.runId, 20);
    assert.equal(retries.length, 1);
    assert.equal(retries[0]?.attemptNo, 1);
    assert.equal(retries[0]?.reason, "temporary timeout (updated reason)");
    assert.equal(retries[0]?.nextRetryAt, "2026-03-03T12:30:00.000Z");
  });
});

