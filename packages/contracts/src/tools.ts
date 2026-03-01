export type ToolRiskLevel = "safe" | "caution" | "danger" | "nuclear";

export type ToolCategory =
  | "session"
  | "memory"
  | "fs"
  | "http"
  | "shell"
  | "git"
  | "research"
  | "comms"
  | "knowledge"
  | "ops";

export type ToolPack = "core" | "devops" | "knowledge" | "comms";

export interface ToolInvokeConsentContext {
  operatorId?: string;
  source?: "ui" | "tui" | "agent";
  reason?: string;
}
