export type ChatProjectLifecycleStatus = "active" | "archived";
export type ChatSessionScope = "mission" | "external";
export type ChatSessionLifecycleStatus = "active" | "archived";
export type ChatBindingTransport = "llm" | "integration";
export type ChatMessageRole = "user" | "assistant" | "system";
export type ChatAttachmentMediaType = "text" | "image" | "audio" | "video" | "binary";

export type ChatInputPart =
  | {
    type: "text";
    text: string;
  }
  | {
    type: "image_ref";
    attachmentId: string;
    mimeType?: string;
    detail?: "low" | "high" | "auto";
  }
  | {
    type: "audio_ref";
    attachmentId: string;
    mimeType?: string;
  }
  | {
    type: "video_ref";
    attachmentId: string;
    mimeType?: string;
  }
  | {
    type: "file_ref";
    attachmentId: string;
    mimeType?: string;
  };

export interface ChatProjectRecord {
  projectId: string;
  name: string;
  description?: string;
  workspacePath: string;
  color?: string;
  lifecycleStatus: ChatProjectLifecycleStatus;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionRecord {
  sessionId: string;
  sessionKey: string;
  scope: ChatSessionScope;
  title?: string;
  pinned: boolean;
  lifecycleStatus: ChatSessionLifecycleStatus;
  archivedAt?: string;
  projectId?: string;
  projectName?: string;
  channel: string;
  account: string;
  updatedAt: string;
  lastActivityAt: string;
  tokenTotal: number;
  costUsdTotal: number;
}

export interface ChatSessionBindingRecord {
  sessionId: string;
  transport: ChatBindingTransport;
  connectionId?: string;
  target?: string;
  writable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachmentRecord {
  attachmentId: string;
  sessionId: string;
  projectId?: string;
  fileName: string;
  mimeType: string;
  mediaType?: ChatAttachmentMediaType;
  sizeBytes: number;
  sha256: string;
  storageRelPath: string;
  extractStatus: "ready" | "unsupported" | "failed";
  extractPreview?: string;
  thumbnailRelPath?: string;
  ocrText?: string;
  transcriptText?: string;
  analysisStatus?: "queued" | "running" | "pending" | "ready" | "failed" | "unsupported";
  createdAt: string;
}

export interface ChatMessageRecord {
  messageId: string;
  sessionId: string;
  role: ChatMessageRole;
  actorType: "user" | "agent" | "system";
  actorId: string;
  content: string;
  timestamp: string;
  tokenInput?: number;
  tokenOutput?: number;
  costUsd?: number;
  attachments?: Array<{
    attachmentId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

export interface ChatSendMessageRequest {
  content: string;
  parts?: ChatInputPart[];
  providerId?: string;
  model?: string;
  useMemory?: boolean;
  attachments?: string[];
}

export interface ChatSendMessageResponse {
  sessionId: string;
  userMessage: ChatMessageRecord;
  assistantMessage?: ChatMessageRecord;
  transport: ChatBindingTransport;
  model?: string;
}

export interface ChatStreamChunk {
  type: "message_start" | "delta" | "usage" | "message_done" | "error" | "done";
  sessionId: string;
  messageId?: string;
  delta?: string;
  content?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    costUsd?: number;
  };
  error?: string;
}
