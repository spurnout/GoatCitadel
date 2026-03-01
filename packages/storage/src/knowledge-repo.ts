import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface KnowledgeDocumentRecord {
  docId: string;
  namespace: string;
  sourceType: "file" | "url" | "text" | "memory";
  sourceRef: string;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeChunkRecord {
  chunkId: string;
  docId: string;
  seq: number;
  content: string;
  embedding?: number[];
  tokenEstimate: number;
  createdAt: string;
}

interface KnowledgeDocumentRow {
  doc_id: string;
  namespace: string;
  source_type: "file" | "url" | "text" | "memory";
  source_ref: string;
  title: string;
  metadata_json: string;
  created_at: string;
}

interface KnowledgeChunkRow {
  chunk_id: string;
  doc_id: string;
  seq: number;
  content: string;
  embedding_json: string | null;
  token_estimate: number;
  created_at: string;
}

export class KnowledgeRepository {
  private readonly insertDocumentStmt;
  private readonly insertChunkStmt;
  private readonly listChunksByNamespaceStmt;
  private readonly listChunksByDocStmt;
  private readonly listDocumentsStmt;
  private readonly updateChunkEmbeddingStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertDocumentStmt = db.prepare(`
      INSERT INTO knowledge_documents (
        doc_id, namespace, source_type, source_ref, title, metadata_json, created_at
      ) VALUES (
        @docId, @namespace, @sourceType, @sourceRef, @title, @metadataJson, @createdAt
      )
    `);
    this.insertChunkStmt = db.prepare(`
      INSERT INTO knowledge_chunks (
        chunk_id, doc_id, seq, content, embedding_json, token_estimate, created_at
      ) VALUES (
        @chunkId, @docId, @seq, @content, @embeddingJson, @tokenEstimate, @createdAt
      )
    `);
    this.listChunksByNamespaceStmt = db.prepare(`
      SELECT kc.*
      FROM knowledge_chunks kc
      INNER JOIN knowledge_documents kd ON kd.doc_id = kc.doc_id
      WHERE (@namespace IS NULL OR kd.namespace = @namespace)
      ORDER BY kc.created_at DESC, kc.seq ASC
      LIMIT @limit
    `);
    this.listChunksByDocStmt = db.prepare(`
      SELECT *
      FROM knowledge_chunks
      WHERE doc_id = @docId
      ORDER BY seq ASC
      LIMIT @limit
    `);
    this.listDocumentsStmt = db.prepare(`
      SELECT *
      FROM knowledge_documents
      WHERE (@namespace IS NULL OR namespace = @namespace)
      ORDER BY created_at DESC
      LIMIT @limit
    `);
    this.updateChunkEmbeddingStmt = db.prepare(`
      UPDATE knowledge_chunks
      SET embedding_json = @embeddingJson
      WHERE chunk_id = @chunkId
    `);
  }

  public createDocument(input: {
    namespace: string;
    sourceType: "file" | "url" | "text" | "memory";
    sourceRef: string;
    title: string;
    metadata?: Record<string, unknown>;
  }, now = new Date().toISOString()): KnowledgeDocumentRecord {
    const docId = randomUUID();
    this.insertDocumentStmt.run({
      docId,
      namespace: input.namespace,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      title: input.title,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      createdAt: now,
    });
    return {
      docId,
      namespace: input.namespace,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      title: input.title,
      metadata: input.metadata ?? {},
      createdAt: now,
    };
  }

  public appendChunks(
    docId: string,
    chunks: Array<{ content: string; embedding?: number[]; tokenEstimate?: number }>,
    now = new Date().toISOString(),
  ): KnowledgeChunkRecord[] {
    const out: KnowledgeChunkRecord[] = [];
    chunks.forEach((chunk, index) => {
      const chunkId = randomUUID();
      const tokenEstimate = chunk.tokenEstimate ?? estimateTokens(chunk.content);
      this.insertChunkStmt.run({
        chunkId,
        docId,
        seq: index,
        content: chunk.content,
        embeddingJson: chunk.embedding ? JSON.stringify(chunk.embedding) : null,
        tokenEstimate,
        createdAt: now,
      });
      out.push({
        chunkId,
        docId,
        seq: index,
        content: chunk.content,
        embedding: chunk.embedding,
        tokenEstimate,
        createdAt: now,
      });
    });
    return out;
  }

  public listDocuments(namespace?: string, limit = 100): KnowledgeDocumentRecord[] {
    const rows = this.listDocumentsStmt.all({
      namespace: namespace ?? null,
      limit,
    }) as unknown as KnowledgeDocumentRow[];
    return rows.map((row) => ({
      docId: row.doc_id,
      namespace: row.namespace,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      title: row.title,
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }

  public listChunksByNamespace(namespace?: string, limit = 500): KnowledgeChunkRecord[] {
    const rows = this.listChunksByNamespaceStmt.all({
      namespace: namespace ?? null,
      limit,
    }) as unknown as KnowledgeChunkRow[];
    return rows.map(mapChunkRow);
  }

  public listChunksByDocument(docId: string, limit = 500): KnowledgeChunkRecord[] {
    const rows = this.listChunksByDocStmt.all({
      docId,
      limit,
    }) as unknown as KnowledgeChunkRow[];
    return rows.map(mapChunkRow);
  }

  public updateChunkEmbedding(chunkId: string, embedding: number[]): void {
    this.updateChunkEmbeddingStmt.run({
      chunkId,
      embeddingJson: JSON.stringify(embedding),
    });
  }
}

function mapChunkRow(row: KnowledgeChunkRow): KnowledgeChunkRecord {
  return {
    chunkId: row.chunk_id,
    docId: row.doc_id,
    seq: row.seq,
    content: row.content,
    embedding: row.embedding_json ? JSON.parse(row.embedding_json) as number[] : undefined,
    tokenEstimate: row.token_estimate,
    createdAt: row.created_at,
  };
}

function estimateTokens(text: string): number {
  const chars = text.length;
  if (chars === 0) {
    return 0;
  }
  return Math.ceil(chars / 4);
}
