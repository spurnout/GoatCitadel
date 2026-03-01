export type LlmApiStyle = "openai-chat-completions";

export interface LlmProviderCapabilities {
  vision: boolean;
  audio: boolean;
  video: boolean;
  toolCalling: boolean;
  jsonMode: boolean;
}

export interface LlmProviderConfig {
  providerId: string;
  label: string;
  baseUrl: string;
  apiStyle: LlmApiStyle;
  defaultModel: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  capabilities?: Partial<LlmProviderCapabilities>;
}

export interface LlmConfigFile {
  activeProviderId: string;
  providers: LlmProviderConfig[];
}

export interface LlmProviderSummary {
  providerId: string;
  label: string;
  baseUrl: string;
  apiStyle: LlmApiStyle;
  defaultModel: string;
  hasApiKey: boolean;
  apiKeySource: "inline" | "env" | "keychain" | "none";
  hasKeychainSecret?: boolean;
  apiKeyRef?: string;
  capabilities?: LlmProviderCapabilities;
}

export interface LlmRuntimeConfig {
  activeProviderId: string;
  activeModel: string;
  providers: LlmProviderSummary[];
}

export interface LlmModelRecord {
  id: string;
  ownedBy?: string;
  created?: number;
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  providerId?: string;
  model?: string;
  messages: ChatCompletionMessage[];
  memory?: {
    enabled?: boolean;
    mode?: "qmd" | "off";
    sessionId?: string;
    taskId?: string;
    workspace?: string;
    maxContextTokens?: number;
    forceRefresh?: boolean;
  };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
  stop?: string | string[];
  response_format?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ChatCompletionResponseChoice {
  index: number;
  message?: Record<string, unknown>;
  finish_reason?: string | null;
}

export interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: ChatCompletionResponseChoice[];
  usage?: Record<string, unknown>;
  memoryContext?: {
    contextId: string;
    cacheHit: boolean;
    originalTokenEstimate: number;
    distilledTokenEstimate: number;
    savingsPercent: number;
    citationsCount: number;
  };
  [key: string]: unknown;
}
