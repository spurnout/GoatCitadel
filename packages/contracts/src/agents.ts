export type AgentRuntimeStatus = "active" | "idle";
export type AgentLifecycleStatus = "active" | "archived";

export interface AgentProfileRecord {
  agentId: string;
  roleId: string;
  name: string;
  title: string;
  summary: string;
  specialties: string[];
  defaultTools: string[];
  aliases: string[];
  isBuiltin: boolean;
  editable: boolean;
  lifecycleStatus: AgentLifecycleStatus;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  status: AgentRuntimeStatus;
  sessionCount: number;
  activeSessions: number;
  lastUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfileCreateInput {
  roleId: string;
  name: string;
  title: string;
  summary: string;
  specialties?: string[];
  defaultTools?: string[];
  aliases?: string[];
}

export interface AgentProfileUpdateInput {
  name?: string;
  title?: string;
  summary?: string;
  specialties?: string[];
  defaultTools?: string[];
  aliases?: string[];
}

export interface AgentProfileArchiveInput {
  archivedBy?: string;
  archiveReason?: string;
}

export interface BuiltinAgentProfileSeed {
  agentId: string;
  roleId: string;
  name: string;
  title: string;
  summary: string;
  specialties: string[];
  defaultTools: string[];
  aliases: string[];
}

export const BUILTIN_AGENT_PROFILES: BuiltinAgentProfileSeed[] = [
  {
    agentId: "builtin-architect",
    roleId: "architect",
    name: "Architect Goat",
    title: "Systems Architect",
    summary: "Designs system boundaries, contracts, and sequencing decisions.",
    specialties: ["Architecture", "APIs", "Tradeoffs"],
    defaultTools: ["session.status", "memory.read", "fs.read", "browser.search"],
    aliases: ["architect", "system architect", "staff engineer"],
  },
  {
    agentId: "builtin-coder",
    roleId: "coder",
    name: "Coder Goat",
    title: "Implementation Engineer",
    summary: "Implements features, refactors safely, and keeps delivery moving.",
    specialties: ["TypeScript", "Refactors", "Integration"],
    defaultTools: ["fs.read", "fs.write", "shell.exec", "git.exec"],
    aliases: ["coder", "developer", "implementation", "engineer"],
  },
  {
    agentId: "builtin-qa",
    roleId: "qa",
    name: "QA Goat",
    title: "Verification Lead",
    summary: "Finds regressions early, validates acceptance criteria, and hardens behavior.",
    specialties: ["Testing", "Edge cases", "Regression checks"],
    defaultTools: ["shell.exec", "fs.read", "memory.read"],
    aliases: ["qa", "quality", "tester", "verification"],
  },
  {
    agentId: "builtin-researcher",
    roleId: "researcher",
    name: "Researcher Goat",
    title: "Research Analyst",
    summary: "Gathers primary-source facts, compares options, and summarizes decisions.",
    specialties: ["Discovery", "Comparative analysis", "Sourcing"],
    defaultTools: ["browser.search", "http.get", "citations.build"],
    aliases: ["researcher", "research", "analyst"],
  },
  {
    agentId: "builtin-assistant",
    roleId: "assistant",
    name: "Personal Assistant Goat",
    title: "Operations Assistant",
    summary: "Handles routine organization, reminders, and operator-facing workflows.",
    specialties: ["Coordination", "Summaries", "Ops support"],
    defaultTools: ["session.status", "memory.read", "http.get"],
    aliases: ["assistant", "personal assistant", "pa", "operator assistant"],
  },
  {
    agentId: "builtin-product",
    roleId: "product",
    name: "Product Goat",
    title: "Product Strategist",
    summary: "Turns user goals into scoped deliverables and measurable milestones.",
    specialties: ["Scoping", "Prioritization", "Roadmaps"],
    defaultTools: ["memory.read", "browser.search"],
    aliases: ["product", "pm", "product manager", "planner"],
  },
  {
    agentId: "builtin-ops",
    roleId: "ops",
    name: "Ops Goat",
    title: "Runtime Operator",
    summary: "Monitors runtime health, safety posture, and operational constraints.",
    specialties: ["Reliability", "Safety", "Incident response"],
    defaultTools: ["session.status", "http.get", "shell.exec"],
    aliases: ["ops", "sre", "operations", "infra"],
  },
];
