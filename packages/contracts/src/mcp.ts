export type McpTransport = "stdio" | "http" | "sse";
export type McpServerStatus = "disconnected" | "connecting" | "connected" | "error";

export interface McpServerRecord {
  serverId: string;
  label: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  authType: "none" | "token" | "oauth2";
  enabled: boolean;
  status: McpServerStatus;
  lastError?: string;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpToolRecord {
  serverId: string;
  toolName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
  updatedAt: string;
}

export interface McpServerCreateInput {
  label: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  authType?: "none" | "token" | "oauth2";
  enabled?: boolean;
}

export interface McpServerUpdateInput {
  label?: string;
  command?: string;
  args?: string[];
  url?: string;
  authType?: "none" | "token" | "oauth2";
  enabled?: boolean;
}

export interface McpOAuthStartResponse {
  authorizeUrl: string;
  state: string;
}

export interface McpInvokeRequest {
  serverId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  sessionId?: string;
  taskId?: string;
}

export interface McpInvokeResponse {
  ok: boolean;
  output?: Record<string, unknown>;
  error?: string;
}
