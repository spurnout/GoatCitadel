import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { WorkspaceRepository } from "./workspace-repo.js";

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

function createRepo(): WorkspaceRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-workspaces-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new WorkspaceRepository(db);
}

describe("WorkspaceRepository", () => {
  it("creates, updates, archives, and restores workspaces", () => {
    const repo = createRepo();

    const created = repo.create({
      name: "Launch Bay",
      description: "Release staging",
      workspacePrefs: {
        preferredModel: "glm-5",
      },
    }, "2026-03-05T10:00:00.000Z");

    assert.equal(created.slug, "launch-bay");
    assert.equal(repo.findBySlug("Launch Bay")?.workspaceId, created.workspaceId);

    const updated = repo.update(created.workspaceId, {
      name: "Launch Bay 2",
      slug: "launch-bay-two",
    }, "2026-03-05T10:05:00.000Z");
    assert.equal(updated.slug, "launch-bay-two");

    const archived = repo.archive(created.workspaceId, "2026-03-05T10:10:00.000Z");
    assert.equal(archived.lifecycleStatus, "archived");

    const restored = repo.restore(created.workspaceId, "2026-03-05T10:15:00.000Z");
    assert.equal(restored.lifecycleStatus, "active");
  });

  it("rejects duplicate slugs and protects the default workspace", () => {
    const repo = createRepo();

    const existing = repo.create({
      name: "Same Name",
    }, "2026-03-05T10:00:00.000Z");

    assert.throws(() => {
      repo.create({
        name: "same-name",
      });
    }, /already in use/);

    const db = (repo as unknown as { db: ReturnType<typeof createDatabase> }).db;
    db.prepare(`
      INSERT OR IGNORE INTO workspaces (
        workspace_id, name, description, slug, lifecycle_status, archived_at, workspace_prefs_json, created_at, updated_at
      ) VALUES ('default', 'Default', NULL, 'default', 'active', NULL, '{}', @createdAt, @updatedAt)
    `).run({
      createdAt: "2026-03-05T00:00:00.000Z",
      updatedAt: "2026-03-05T00:00:00.000Z",
    });

    assert.throws(() => {
      repo.archive("default");
    }, /default workspace cannot be archived/);
    assert.equal(repo.get(existing.workspaceId).workspaceId, existing.workspaceId);
  });
});
