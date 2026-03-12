import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBackupAtPath } from "./backup-verify.js";

const TEMP_ROOTS: string[] = [];

afterEach(async () => {
  while (TEMP_ROOTS.length > 0) {
    const next = TEMP_ROOTS.pop();
    if (next) {
      await rm(next, { recursive: true, force: true });
    }
  }
});

describe("verifyBackupAtPath", () => {
  it("verifies a valid backup directory", async () => {
    const backupPath = await createBackupFixture("valid");
    const result = await verifyBackupAtPath(backupPath);
    expect(result.verified).toBe(true);
    expect(result.filesVerified).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it("flags missing and unexpected payload files", async () => {
    const backupPath = await createBackupFixture("extra-file");
    const result = await verifyBackupAtPath(backupPath);
    expect(result.verified).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("payload_untracked_file");
  });

  it("rejects manifest traversal paths", async () => {
    const backupPath = await createBackupFixture("traversal");
    const result = await verifyBackupAtPath(backupPath);
    expect(result.verified).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("manifest_invalid_path");
  });
});

async function createBackupFixture(mode: "valid" | "extra-file" | "traversal"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "goatcitadel-backup-verify-"));
  TEMP_ROOTS.push(root);
  const backupPath = path.join(root, "fixture.backup");
  const payloadDir = path.join(backupPath, "payload", "data");
  await mkdir(payloadDir, { recursive: true });

  const filePath = path.join(payloadDir, "session.json");
  const fileBytes = Buffer.from('{"ok":true}\n', "utf8");
  await writeFile(filePath, fileBytes);

  const manifest = {
    backupId: "fixture-1",
    createdAt: "2026-03-12T12:00:00.000Z",
    appVersion: "1.0.0",
    rootDir: "F:/code/personal-ai",
    files: [
      {
        path: mode === "traversal" ? "../outside.txt" : "data/session.json",
        sizeBytes: fileBytes.length,
        sha256: createHash("sha256").update(fileBytes).digest("hex"),
      },
    ],
  };

  if (mode === "extra-file") {
    await writeFile(path.join(backupPath, "payload", "unexpected.txt"), "hello\n", "utf8");
  }

  await writeFile(path.join(backupPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return backupPath;
}
