import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { PendingApprovalActionRepository } from "./pending-approval-action-repo.js";

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

function createRepo(): PendingApprovalActionRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-pending-approval-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new PendingApprovalActionRepository(db);
}

describe("PendingApprovalActionRepository", () => {
  it("tracks pending to executed lifecycle", () => {
    const repo = createRepo();
    repo.upsertPending({
      approvalId: "ap-1",
      actionType: "tool.invoke",
      request: { toolName: "fs.write" },
    });

    const pending = repo.find("ap-1");
    assert.equal(pending?.resolutionStatus, "pending");

    const resolved = repo.markResolved("ap-1", "executed", { ok: true });
    assert.equal(resolved.resolutionStatus, "executed");
    assert.equal(resolved.result?.ok, true);

    const secondResolve = repo.markResolved("ap-1", "failed", { ok: false });
    assert.equal(secondResolve.resolutionStatus, "executed");
    assert.equal(secondResolve.result?.ok, true);
  });
});
