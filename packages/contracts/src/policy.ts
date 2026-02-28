export type ToolProfile =
  | "minimal"
  | "standard"
  | "coding"
  | "ops"
  | "research"
  | "danger";

export interface ToolPolicyConfig {
  profiles: Record<string, string[]>;
  tools: { profile: ToolProfile; allow: string[]; deny: string[] };
  agents: Record<string, { tools?: Partial<ToolPolicyConfig["tools"]> }>;
  sandbox: {
    writeJailRoots: string[];
    readOnlyRoots: string[];
    networkAllowlist: string[];
    riskyShellPatterns: string[];
    requireApprovalForRiskyShell: boolean;
  };
}

export interface ToolInvokeRequest {
  toolName: string;
  args: Record<string, unknown>;
  agentId: string;
  sessionId: string;
  taskId?: string;
}

export interface ToolInvokeResult {
  outcome: "executed" | "approval_required" | "blocked";
  approvalId?: string;
  policyReason: string;
  auditEventId: string;
  result?: Record<string, unknown>;
}

export interface EffectiveToolPolicy {
  profile: string;
  allowSet: Set<string>;
  denySet: Set<string>;
  effectiveTools: Set<string>;
}