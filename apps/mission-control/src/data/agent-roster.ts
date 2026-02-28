import type { AgentsResponse } from "../api/client";

export type RuntimeAgent = AgentsResponse["items"][number];
export type AgentDirectoryStatus = RuntimeAgent["status"] | "ready";

export interface AgentRoleTemplate {
  roleId: string;
  name: string;
  title: string;
  summary: string;
  specialties: string[];
  defaultTools: string[];
  priority: number;
  aliases: string[];
}

export interface AgentDirectoryRecord {
  roleId: string;
  name: string;
  title: string;
  summary: string;
  specialties: string[];
  defaultTools: string[];
  status: AgentDirectoryStatus;
  sessionCount: number;
  activeSessions: number;
  lastUpdatedAt?: string;
  runtimeAgentId?: string;
  runtimeName?: string;
}

export const BUILTIN_AGENT_ROSTER: AgentRoleTemplate[] = [
  {
    roleId: "architect",
    name: "Architect Goat",
    title: "Systems Architect",
    summary: "Designs system boundaries, contracts, and sequencing decisions.",
    specialties: ["Architecture", "APIs", "Tradeoffs"],
    defaultTools: ["session.status", "memory.read", "fs.read", "browser.search"],
    priority: 10,
    aliases: ["architect", "system architect", "staff engineer"],
  },
  {
    roleId: "coder",
    name: "Coder Goat",
    title: "Implementation Engineer",
    summary: "Implements features, refactors safely, and keeps delivery moving.",
    specialties: ["TypeScript", "Refactors", "Integration"],
    defaultTools: ["fs.read", "fs.write", "shell.exec", "git.exec"],
    priority: 20,
    aliases: ["coder", "developer", "implementation", "engineer"],
  },
  {
    roleId: "qa",
    name: "QA Goat",
    title: "Verification Lead",
    summary: "Finds regressions early, validates acceptance criteria, and hardens behavior.",
    specialties: ["Testing", "Edge cases", "Regression checks"],
    defaultTools: ["shell.exec", "fs.read", "memory.read"],
    priority: 30,
    aliases: ["qa", "quality", "tester", "verification"],
  },
  {
    roleId: "researcher",
    name: "Researcher Goat",
    title: "Research Analyst",
    summary: "Gathers primary-source facts, compares options, and summarizes decisions.",
    specialties: ["Discovery", "Comparative analysis", "Sourcing"],
    defaultTools: ["browser.search", "http.get", "citations.build"],
    priority: 40,
    aliases: ["researcher", "research", "analyst"],
  },
  {
    roleId: "assistant",
    name: "Personal Assistant Goat",
    title: "Operations Assistant",
    summary: "Handles routine organization, reminders, and operator-facing workflows.",
    specialties: ["Coordination", "Summaries", "Ops support"],
    defaultTools: ["session.status", "memory.read", "http.get"],
    priority: 50,
    aliases: ["assistant", "personal assistant", "pa", "operator assistant"],
  },
  {
    roleId: "product",
    name: "Product Goat",
    title: "Product Strategist",
    summary: "Turns user goals into scoped deliverables and measurable milestones.",
    specialties: ["Scoping", "Prioritization", "Roadmaps"],
    defaultTools: ["memory.read", "browser.search"],
    priority: 60,
    aliases: ["product", "pm", "product manager", "planner"],
  },
  {
    roleId: "ops",
    name: "Ops Goat",
    title: "Runtime Operator",
    summary: "Monitors runtime health, safety posture, and operational constraints.",
    specialties: ["Reliability", "Safety", "Incident response"],
    defaultTools: ["session.status", "http.get", "shell.exec"],
    priority: 70,
    aliases: ["ops", "sre", "operations", "infra"],
  },
];

const ROLE_INDEX = new Map(BUILTIN_AGENT_ROSTER.map((role) => [role.roleId, role]));
const ACTIVE_STATUS_SCORE: Record<AgentDirectoryStatus, number> = {
  active: 3,
  idle: 2,
  ready: 1,
};

