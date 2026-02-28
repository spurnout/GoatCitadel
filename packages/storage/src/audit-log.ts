import fs from "node:fs/promises";
import path from "node:path";

export type AuditStream = "tool_invocations" | "policy_blocks" | "approvals";

export class AuditLog {
  public constructor(private readonly auditDir: string) {}

  public async append(stream: AuditStream, payload: Record<string, unknown>): Promise<void> {
    const filePath = path.join(this.auditDir, `${stream}.jsonl`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + "\n";
    await fs.appendFile(filePath, line, { encoding: "utf8" });
  }
}