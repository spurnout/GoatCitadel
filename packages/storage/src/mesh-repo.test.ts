import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { MeshRepository } from "./mesh-repo.js";

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

function createRepo(): MeshRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-mesh-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new MeshRepository(db);
}

describe("MeshRepository", () => {
  it("enforces single-use join tokens", () => {
    const repo = createRepo();
    const token = "join-token-1";
    repo.issueJoinToken(token, "2026-12-31T00:00:00.000Z");

    const joined = repo.join({
      token,
      nodeId: "node-a",
      transport: "lan",
    }, "2026-02-28T10:00:00.000Z");
    assert.equal(joined.nodeId, "node-a");

    assert.throws(() => {
      repo.join({
        token,
        nodeId: "node-b",
        transport: "lan",
      }, "2026-02-28T10:01:00.000Z");
    });
  });

  it("handles lease acquire, renew, and release with fencing tokens", () => {
    const repo = createRepo();
    const first = repo.acquireLease("planner", "node-a", 30, "2026-02-28T10:00:00.000Z");
    assert.equal(first.fencingToken, 1);

    assert.throws(() => repo.acquireLease("planner", "node-b", 30, "2026-02-28T10:00:10.000Z"));

    const renewed = repo.renewLease("planner", "node-a", 1, 30, "2026-02-28T10:00:20.000Z");
    assert.equal(renewed.fencingToken, 1);

    const released = repo.releaseLease("planner", "node-a", 1);
    assert.equal(released, true);
  });

  it("supports session ownership failover with epoch increment", () => {
    const repo = createRepo();
    const first = repo.claimSessionOwner("session-1", { ownerNodeId: "node-a" }, "2026-02-28T10:00:00.000Z");
    assert.equal(first.epoch, 1);
    assert.equal(first.ownerNodeId, "node-a");

    assert.throws(() => {
      repo.claimSessionOwner("session-1", { ownerNodeId: "node-b" }, "2026-02-28T10:00:10.000Z");
    });

    const failover = repo.claimSessionOwner(
      "session-1",
      { ownerNodeId: "node-b", expectedEpoch: 1 },
      "2026-02-28T10:00:20.000Z",
    );
    assert.equal(failover.ownerNodeId, "node-b");
    assert.equal(failover.epoch, 2);
  });

  it("dedupes replication events by source and idempotency key", () => {
    const repo = createRepo();
    const first = repo.appendReplicationEvent({
      sourceNodeId: "node-a",
      eventType: "session_event",
      payload: { sessionId: "s1" },
      idempotencyKey: "evt-1",
    });
    const second = repo.appendReplicationEvent({
      sourceNodeId: "node-a",
      eventType: "session_event",
      payload: { sessionId: "s1" },
      idempotencyKey: "evt-1",
    });

    assert.equal(first.replicationId, second.replicationId);
    assert.equal(repo.listReplicationEvents(10).length, 1);
  });
});
