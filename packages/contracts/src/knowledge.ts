export interface MemoryWriteInput {
  namespace: string;
  title: string;
  content: string;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface MemorySearchQuery {
  namespace?: string;
  query: string;
  limit?: number;
  filters?: Record<string, unknown>;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface DocsIngestInput {
  sourceType: "file" | "url" | "text";
  source: string;
  namespace: string;
  title?: string;
  chunking?: {
    targetChars?: number;
    overlapChars?: number;
    maxChunks?: number;
  };
  metadata?: Record<string, unknown>;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface EmbeddingIndexInput {
  namespace?: string;
  documentId?: string;
  force?: boolean;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface EmbeddingQueryInput {
  namespace?: string;
  query: string;
  limit?: number;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}
