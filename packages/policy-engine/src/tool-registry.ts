import type { ToolCatalogEntry, ToolCategory, ToolPack, ToolRiskLevel } from "@goatcitadel/contracts";

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  description: string;
  argSchema?: Record<string, unknown>;
  examples?: Array<{ title: string; args: Record<string, unknown> }>;
  pack: ToolPack;
}

const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: "session.status",
    category: "session",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Return basic status for the active session.",
    pack: "core",
  },
  {
    name: "memory.read",
    category: "memory",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Read memory context from local memory sources.",
    pack: "core",
  },
  {
    name: "time.now",
    category: "session",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Return current local time and UTC time on this host.",
    pack: "core",
  },
  {
    name: "bankr.status",
    category: "ops",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Return Bankr runtime status and policy posture.",
    argSchema: {},
    pack: "core",
  },
  {
    name: "bankr.read",
    category: "ops",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Run Bankr read-only prompts for balances/prices/research.",
    argSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        chain: { type: "string" },
        actionType: { type: "string", enum: ["read"] },
      },
      required: ["prompt"],
    },
    pack: "core",
  },
  {
    name: "bankr.write",
    category: "ops",
    riskLevel: "nuclear",
    requiresApproval: true,
    description: "Run Bankr money-moving actions with strict caps and explicit approvals.",
    argSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        actionType: {
          type: "string",
          enum: ["trade", "transfer", "sign", "submit", "deploy"],
        },
        chain: { type: "string" },
        symbol: { type: "string" },
        usdEstimate: { type: "number" },
      },
      required: ["prompt", "usdEstimate"],
    },
    pack: "core",
  },
  {
    name: "fs.read",
    category: "fs",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Read a file inside allowed read roots.",
    pack: "core",
  },
  {
    name: "fs.write",
    category: "fs",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Write a file inside write jail roots.",
    pack: "core",
  },
  {
    name: "fs.list",
    category: "fs",
    riskLevel: "safe",
    requiresApproval: false,
    description: "List files and directories under an allowed path.",
    pack: "devops",
  },
  {
    name: "fs.stat",
    category: "fs",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Read file or directory metadata.",
    pack: "devops",
  },
  {
    name: "fs.copy",
    category: "fs",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Copy file from source to destination inside write jail.",
    pack: "devops",
  },
  {
    name: "fs.move",
    category: "fs",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Move or rename a file inside write jail.",
    pack: "devops",
  },
  {
    name: "fs.delete",
    category: "fs",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Delete a file or directory in write jail.",
    pack: "devops",
  },
  {
    name: "http.get",
    category: "http",
    riskLevel: "caution",
    requiresApproval: false,
    description: "HTTP GET request to allowlisted hosts.",
    pack: "core",
  },
  {
    name: "http.post",
    category: "http",
    riskLevel: "danger",
    requiresApproval: true,
    description: "HTTP POST request to allowlisted hosts.",
    pack: "core",
  },
  {
    name: "shell.exec",
    category: "shell",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Run shell command with policy gating.",
    pack: "core",
  },
  {
    name: "git.exec",
    category: "git",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Run low-level git command with approval gates.",
    pack: "core",
  },
  {
    name: "git.status",
    category: "git",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Get repository status summary.",
    pack: "devops",
  },
  {
    name: "git.diff",
    category: "git",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Get repository diff summary.",
    pack: "devops",
  },
  {
    name: "git.add",
    category: "git",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Stage files by path.",
    pack: "devops",
  },
  {
    name: "git.commit",
    category: "git",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Create git commit from staged changes.",
    pack: "devops",
  },
  {
    name: "git.branch.create",
    category: "git",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Create a new git branch.",
    pack: "devops",
  },
  {
    name: "git.branch.switch",
    category: "git",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Switch git branch.",
    pack: "devops",
  },
  {
    name: "git.worktree.create",
    category: "git",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Create git worktree at target path.",
    pack: "devops",
  },
  {
    name: "git.worktree.remove",
    category: "git",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Remove git worktree at target path.",
    pack: "devops",
  },
  {
    name: "tests.run",
    category: "ops",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Run restricted test commands.",
    pack: "devops",
  },
  {
    name: "lint.run",
    category: "ops",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Run restricted lint commands.",
    pack: "devops",
  },
  {
    name: "build.run",
    category: "ops",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Run restricted build commands.",
    pack: "devops",
  },
  {
    name: "browser.search",
    category: "research",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Search web using browser automation.",
    pack: "core",
  },
  {
    name: "browser.navigate",
    category: "research",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Navigate to page and extract page text.",
    pack: "core",
  },
  {
    name: "browser.extract",
    category: "research",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Extract text from selected CSS selector.",
    pack: "core",
  },
  {
    name: "browser.screenshot",
    category: "research",
    riskLevel: "danger",
    requiresApproval: false,
    description: "Capture screenshot into jailed output path.",
    pack: "core",
  },
  {
    name: "browser.interact",
    category: "research",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Perform interactive browser actions from step sequence.",
    pack: "core",
  },
  {
    name: "mcp.invoke",
    category: "ops",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Invoke a managed MCP tool through policy-gated execution.",
    argSchema: {
      type: "object",
      properties: {
        serverId: { type: "string" },
        toolName: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["serverId", "toolName"],
    },
    pack: "core",
  },
  {
    name: "citations.build",
    category: "research",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Build citation bundle from gathered sources.",
    pack: "core",
  },
  {
    name: "memory.write",
    category: "knowledge",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Write structured memory note into knowledge index.",
    pack: "knowledge",
  },
  {
    name: "memory.upsert",
    category: "knowledge",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Upsert structured memory note by deterministic key.",
    pack: "knowledge",
  },
  {
    name: "memory.search",
    category: "knowledge",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Search indexed memory and return ranked snippets.",
    pack: "knowledge",
  },
  {
    name: "docs.ingest",
    category: "knowledge",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Ingest file/url/text documents into knowledge chunks.",
    pack: "knowledge",
  },
  {
    name: "embeddings.index",
    category: "knowledge",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Generate/update embeddings for knowledge chunks.",
    pack: "knowledge",
  },
  {
    name: "embeddings.query",
    category: "knowledge",
    riskLevel: "safe",
    requiresApproval: false,
    description: "Search chunks by vector similarity with lexical fallback.",
    pack: "knowledge",
  },
  {
    name: "artifacts.create",
    category: "knowledge",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Create artifact file from template into workspace.",
    pack: "knowledge",
  },
  {
    name: "channel.send",
    category: "comms",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Send channel message via configured integration connection.",
    pack: "comms",
  },
  {
    name: "webhook.send",
    category: "comms",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Send signed webhook payload to configured endpoint.",
    pack: "comms",
  },
  {
    name: "gmail.read",
    category: "comms",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Read Gmail messages with configured query.",
    pack: "comms",
  },
  {
    name: "gmail.send",
    category: "comms",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Send Gmail message from configured account.",
    pack: "comms",
  },
  {
    name: "calendar.list",
    category: "comms",
    riskLevel: "safe",
    requiresApproval: false,
    description: "List calendar events in time window.",
    pack: "comms",
  },
  {
    name: "calendar.create_event",
    category: "comms",
    riskLevel: "danger",
    requiresApproval: true,
    description: "Create calendar event with attendees.",
    pack: "comms",
  },
  {
    name: "discord.send",
    category: "comms",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Send message to Discord webhook/channel integration.",
    pack: "comms",
  },
  {
    name: "slack.send",
    category: "comms",
    riskLevel: "caution",
    requiresApproval: false,
    description: "Send message to Slack webhook/channel integration.",
    pack: "comms",
  },
];

export class ToolRegistry {
  private readonly byName = new Map<string, ToolDefinition>();

  public constructor(initial: ToolDefinition[] = BUILTIN_TOOLS) {
    for (const tool of initial) {
      this.byName.set(tool.name, tool);
    }
  }

  public get(name: string): ToolDefinition | undefined {
    return this.byName.get(name);
  }

  public list(): ToolDefinition[] {
    return [...this.byName.values()];
  }

  public toCatalog(): ToolCatalogEntry[] {
    return this.list().map((tool) => ({
      toolName: tool.name,
      category: tool.category,
      riskLevel: tool.riskLevel,
      requiresApproval: tool.requiresApproval,
      description: tool.description,
      argSchema: tool.argSchema ?? {},
      examples: tool.examples ?? [],
      pack: tool.pack,
    }));
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry(BUILTIN_TOOLS);
}
