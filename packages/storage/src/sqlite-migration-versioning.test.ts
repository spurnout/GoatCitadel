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
      // ignore
    }
  }
});

describe("sqlite schema migrations", () => {
  it("records applied migration versions", () => {
    const dbPath = path.join(os.tmpdir(), `goatcitadel-migrations-${randomUUID()}.db`);
    createdFiles.push(dbPath);
    const db = createDatabase({ dbPath });

    const rows = db
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version ASC")
      .all() as Array<{ version: number; name: string }>;

    assert.equal(rows.length >= 4, true);
    assert.equal(rows[0]?.version, 1);
    assert.equal(rows[rows.length - 1]?.version, rows.length);
    db.close();
  });

  it("creates hot-path chat projection and index migrations", () => {
    const dbPath = path.join(os.tmpdir(), `goatcitadel-migrations-hot-path-${randomUUID()}.db`);
    createdFiles.push(dbPath);
    const db = createDatabase({ dbPath });

    const chatMessagesColumns = db
      .prepare("PRAGMA table_info(chat_messages)")
      .all() as Array<{ name: string }>;
    assert.ok(chatMessagesColumns.some((column) => column.name === "message_id"));

    const approvalsIndexes = db
      .prepare("PRAGMA index_list(approvals)")
      .all() as Array<{ name: string }>;
    assert.ok(approvalsIndexes.some((index) => index.name === "idx_approvals_status_created"));

    const toolInvocationIndexes = db
      .prepare("PRAGMA index_list(tool_invocations)")
      .all() as Array<{ name: string }>;
    assert.ok(toolInvocationIndexes.some((index) => index.name === "idx_tool_invocations_session_time"));

    const policyBlockIndexes = db
      .prepare("PRAGMA index_list(policy_blocks)")
      .all() as Array<{ name: string }>;
    assert.ok(policyBlockIndexes.some((index) => index.name === "idx_policy_blocks_session_time"));

    db.close();
  });
});
