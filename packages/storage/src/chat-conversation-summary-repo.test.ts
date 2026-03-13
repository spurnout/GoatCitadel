import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { ChatConversationSummaryRepository } from "./chat-conversation-summary-repo.js";

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}-wal`, { force: true });
      fs.rmSync(`${file}-shm`, { force: true });
    } catch {
      // ignore cleanup noise
    }
  }
});

function createRepo(): ChatConversationSummaryRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-chat-conversation-summary-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new ChatConversationSummaryRepository(db);
}

describe("ChatConversationSummaryRepository", () => {
  it("upserts branch-scoped summaries and updates existing windows", () => {
    const repo = createRepo();

    const created = repo.upsert({
      sessionId: "sess-1",
      branchHeadTurnId: "turn-9",
      startTurnId: "turn-1",
      endTurnId: "turn-8",
      turnIds: ["turn-1", "turn-2", "turn-3", "turn-4", "turn-5", "turn-6", "turn-7", "turn-8"],
      sourceHash: "hash-1",
      tokenEstimate: 640,
      summary: "First summary",
    });

    assert.equal(created.summary, "First summary");
    assert.equal(created.turnIds.length, 8);

    const updated = repo.upsert({
      sessionId: "sess-1",
      branchHeadTurnId: "turn-9",
      startTurnId: "turn-1",
      endTurnId: "turn-8",
      turnIds: ["turn-1", "turn-2", "turn-3", "turn-4", "turn-5", "turn-6", "turn-7", "turn-8"],
      sourceHash: "hash-2",
      tokenEstimate: 700,
      summary: "Updated summary",
      updatedAt: "2026-03-12T10:00:00.000Z",
    });

    assert.equal(updated.summary, "Updated summary");
    assert.equal(updated.sourceHash, "hash-2");
    assert.equal(repo.listByBranch("sess-1", "turn-9").length, 1);

    repo.upsert({
      sessionId: "sess-1",
      branchHeadTurnId: "turn-12",
      startTurnId: "turn-9",
      endTurnId: "turn-11",
      turnIds: ["turn-9", "turn-10", "turn-11"],
      sourceHash: "hash-3",
      tokenEstimate: 280,
      summary: "Different branch summary",
    });

    assert.equal(repo.listByBranch("sess-1", "turn-9").length, 1);
    assert.equal(repo.listByBranch("sess-1", "turn-12").length, 1);
    assert.equal(repo.listBySession("sess-1", 10).length, 2);
  });
});
