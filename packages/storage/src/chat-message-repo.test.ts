import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { ChatMessageRepository } from "./chat-message-repo.js";

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

function createRepo(): ChatMessageRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-chat-messages-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new ChatMessageRepository(db);
}

describe("ChatMessageRepository", () => {
  it("lists latest messages in ascending display order", () => {
    const repo = createRepo();
    repo.upsert({
      messageId: "m1",
      sessionId: "sess-1",
      role: "user",
      actorType: "user",
      actorId: "operator",
      content: "first",
      timestamp: "2026-03-05T01:00:00.000Z",
    });
    repo.upsert({
      messageId: "m2",
      sessionId: "sess-1",
      role: "assistant",
      actorType: "agent",
      actorId: "assistant",
      content: "second",
      timestamp: "2026-03-05T01:00:01.000Z",
    });
    repo.upsert({
      messageId: "m3",
      sessionId: "sess-1",
      role: "assistant",
      actorType: "agent",
      actorId: "assistant",
      content: "third",
      timestamp: "2026-03-05T01:00:02.000Z",
    });

    const items = repo.list("sess-1", 2);
    assert.deepEqual(items.map((item) => item.messageId), ["m2", "m3"]);
  });

  it("pages older items by cursor message id", () => {
    const repo = createRepo();
    for (let index = 1; index <= 5; index += 1) {
      repo.upsert({
        messageId: `m${index}`,
        sessionId: "sess-1",
        role: index % 2 === 0 ? "assistant" : "user",
        actorType: index % 2 === 0 ? "agent" : "user",
        actorId: index % 2 === 0 ? "assistant" : "operator",
        content: `msg-${index}`,
        timestamp: `2026-03-05T01:00:0${index}.000Z`,
      });
    }
    const page = repo.list("sess-1", 2, "m4");
    assert.deepEqual(page.map((item) => item.messageId), ["m2", "m3"]);
  });
});
