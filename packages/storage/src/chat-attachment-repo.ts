import type { DatabaseSync } from "node:sqlite";
import type { ChatAttachmentRecord } from "@goatcitadel/contracts";

interface ChatAttachmentRow {
  attachment_id: string;
  session_id: string;
  project_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_rel_path: string;
  extract_status: "ready" | "unsupported" | "failed";
  extract_preview: string | null;
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
        sha256, storage_rel_path, extract_status, extract_preview, created_at
      ) VALUES (
        @attachmentId, @sessionId, @projectId, @fileName, @mimeType, @sizeBytes,
        @sha256, @storageRelPath, @extractStatus, @extractPreview, @createdAt
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
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    storageRelPath: row.storage_rel_path,
    extractStatus: row.extract_status,
    extractPreview: row.extract_preview ?? undefined,
    createdAt: row.created_at,
  };
}
