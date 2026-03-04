export type DoctorStatus = "ok" | "warn" | "fail" | "fixed" | "skipped";
export type DoctorSeverity = "info" | "warning" | "error";

export interface DoctorCheckResult {
  id: string;
  group: string;
  title: string;
  status: DoctorStatus;
  severity: DoctorSeverity;
  detail: string;
  repairable: boolean;
  repairAction?: string;
}

export interface DoctorRepairResult {
  checkId: string;
  applied: boolean;
  skipped: boolean;
  guarded?: boolean;
  reason?: string;
  changes?: string[];
}

export interface DoctorSummary {
  totalChecks: number;
  ok: number;
  warn: number;
  fail: number;
  fixed: number;
  skipped: number;
  unresolvedWarnings: number;
  hardFailures: number;
  repairedCount: number;
  exitCode: number;
}

export interface DoctorReport {
  startedAt: string;
  finishedAt: string;
  rootDir: string;
  gatewayBaseUrl: string;
  profileName?: string;
  profilePath?: string;
  options: {
    deep: boolean;
    repairEnabled: boolean;
    autoRepair: boolean;
    readOnly: boolean;
  };
  checks: DoctorCheckResult[];
  repairs: DoctorRepairResult[];
  summary: DoctorSummary;
}

export interface DoctorRunOptions {
  rootDir?: string;
  gatewayBaseUrl?: string;
  profileName?: string;
  profilePath?: string;
  deep?: boolean;
  auditOnly?: boolean;
  noRepair?: boolean;
  yes?: boolean;
  readOnly?: boolean;
  authToken?: string;
  tokenQueryParam?: string;
  authMode?: "none" | "token" | "basic";
  promptConfirm?: (message: string) => Promise<boolean>;
}

