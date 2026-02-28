import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { ApprovalEventRepository } from "./approval-event-repo.js";

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

function createRepo(): ApprovalEventRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-approval-events-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new ApprovalEventRepository(db);
}

describe("ApprovalEventRepository", () => {
  it("stores and replays approval events", () => {
    const repo = createRepo();
    repo.append({
      approvalId: "ap-1",
      eventType: "created",
      actorId: "system",
      payload: { foo: "bar" },
      timestamp: "2026-02-27T10:00:00.000Z",
    });
    repo.append({
      approvalId: "ap-1",
      eventType: "resolved",
      actorId: "operator",
      payload: { decision: "approve" },
      timestamp: "2026-02-27T10:01:00.000Z",
    });

    const events = repo.listByApprovalId("ap-1");
    assert.equal(events.length, 2);
    assert.equal(events[0]?.eventType, "created");
    assert.equal(events[1]?.eventType, "resolved");
  });
});