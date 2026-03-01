import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ToolRiskLevel } from "@goatcitadel/contracts";

export interface ToolAccessDecisionRecord {
  decisionId: string;
  timestamp: string;
  toolName: string;
  agentId: string;
  sessionId: string;
  taskId?: string;
  allowed: boolean;
  reasonCodes: string[];
  matchedGrantId?: string;
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
}

interface ToolAccessDecisionRow {
  decision_id: string;
  timestamp: string;
  tool_name: string;
  agent_id: string;
  session_id: string;
  task_id: string | null;
  allowed: number;
  reason_codes_json: string;
  matched_grant_id: string | null;
  requires_approval: number;
  risk_level: ToolRiskLevel;
}

export class ToolAccessDecisionRepository {
  private readonly insertStmt;
  private readonly countByToolSinceStmt;
  private readonly countWritesSinceStmt;

  public constructor(private readonly db: DatabaseSync) {
    this.insertStmt = db.prepare(`
      INSERT INTO tool_access_decisions (
        decision_id, timestamp, tool_name, agent_id, session_id, task_id,
        allowed, reason_codes_json, matched_grant_id, requires_approval, risk_level
      ) VALUES (
        @decisionId, @timestamp, @toolName, @agentId, @sessionId, @taskId,
        @allowed, @reasonCodesJson, @matchedGrantId, @requiresApproval, @riskLevel
      )
    `);
    this.countByToolSinceStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM tool_access_decisions
      WHERE tool_name = @toolName
        AND agent_id = @agentId
        AND session_id = @sessionId
        AND timestamp >= @since
    `);
    this.countWritesSinceStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM tool_access_decisions
      WHERE agent_id = @agentId
        AND session_id = @sessionId
        AND allowed = 1
        AND tool_name IN ('fs.write', 'fs.move', 'fs.delete', 'git.add', 'git.commit', 'git.branch.switch', 'git.worktree.create', 'git.worktree.remove', 'gmail.send', 'calendar.create_event')
        AND timestamp >= @since
    `);
  }

  public record(input: Omit<ToolAccessDecisionRecord, "decisionId" | "timestamp">, now = new Date().toISOString()): ToolAccessDecisionRecord {
    const decisionId = randomUUID();
    this.insertStmt.run({
      decisionId,
      timestamp: now,
      toolName: input.toolName,
      agentId: input.agentId,
      sessionId: input.sessionId,
      taskId: input.taskId ?? null,
      allowed: input.allowed ? 1 : 0,
      reasonCodesJson: JSON.stringify(input.reasonCodes),
      matchedGrantId: input.matchedGrantId ?? null,
      requiresApproval: input.requiresApproval ? 1 : 0,
      riskLevel: input.riskLevel,
    });
    return {
      decisionId,
      timestamp: now,
      ...input,
    };
  }

  public countToolCallsInLastHour(toolName: string, agentId: string, sessionId: string): number {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const row = this.countByToolSinceStmt.get({
      toolName,
      agentId,
      sessionId,
      since,
    }) as { count: number };
    return row.count;
  }

  public countWritesInLastHour(agentId: string, sessionId: string): number {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const row = this.countWritesSinceStmt.get({
      agentId,
      sessionId,
      since,
    }) as { count: number };
    return row.count;
  }
}

export function mapToolAccessDecisionRow(row: ToolAccessDecisionRow): ToolAccessDecisionRecord {
  return {
    decisionId: row.decision_id,
    timestamp: row.timestamp,
    toolName: row.tool_name,
    agentId: row.agent_id,
    sessionId: row.session_id,
    taskId: row.task_id ?? undefined,
    allowed: Boolean(row.allowed),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    matchedGrantId: row.matched_grant_id ?? undefined,
    requiresApproval: Boolean(row.requires_approval),
    riskLevel: row.risk_level,
  };
}
