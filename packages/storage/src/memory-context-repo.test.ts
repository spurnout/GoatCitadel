import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { MemoryContextRepository } from "./memory-context-repo.js";

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

function createRepo(): MemoryContextRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-memory-context-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new MemoryContextRepository(db);
}

describe("MemoryContextRepository", () => {
  it("upserts and retrieves fresh cache entries", () => {
    const repo = createRepo();
    const inserted = repo.upsert({
      cacheKey: "cache-1",
      scope: "chat",
      sessionId: "session-1",
      queryHash: "q",
      sourcesHash: "s",
      contextText: "distilled context",
      citations: [
        {
          candidateId: "t:e1",
          sourceType: "transcript",
          sourceRef: "e1",
          score: 0.9,
        },
      ],
      quality: {
        status: "generated",
      },
      originalTokenEstimate: 100,
      distilledTokenEstimate: 40,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const fetched = repo.findFreshByCacheKey("cache-1", "2026-01-01T00:00:00.000Z");
    assert.ok(fetched);
    assert.equal(fetched.contextId, inserted.contextId);
    assert.equal(fetched.citations.length, 1);
    assert.equal(repo.get(inserted.contextId).contextText, "distilled context");
  });
});
