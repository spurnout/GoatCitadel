import type { DatabaseSync } from "node:sqlite";
import type { ChatAttachmentRecord } from "@goatcitadel/contracts";

interface ChatAttachmentRow {
  attachment_id: string;
  session_id: string;
  project_id: string | null;
  file_name: string;
  mime_type: string;
  media_type: "text" | "image" | "audio" | "video" | "binary" | null;
  size_bytes: number;
  sha256: string;
  storage_rel_path: string;
  extract_status: "ready" | "unsupported" | "failed";
  extract_preview: string | null;
  thumbnail_rel_path: string | null;
  ocr_text: string | null;
  transcript_text: string | null;
  analysis_status: "queued" | "running" | "pending" | "ready" | "failed" | "unsupported" | null;
  created_at: string;
}

export interface ChatAttachmentInsertInput {
  attachmentId: string;
  sessionId: string;
  projectId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageRelPath: string;
  extractStatus: "ready" | "unsupported" | "failed";
  extractPreview?: string;
  mediaType?: "text" | "image" | "audio" | "video" | "binary";
  thumbnailRelPath?: string;
  ocrText?: string;
  transcriptText?: string;
  analysisStatus?: "queued" | "running" | "pending" | "ready" | "failed" | "unsupported";
}

export class ChatAttachmentRepository {
  private readonly getStmt;
  private readonly insertStmt;
  private readonly listBySessionStmt;
  private readonly listByIdsStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.getStmt = db.prepare("SELECT * FROM chat_attachments WHERE attachment_id = ?");
    this.insertStmt = db.prepare(`
      INSERT INTO chat_attachments (
        attachment_id, session_id, project_id, file_name, mime_type, size_bytes,
        sha256, storage_rel_path, extract_status, extract_preview, media_type,
        thumbnail_rel_path, ocr_text, transcript_text, analysis_status, created_at
      ) VALUES (
        @attachmentId, @sessionId, @projectId, @fileName, @mimeType, @sizeBytes,
        @sha256, @storageRelPath, @extractStatus, @extractPreview, @mediaType,
        @thumbnailRelPath, @ocrText, @transcriptText, @analysisStatus, @createdAt
      )
    `);
    this.listBySessionStmt = db.prepare(`
      SELECT * FROM chat_attachments
      WHERE session_id = @sessionId
      ORDER BY created_at DESC
      LIMIT @limit
    `);
    this.listByIdsStmt = db.prepare(`
      SELECT * FROM chat_attachments
      WHERE attachment_id IN (SELECT value FROM json_each(@idsJson))
    `);
  }

  public get(attachmentId: string): ChatAttachmentRecord {
    const row = this.getStmt.get(attachmentId) as ChatAttachmentRow | undefined;
    if (!row) {
      throw new Error(`Attachment ${attachmentId} not found`);
    }
    return mapRow(row);
  }

  public create(input: ChatAttachmentInsertInput, now = new Date().toISOString()): ChatAttachmentRecord {
    this.insertStmt.run({
      ...input,
      projectId: input.projectId ?? null,
      extractPreview: input.extractPreview ?? null,
      mediaType: input.mediaType ?? null,
      thumbnailRelPath: input.thumbnailRelPath ?? null,
      ocrText: input.ocrText ?? null,
      transcriptText: input.transcriptText ?? null,
      analysisStatus: input.analysisStatus ?? inferAnalysisStatus(input.extractStatus),
      createdAt: now,
    });
    return this.get(input.attachmentId);
  }

  public listBySession(sessionId: string, limit = 200): ChatAttachmentRecord[] {
    const rows = this.listBySessionStmt.all({
      sessionId,
      limit: Math.max(1, Math.min(2000, Math.floor(limit))),
    }) as unknown as ChatAttachmentRow[];
    return rows.map(mapRow);
  }

  public listByIds(ids: string[]): ChatAttachmentRecord[] {
    if (ids.length === 0) {
      return [];
    }
    const rows = this.listByIdsStmt.all({
      idsJson: JSON.stringify(ids),
    }) as unknown as ChatAttachmentRow[];
    return rows.map(mapRow);
  }
}

function mapRow(row: ChatAttachmentRow): ChatAttachmentRecord {
  return {
    attachmentId: row.attachment_id,
    sessionId: row.session_id,
    projectId: row.project_id ?? undefined,
    fileName: row.file_name,
    mimeType: row.mime_type,
    mediaType: row.media_type ?? undefined,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    storageRelPath: row.storage_rel_path,
    extractStatus: row.extract_status,
    extractPreview: row.extract_preview ?? undefined,
    thumbnailRelPath: row.thumbnail_rel_path ?? undefined,
    ocrText: row.ocr_text ?? undefined,
    transcriptText: row.transcript_text ?? undefined,
    analysisStatus: row.analysis_status ?? inferAnalysisStatus(row.extract_status),
    createdAt: row.created_at,
  };
}

function inferAnalysisStatus(
  extractStatus: "ready" | "unsupported" | "failed",
): "queued" | "running" | "pending" | "ready" | "failed" | "unsupported" {
  if (extractStatus === "ready") {
    return "ready";
  }
  if (extractStatus === "failed") {
    return "failed";
  }
  return "unsupported";
}
