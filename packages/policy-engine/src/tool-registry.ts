export interface ToolDefinition {
  name: string;
  category: string;
  riskLevel: "safe" | "caution" | "danger" | "nuclear";
  requiresApproval: boolean;
}

const BUILTIN_TOOLS: ToolDefinition[] = [
  { name: "session.status", category: "session", riskLevel: "safe", requiresApproval: false },
  { name: "memory.read", category: "memory", riskLevel: "safe", requiresApproval: false },
  { name: "fs.read", category: "fs", riskLevel: "caution", requiresApproval: false },
  { name: "fs.write", category: "fs", riskLevel: "danger", requiresApproval: true },
  { name: "http.get", category: "http", riskLevel: "caution", requiresApproval: false },
  { name: "http.post", category: "http", riskLevel: "danger", requiresApproval: true },
  { name: "shell.exec", category: "shell", riskLevel: "danger", requiresApproval: true },
  { name: "git.exec", category: "git", riskLevel: "danger", requiresApproval: true },
  { name: "browser.search", category: "research", riskLevel: "caution", requiresApproval: false },
  { name: "citations.build", category: "research", riskLevel: "safe", requiresApproval: false },
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
}

export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry(BUILTIN_TOOLS);
}