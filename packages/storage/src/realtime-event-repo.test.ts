import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { RealtimeEventRepository } from "./realtime-event-repo.js";

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

function createRepo(): RealtimeEventRepository {
  const dbPath = path.join(os.tmpdir(), `personal-ai-events-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new RealtimeEventRepository(db);
}

describe("RealtimeEventRepository", () => {
  it("stores and paginates realtime events", () => {
    const repo = createRepo();
    const first = repo.append("task_created", "tasks", { taskId: "t1" }, "2026-02-27T10:00:00.000Z");
    const second = repo.append("task_updated", "tasks", { taskId: "t1" }, "2026-02-27T11:00:00.000Z");

    const latest = repo.list(10);
    assert.equal(latest.length, 2);
    assert.equal(latest[0]?.eventId, second.eventId);

    const paged = repo.list(10, second.timestamp);
    assert.equal(paged.length, 1);
    assert.equal(paged[0]?.eventId, first.eventId);
  });
});
