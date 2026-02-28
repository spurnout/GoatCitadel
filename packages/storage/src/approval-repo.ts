import type {
  ApprovalCreateInput,
  ApprovalExplanation,
  ApprovalExplanationStatus,
  ApprovalRequest,
  ApprovalResolveInput,
} from "@personal-ai/contracts";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

interface ApprovalRow {
  approval_id: string;
  kind: string;
  risk_level: ApprovalRequest["riskLevel"];
  status: ApprovalRequest["status"];
  payload_json: string;
  preview_json: string;
  explanation_status: ApprovalExplanationStatus;
  explanation_json: string | null;
  explanation_error: string | null;
  explanation_updated_at: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export class ApprovalRepository {
  private readonly createStmt;
  private readonly listStmt;
  private readonly getStmt;
  private readonly resolveStmt;
  private readonly markExplanationPendingStmt;
  private readonly setExplanationStmt;
  private readonly setExplanationFailedStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.createStmt = db.prepare(`
      INSERT INTO approvals (
        approval_id, kind, risk_level, status, payload_json, preview_json,
        explanation_status, created_at
      ) VALUES (
        @approvalId, @kind, @riskLevel, @status, @payloadJson, @previewJson,
        @explanationStatus, @createdAt
      )
    `);
    this.listStmt = db.prepare("SELECT * FROM approvals WHERE (@status IS NULL OR status = @status) ORDER BY created_at DESC LIMIT @limit");
    this.getStmt = db.prepare("SELECT * FROM approvals WHERE approval_id = ?");
    this.resolveStmt = db.prepare(`
      UPDATE approvals SET
        status = @status,
        payload_json = @payloadJson,
        resolved_at = @resolvedAt,
        resolved_by = @resolvedBy,
        resolution_note = @resolutionNote
      WHERE approval_id = @approvalId
    `);
    this.markExplanationPendingStmt = db.prepare(`
      UPDATE approvals SET
        explanation_status = 'pending',
        explanation_error = NULL,
        explanation_updated_at = @updatedAt
      WHERE approval_id = @approvalId
        AND explanation_status = 'not_requested'
    `);
    this.setExplanationStmt = db.prepare(`
      UPDATE approvals SET
        explanation_status = 'completed',
        explanation_json = @explanationJson,
        explanation_error = NULL,
        explanation_updated_at = @updatedAt
      WHERE approval_id = @approvalId
    `);
    this.setExplanationFailedStmt = db.prepare(`
      UPDATE approvals SET
        explanation_status = 'failed',
        explanation_error = @explanationError,
        explanation_updated_at = @updatedAt
      WHERE approval_id = @approvalId
    `);
  }

  public create(input: ApprovalCreateInput): ApprovalRequest {
    const now = new Date().toISOString();
    const approvalId = randomUUID();
    this.createStmt.run({
      approvalId,
      kind: input.kind,
      riskLevel: input.riskLevel,
      status: "pending",
      payloadJson: JSON.stringify(input.payload),
      previewJson: JSON.stringify(input.preview),
      explanationStatus: "not_requested",
      createdAt: now,
    });

    return this.get(approvalId);
  }

  public get(approvalId: string): ApprovalRequest {
    const row = this.getStmt.get(approvalId) as ApprovalRow | undefined;
    if (!row) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    return mapRow(row);
  }

  public list(status?: ApprovalRequest["status"], limit = 100): ApprovalRequest[] {
    const rows = this.listStmt.all({ status: status ?? null, limit }) as unknown as ApprovalRow[];
    return rows.map(mapRow);
  }

  public resolve(approvalId: string, input: ApprovalResolveInput): ApprovalRequest {
    const current = this.get(approvalId);
    if (current.status !== "pending") {
      throw new Error(`Approval ${approvalId} is already resolved`);
    }

    const status: ApprovalRequest["status"] =
      input.decision === "approve"
        ? "approved"
        : input.decision === "reject"
          ? "rejected"
          : "edited";

    this.resolveStmt.run({
      approvalId,
      status,
      payloadJson: JSON.stringify(input.editedPayload ?? current.payload),
      resolvedAt: new Date().toISOString(),
      resolvedBy: input.resolvedBy,
      resolutionNote: input.resolutionNote ?? null,
    });

    return this.get(approvalId);
  }

  public markExplanationPending(approvalId: string): boolean {
    const changed = this.markExplanationPendingStmt.run({
      approvalId,
      updatedAt: new Date().toISOString(),
    }).changes;

    return changed > 0;
  }

  public setExplanation(approvalId: string, explanation: ApprovalExplanation): ApprovalRequest {
    this.setExplanationStmt.run({
      approvalId,
      explanationJson: JSON.stringify(explanation),
      updatedAt: new Date().toISOString(),
    });
    return this.get(approvalId);
  }

  public setExplanationFailed(approvalId: string, explanationError: string): ApprovalRequest {
    this.setExplanationFailedStmt.run({
      approvalId,
      explanationError,
      updatedAt: new Date().toISOString(),
    });
    return this.get(approvalId);
  }
}

function mapRow(row: ApprovalRow): ApprovalRequest {
  const explanation = row.explanation_json
    ? (JSON.parse(row.explanation_json) as ApprovalExplanation)
    : undefined;

  return {
    approvalId: row.approval_id,
    kind: row.kind,
    riskLevel: row.risk_level,
    status: row.status,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    preview: JSON.parse(row.preview_json) as Record<string, unknown>,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolutionNote: row.resolution_note ?? undefined,
    explanationStatus: row.explanation_status,
    explanation,
    explanationError: row.explanation_error ?? undefined,
  };
}
