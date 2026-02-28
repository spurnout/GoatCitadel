import type { ApprovalCreateInput, ApprovalRequest } from "@personal-ai/contracts";
import type { Storage } from "@personal-ai/storage";

export class ApprovalGate {
  public constructor(private readonly storage: Storage) {}

  public async create(input: ApprovalCreateInput): Promise<ApprovalRequest> {
    const approval = this.storage.approvals.create(input);
    await this.storage.audit.append("approvals", {
      event: "approval.create",
      approvalId: approval.approvalId,
      kind: approval.kind,
      riskLevel: approval.riskLevel,
      status: approval.status,
    });
    return approval;
  }
}