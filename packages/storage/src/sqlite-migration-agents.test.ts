import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}-wal`, { force: true });
      fs.rmSync(`${file}-shm`, { force: true });
    } catch {
      // ignore cleanup failures
    }
  }
});

describe("sqlite agent profile migration", () => {
  it("creates agent_profiles table and required columns", () => {
    const dbPath = path.join(os.tmpdir(), `goatcitadel-agents-migration-${randomUUID()}.db`);
    createdFiles.push(dbPath);
    const db = createDatabase({ dbPath });

    const rows = db.prepare("PRAGMA table_info(agent_profiles)").all() as Array<{ name: string }>;
    const columns = new Set(rows.map((row) => row.name));

    assert.equal(columns.has("agent_id"), true);
    assert.equal(columns.has("role_id"), true);
    assert.equal(columns.has("name"), true);
    assert.equal(columns.has("lifecycle_status"), true);
    assert.equal(columns.has("specialties_json"), true);
    assert.equal(columns.has("default_tools_json"), true);
    assert.equal(columns.has("aliases_json"), true);
    db.close();
  });
});
