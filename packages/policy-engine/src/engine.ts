import type { ToolInvokeRequest, ToolInvokeResult, ToolPolicyConfig } from "@personal-ai/contracts";
import type { Storage } from "@personal-ai/storage";
import { randomUUID } from "node:crypto";
import { ApprovalGate } from "./approval-gate.js";
import { resolveEffectivePolicy, isToolAllowed } from "./policy-resolver.js";
import { createDefaultToolRegistry, type ToolRegistry } from "./tool-registry.js";
import { assertWritePathInJail } from "./sandbox/path-jail.js";
import { assertHostAllowed } from "./sandbox/network-guard.js";
import { classifyShellRisk } from "./sandbox/shell-risk-gate.js";
import { executeTool } from "./tool-executor.js";

export class ToolPolicyEngine {
  private readonly approvals: ApprovalGate;

  public constructor(
    private readonly config: ToolPolicyConfig,
    private readonly storage: Storage,
    private readonly registry: ToolRegistry = createDefaultToolRegistry(),
  ) {
    this.approvals = new ApprovalGate(storage);
  }

  public async invoke(request: ToolInvokeRequest): Promise<ToolInvokeResult> {
    const auditEventId = randomUUID();
    const policy = resolveEffectivePolicy(this.config, request.agentId);

    if (!isToolAllowed(policy, request.toolName)) {
      const reason = `blocked: tool ${request.toolName} denied by policy`;
      await this.recordBlocked(auditEventId, request, reason, { policyProfile: policy.profile });
      return {
        outcome: "blocked",
        policyReason: reason,
        auditEventId,
      };
    }

    const toolDef = this.registry.get(request.toolName);
    if (!toolDef && !policy.effectiveTools.has("*")) {
      const reason = `blocked: unknown tool ${request.toolName}`;
      await this.recordBlocked(auditEventId, request, reason, {});
      return {
        outcome: "blocked",
        policyReason: reason,
        auditEventId,
      };
    }

    const maybeApproval = await this.evaluateSafetyGates(request, auditEventId);
    if (maybeApproval) {
      return maybeApproval;
    }

    return this.executeAllowedRequest(request, auditEventId, "allowed");
  }

  public async executeApprovedAction(approvalId: string): Promise<ToolInvokeResult | undefined> {
    const pending = this.storage.pendingApprovalActions.find(approvalId);
    if (!pending || pending.resolutionStatus !== "pending") {
      return undefined;
    }

    if (pending.actionType !== "tool.invoke") {
      this.storage.pendingApprovalActions.markResolved(approvalId, "failed", {
        error: `unsupported pending action type ${pending.actionType}`,
      });
      return undefined;
    }

    const request = asToolInvokeRequest(pending.request);
    const auditEventId = randomUUID();

    const policy = resolveEffectivePolicy(this.config, request.agentId);
    if (!isToolAllowed(policy, request.toolName)) {
      const reason = `blocked: tool ${request.toolName} denied by policy after approval`;
      await this.recordBlocked(auditEventId, request, reason, { policyProfile: policy.profile, approvalId });
      this.storage.pendingApprovalActions.markResolved(approvalId, "failed", { reason });
      this.storage.approvalEvents.append({
        approvalId,
        eventType: "approved_action_executed",
        actorId: "system",
        payload: { outcome: "blocked", reason, auditEventId },
      });
      return {
        outcome: "blocked",
        policyReason: reason,
        auditEventId,
      };
    }

    const result = await this.executeAllowedRequest(
      request,
      auditEventId,
      `allowed_via_approval:${approvalId}`,
    );

    this.storage.pendingApprovalActions.markResolved(
      approvalId,
      result.outcome === "executed" ? "executed" : "failed",
      {
        outcome: result.outcome,
        policyReason: result.policyReason,
        auditEventId,
        result: result.result,
      },
    );

    this.storage.approvalEvents.append({
      approvalId,
      eventType: "approved_action_executed",
      actorId: "system",
      payload: {
        toolName: request.toolName,
        outcome: result.outcome,
        policyReason: result.policyReason,
        auditEventId,
      },
    });

    return result;
  }

