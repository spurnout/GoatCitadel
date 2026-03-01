export interface BackupManifestFileRecord {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface BackupManifestRecord {
  backupId: string;
  createdAt: string;
  appVersion: string;
  gitRef?: string;
  rootDir: string;
  files: BackupManifestFileRecord[];
}

export interface BackupCreateResponse {
  backupId: string;
  outputPath: string;
  bytes: number;
  manifest: BackupManifestRecord;
}

export interface RetentionPolicy {
  realtimeEventsDays: number;
  backupsKeep: number;
  transcriptsDays?: number;
  auditDays?: number;
}

export interface RetentionPruneResult {
  applied: boolean;
  startedAt: string;
  finishedAt: string;
  removedRealtimeEvents: number;
  removedBackupFiles: number;
  removedTranscriptFiles: number;
  removedAuditFiles: number;
  reclaimedBytes: number;
}
