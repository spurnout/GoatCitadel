import type { ToolCategory, ToolPack, ToolRiskLevel } from "./tools.js";

export interface ToolCatalogExample {
  title: string;
  args: Record<string, unknown>;
}

export interface ToolCatalogEntry {
  toolName: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  description: string;
  argSchema: Record<string, unknown>;
  examples: ToolCatalogExample[];
  pack: ToolPack;
}