export function inferRoleId(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }
  const normalized = normalize(input);
  if (!normalized) {
    return undefined;
  }

  for (const role of BUILTIN_AGENT_ROSTER) {
    if (normalize(role.roleId) === normalized || normalize(role.name) === normalized) {
      return role.roleId;
    }

    for (const alias of role.aliases) {
      if (normalized.includes(normalize(alias))) {
        return role.roleId;
      }
    }
  }

  return undefined;
}

export function buildAgentDirectory(runtimeAgents: RuntimeAgent[]): AgentDirectoryRecord[] {
  const runtimeByRole = new Map<string, RuntimeAggregate>();
  const unmatchedRuntime: RuntimeAgent[] = [];

  for (const runtime of runtimeAgents) {
    const roleId = inferRoleId(runtime.name) ?? inferRoleId(runtime.agentId);
    if (!roleId || !ROLE_INDEX.has(roleId)) {
      unmatchedRuntime.push(runtime);
      continue;
    }

    const current = runtimeByRole.get(roleId) ?? createEmptyAggregate();
    current.sessionCount += runtime.sessionCount;
    current.activeSessions += runtime.activeSessions;
    current.status = chooseStatus(current.status, runtime.status);
    current.runtimeAgentId = current.runtimeAgentId ?? runtime.agentId;
    current.runtimeName = current.runtimeName ?? runtime.name;
    current.lastUpdatedAt = pickLatestTimestamp(current.lastUpdatedAt, runtime.lastUpdatedAt);
    runtimeByRole.set(roleId, current);
  }

  const directory: AgentDirectoryRecord[] = BUILTIN_AGENT_ROSTER.map((template) => {
    const runtime = runtimeByRole.get(template.roleId);
    return {
      roleId: template.roleId,
      name: template.name,
      title: template.title,
      summary: template.summary,
      specialties: template.specialties,
      defaultTools: template.defaultTools,
      status: runtime?.status ?? "ready",
      sessionCount: runtime?.sessionCount ?? 0,
      activeSessions: runtime?.activeSessions ?? 0,
      lastUpdatedAt: runtime?.lastUpdatedAt,
      runtimeAgentId: runtime?.runtimeAgentId,
      runtimeName: runtime?.runtimeName,
    };
  });

  for (const runtime of unmatchedRuntime) {
    directory.push({
      roleId: `custom:${runtime.agentId}`,
      name: runtime.name,
      title: "Custom Agent",
      summary: "Runtime-discovered agent outside the default roster.",
      specialties: ["Runtime", "Custom workflow"],
      defaultTools: [],
      status: runtime.status,
      sessionCount: runtime.sessionCount,
      activeSessions: runtime.activeSessions,
      lastUpdatedAt: runtime.lastUpdatedAt,
      runtimeAgentId: runtime.agentId,
      runtimeName: runtime.name,
    });
  }

  directory.sort((left, right) => {
    const statusDelta = ACTIVE_STATUS_SCORE[right.status] - ACTIVE_STATUS_SCORE[left.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const leftPriority = ROLE_INDEX.get(left.roleId)?.priority ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = ROLE_INDEX.get(right.roleId)?.priority ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.name.localeCompare(right.name);
  });

  return directory;
}

function createEmptyAggregate(): RuntimeAggregate {
  return {
    status: "idle",
    sessionCount: 0,
    activeSessions: 0,
  };
}

function chooseStatus(
  current: AgentDirectoryStatus,
  incoming: RuntimeAgent["status"],
): AgentDirectoryStatus {
  if (current === "active" || incoming === "active") {
    return "active";
  }
  return "idle";
}

function pickLatestTimestamp(current?: string, incoming?: string): string | undefined {
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }
  return Date.parse(incoming) >= Date.parse(current) ? incoming : current;
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

interface RuntimeAggregate {
  status: AgentDirectoryStatus;
  sessionCount: number;
  activeSessions: number;
  lastUpdatedAt?: string;
  runtimeAgentId?: string;
  runtimeName?: string;
}
