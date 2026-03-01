import type { IntegrationFormSchema } from "./ui-forms.js";

export type AuthMode = "none" | "token" | "basic";

export interface AuthRuntimeSettings {
  mode: AuthMode;
  allowLoopbackBypass: boolean;
  tokenConfigured: boolean;
  basicConfigured: boolean;
}

export interface AuthSettingsUpdateInput {
  mode?: AuthMode;
  allowLoopbackBypass?: boolean;
  token?: string;
  basicUsername?: string;
  basicPassword?: string;
}

export type IntegrationKind =
  | "channel"
  | "model_provider"
  | "productivity"
  | "automation"
  | "platform";

export type IntegrationMaturity = "native" | "plugin" | "disabled" | "beta" | "planned";
export type IntegrationConnectionStatus = "connected" | "disconnected" | "error" | "paused";

export interface IntegrationCatalogEntry {
  catalogId: string;
  kind: IntegrationKind;
  key: string;
  label: string;
  description: string;
  maturity: IntegrationMaturity;
  authMethods: string[];
  capabilities: string[];
  docsUrl?: string;
  formSchema?: IntegrationFormSchema;
  pluginId?: string;
}

export interface IntegrationConnection {
  connectionId: string;
  catalogId: string;
  kind: IntegrationKind;
  key: string;
  label: string;
  enabled: boolean;
  status: IntegrationConnectionStatus;
  config: Record<string, unknown>;
  pluginId?: string;
  pluginVersion?: string;
  pluginEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  lastError?: string;
}

export interface IntegrationConnectionCreateInput {
  catalogId: string;
  label?: string;
  enabled?: boolean;
  status?: IntegrationConnectionStatus;
  config?: Record<string, unknown>;
  pluginId?: string;
  pluginVersion?: string;
  pluginEnabled?: boolean;
}

export interface IntegrationConnectionUpdateInput {
  label?: string;
  enabled?: boolean;
  status?: IntegrationConnectionStatus;
  config?: Record<string, unknown>;
  pluginId?: string;
  pluginVersion?: string;
  pluginEnabled?: boolean;
  lastSyncAt?: string;
  lastError?: string;
}

export interface ChannelInboundMessageInput {
  eventId?: string;
  account: string;
  peer?: string;
  room?: string;
  threadId?: string;
  actorId: string;
  actorType?: "user" | "agent" | "system";
  role?: "user" | "assistant";
  content: string;
  displayName?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    costUsd?: number;
  };
  metadata?: Record<string, unknown>;
}
