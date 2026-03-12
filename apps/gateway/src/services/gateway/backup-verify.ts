import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type {
  BackupManifestFileRecord,
  BackupManifestRecord,
  BackupVerifyIssue,
  BackupVerifyResponse,
} from "@goatcitadel/contracts";

export async function verifyBackupAtPath(backupPath: string): Promise<BackupVerifyResponse> {
  const resolvedBackupPath = path.resolve(backupPath);
  const issues: BackupVerifyIssue[] = [];
  const manifestPath = path.join(resolvedBackupPath, "manifest.json");
  const payloadDir = path.join(resolvedBackupPath, "payload");

  let manifest: BackupManifestRecord | undefined;
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    manifest = parseBackupManifest(raw, issues);
  } catch (error) {
    issues.push({
      code: "manifest_missing",
      message: `Backup manifest is missing or unreadable: ${(error as Error).message}`,
      path: "manifest.json",
    });
  }

  const payloadFiles = await collectPayloadFiles(payloadDir, issues);
  let filesVerified = 0;

  if (manifest) {
    const seenPaths = new Set<string>();
    for (const file of manifest.files) {
      const normalizedPath = normalizeBackupRelativePath(file.path);
      if (!normalizedPath) {
        issues.push({
          code: "manifest_invalid_path",
          message: `Manifest file path is invalid: ${file.path}`,
          path: file.path,
        });
        continue;
      }
      if (seenPaths.has(normalizedPath)) {
        issues.push({
          code: "manifest_duplicate_path",
          message: `Manifest contains duplicate file path: ${normalizedPath}`,
          path: normalizedPath,
        });
        continue;
      }
      seenPaths.add(normalizedPath);

      const fullPath = path.join(payloadDir, normalizedPath);
      ensurePathWithinRoot(fullPath, payloadDir);
      if (!payloadFiles.has(normalizedPath)) {
        issues.push({
          code: "payload_missing_file",
          message: `Payload file is missing: ${normalizedPath}`,
          path: normalizedPath,
        });
        continue;
      }

      const bytes = await fs.readFile(fullPath);
      if (bytes.length !== file.sizeBytes) {
        issues.push({
          code: "payload_size_mismatch",
          message: `Payload file size does not match manifest for ${normalizedPath}.`,
          path: normalizedPath,
        });
        continue;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== file.sha256) {
        issues.push({
          code: "payload_sha256_mismatch",
          message: `Payload file checksum does not match manifest for ${normalizedPath}.`,
          path: normalizedPath,
        });
        continue;
      }
      filesVerified += 1;
      payloadFiles.delete(normalizedPath);
    }

    for (const extraPath of payloadFiles.keys()) {
      issues.push({
        code: "payload_untracked_file",
        message: `Payload contains a file not declared in the manifest: ${extraPath}`,
        path: extraPath,
      });
    }
  }

  return {
    backupPath: resolvedBackupPath,
    backupId: manifest?.backupId,
    verified: issues.length === 0,
    filesVerified,
    issues,
    manifest,
  };
}

function parseBackupManifest(raw: string, issues: BackupVerifyIssue[]): BackupManifestRecord | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    issues.push({
      code: "manifest_invalid_json",
      message: `Backup manifest is not valid JSON: ${(error as Error).message}`,
      path: "manifest.json",
    });
    return undefined;
  }

  if (!parsed || typeof parsed !== "object") {
    issues.push({
      code: "manifest_invalid_shape",
      message: "Backup manifest must be a JSON object.",
      path: "manifest.json",
    });
    return undefined;
  }

  const record = parsed as Partial<BackupManifestRecord>;
  if (
    typeof record.backupId !== "string"
    || typeof record.createdAt !== "string"
    || typeof record.appVersion !== "string"
    || typeof record.rootDir !== "string"
    || !Array.isArray(record.files)
  ) {
    issues.push({
      code: "manifest_invalid_shape",
      message: "Backup manifest is missing required fields.",
      path: "manifest.json",
    });
    return undefined;
  }

  const files: BackupManifestFileRecord[] = [];
  for (const entry of record.files) {
    if (
      !entry
      || typeof entry !== "object"
      || typeof (entry as Partial<BackupManifestFileRecord>).path !== "string"
      || typeof (entry as Partial<BackupManifestFileRecord>).sizeBytes !== "number"
      || !Number.isFinite((entry as Partial<BackupManifestFileRecord>).sizeBytes)
      || typeof (entry as Partial<BackupManifestFileRecord>).sha256 !== "string"
    ) {
      issues.push({
        code: "manifest_invalid_file_record",
        message: "Backup manifest contains an invalid file record.",
        path: "manifest.json",
      });
      continue;
    }
    files.push({
      path: (entry as BackupManifestFileRecord).path,
      sizeBytes: Math.max(0, Math.floor((entry as BackupManifestFileRecord).sizeBytes)),
      sha256: (entry as BackupManifestFileRecord).sha256,
    });
  }

  return {
    backupId: record.backupId,
    createdAt: record.createdAt,
    appVersion: record.appVersion,
    gitRef: typeof record.gitRef === "string" ? record.gitRef : undefined,
    rootDir: record.rootDir,
    files,
  };
}

async function collectPayloadFiles(
  payloadDir: string,
  issues: BackupVerifyIssue[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  try {
    await fs.access(payloadDir);
  } catch (error) {
    issues.push({
      code: "payload_missing",
      message: `Backup payload directory is missing or unreadable: ${(error as Error).message}`,
      path: "payload",
    });
    return files;
  }

  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = path.relative(payloadDir, fullPath).replaceAll("\\", "/");
      const normalizedPath = normalizeBackupRelativePath(relativePath);
      if (!normalizedPath) {
        issues.push({
          code: "payload_invalid_path",
          message: `Payload contains an invalid file path: ${relativePath}`,
          path: relativePath,
        });
        continue;
      }
      ensurePathWithinRoot(fullPath, payloadDir);
      files.set(normalizedPath, fullPath);
    }
  };

  await walk(payloadDir);
  return files;
}

function normalizeBackupRelativePath(input: string): string | undefined {
  const normalized = input.replaceAll("\\", "/").trim();
  if (!normalized || normalized.startsWith("/")) {
    return undefined;
  }
  if (path.isAbsolute(normalized)) {
    return undefined;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return undefined;
  }
  return segments.join("/");
}

function ensurePathWithinRoot(targetPath: string, rootDir: string): void {
  const relative = path.relative(rootDir, targetPath);
  if (
    relative === ""
    || (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    return;
  }
  throw new Error(`Path escapes allowed root: ${targetPath}`);
}