  private async evaluateSafetyGates(request: ToolInvokeRequest, auditEventId: string): Promise<ToolInvokeResult | undefined> {
    if (request.toolName === "fs.write") {
      const pathArg = String(request.args.path ?? "");
      try {
        assertWritePathInJail(pathArg, this.config.sandbox.writeJailRoots);
      } catch (error) {
        const reason = `blocked: ${(error as Error).message}`;
        await this.recordBlocked(auditEventId, request, reason, { path: pathArg });
        return {
          outcome: "blocked",
          policyReason: reason,
          auditEventId,
        };
      }

      const approval = await this.approvals.create({
        kind: "fs.write",
        riskLevel: "danger",
        payload: request.args,
        preview: { path: pathArg },
      });

      this.storage.pendingApprovalActions.upsertPending({
        approvalId: approval.approvalId,
        actionType: "tool.invoke",
        request: request as unknown as Record<string, unknown>,
      });

      this.storage.approvalEvents.append({
        approvalId: approval.approvalId,
        eventType: "pending_action_registered",
        actorId: request.agentId,
        payload: {
          actionType: "tool.invoke",
          toolName: request.toolName,
          sessionId: request.sessionId,
          taskId: request.taskId,
        },
      });

      await this.recordInvocation(auditEventId, request, "approval_required", "fs.write requires HITL", undefined, approval.approvalId);
      return {
        outcome: "approval_required",
        approvalId: approval.approvalId,
        policyReason: "fs.write requires approval",
        auditEventId,
      };
    }

    if (request.toolName.startsWith("http.")) {
      const target = String(request.args.url ?? request.args.host ?? "");
      try {
        assertHostAllowed(target, this.config.sandbox.networkAllowlist);
      } catch (error) {
        const reason = `blocked: ${(error as Error).message}`;
        await this.recordBlocked(auditEventId, request, reason, { target });
        return {
          outcome: "blocked",
          policyReason: reason,
          auditEventId,
        };
      }
    }

    if (request.toolName === "shell.exec") {
      const command = String(request.args.command ?? "");
      const risk = classifyShellRisk(command, this.config.sandbox.riskyShellPatterns);
      if (risk.risky && this.config.sandbox.requireApprovalForRiskyShell) {
        const approval = await this.approvals.create({
          kind: "shell.exec",
          riskLevel: "danger",
          payload: request.args,
          preview: { command, matchedPattern: risk.matchedPattern },
        });

        this.storage.pendingApprovalActions.upsertPending({
          approvalId: approval.approvalId,
          actionType: "tool.invoke",
          request: request as unknown as Record<string, unknown>,
        });

        this.storage.approvalEvents.append({
          approvalId: approval.approvalId,
          eventType: "pending_action_registered",
          actorId: request.agentId,
          payload: {
            actionType: "tool.invoke",
            toolName: request.toolName,
            sessionId: request.sessionId,
            taskId: request.taskId,
            matchedPattern: risk.matchedPattern,
          },
        });

        await this.recordInvocation(
          auditEventId,
          request,
          "approval_required",
          `risky shell command matched ${risk.matchedPattern}`,
          undefined,
          approval.approvalId,
        );

        return {
          outcome: "approval_required",
          approvalId: approval.approvalId,
          policyReason: `risky shell command matched ${risk.matchedPattern}`,
          auditEventId,
        };
      }
    }

    return undefined;
  }

  private async executeAllowedRequest(
    request: ToolInvokeRequest,
    auditEventId: string,
    policyReason: string,
  ): Promise<ToolInvokeResult> {
    try {
      const result = await executeTool(request, this.config);
      await this.recordInvocation(auditEventId, request, "executed", policyReason, result);
      return {
        outcome: "executed",
        policyReason,
        auditEventId,
        result,
      };
    } catch (error) {
      const reason = `execution error: ${(error as Error).message}`;
      await this.recordBlocked(auditEventId, request, reason, {
        error: (error as Error).message,
      });
      return {
        outcome: "blocked",
        policyReason: reason,
        auditEventId,
      };
    }
  }

  private async recordBlocked(
    auditEventId: string,
    request: ToolInvokeRequest,
    reason: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.storage.db.prepare(`
      INSERT INTO policy_blocks (
        audit_event_id, timestamp, agent_id, session_id, tool_name, reason, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditEventId,
      now,
      request.agentId,
      request.sessionId,
      request.toolName,
      reason,
      JSON.stringify(details),
    );

    await this.storage.audit.append("policy_blocks", {
      auditEventId,
      agentId: request.agentId,
      sessionId: request.sessionId,
      toolName: request.toolName,
      reason,
      details,
    });
  }

  private async recordInvocation(
    auditEventId: string,
    request: ToolInvokeRequest,
    outcome: "executed" | "approval_required" | "blocked",
    policyReason: string,
    result?: Record<string, unknown>,
    approvalId?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.storage.db.prepare(`
      INSERT INTO tool_invocations (
        audit_event_id, timestamp, agent_id, session_id, task_id, tool_name,
        outcome, policy_reason, args_json, result_json, approval_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditEventId,
      now,
      request.agentId,
      request.sessionId,
      request.taskId ?? null,
      request.toolName,
      outcome,
      policyReason,
      JSON.stringify(request.args),
      result ? JSON.stringify(result) : null,
      approvalId ?? null,
    );

    await this.storage.audit.append("tool_invocations", {
      auditEventId,
      agentId: request.agentId,
      sessionId: request.sessionId,
      taskId: request.taskId,
      toolName: request.toolName,
      outcome,
      policyReason,
      approvalId,
      args: request.args,
      result,
    });
  }
}

function asToolInvokeRequest(value: Record<string, unknown>): ToolInvokeRequest {
  const toolName = String(value.toolName ?? "");
  const agentId = String(value.agentId ?? "");
  const sessionId = String(value.sessionId ?? "");
  const args = (value.args ?? {}) as Record<string, unknown>;
  const taskId = value.taskId ? String(value.taskId) : undefined;

  if (!toolName || !agentId || !sessionId) {
    throw new Error("Invalid pending action request payload");
  }

  return {
    toolName,
    args,
    agentId,
    sessionId,
    taskId,
  };
}