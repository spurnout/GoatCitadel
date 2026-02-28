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
  const dbPath = path.join(os.tmpdir(), `goatcitadel-events-${randomUUID()}.db`);
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

  it("does not drop events sharing the same timestamp across cursor pages", () => {
    const repo = createRepo();
    repo.append("task_created", "tasks", { taskId: "a" }, "2026-02-27T12:00:00.000Z");
    repo.append("task_updated", "tasks", { taskId: "b" }, "2026-02-27T12:00:00.000Z");
    repo.append("task_updated", "tasks", { taskId: "c" }, "2026-02-27T11:59:00.000Z");

    const firstPage = repo.list(1);
    const cursor = `${firstPage[0]!.timestamp}|${firstPage[0]!.eventId}`;
    const secondPage = repo.list(10, cursor);

    assert.equal(secondPage.length, 2);
    assert.equal(secondPage.some((event) => event.eventId === firstPage[0]?.eventId), false);
  });
});
