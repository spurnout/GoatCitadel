export type DevDiagnosticsLevel = "debug" | "info" | "warn" | "error";

export type DevDiagnosticsCategory =
  | "ui"
  | "api"
  | "sse"
  | "refresh"
  | "chat"
  | "orchestration"
  | "gateway"
  | "tools"
  | "voice"
  | "addons"
  | "office";

export interface DevDiagnosticsEvent {
  id: string;
  timestamp: string;
  level: DevDiagnosticsLevel;
  category: DevDiagnosticsCategory | string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  sessionId?: string;
  chatId?: string;
  turnId?: string;
  route?: string;
  providerId?: string;
  modelId?: string;
  source: "client" | "gateway";
}

export interface DevDiagnosticsListResponse {
  items: DevDiagnosticsEvent[];
}
