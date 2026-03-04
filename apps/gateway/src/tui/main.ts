import process from "node:process";
import { confirm, input, password, select } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { renderDoctorReport, runDoctor as runSharedDoctor } from "../doctor/engine.js";
import { TuiApiClient } from "./api-client.js";
import { TuiLiveFeed } from "./live-feed.js";
import { loadResolvedProfile, saveProfile, type TuiResolvedAuth } from "./profile.js";

type HomeView =
  | "dashboard"
  | "approvals"
  | "sessions"
  | "costs"
  | "tools"
  | "tasks"
  | "skills"
  | "integrations"
  | "mesh"
  | "npu"
  | "system"
  | "onboarding"
  | "settings"
  | "exit";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const resolved = await loadResolvedProfile({
    profileName: args.profile,
    gatewayOverride: args.gateway,
  });

  const auth = await resolveAuth(resolved.auth);
  const client = new TuiApiClient({
    baseUrl: resolved.profile.gatewayBaseUrl,
    auth,
    readOnly: args.readOnly,
  });
  const live = new TuiLiveFeed(client, resolved.profile.pollIntervalsMs?.activity ?? 2500);
  await live.start();

  if (args.doctor) {
    await runDoctor(client, resolved.profileName, resolved.filePath, auth, args);
    live.stop();
    return;
  }

  process.on("SIGINT", () => {
    live.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    live.stop();
    process.exit(0);
  });

  let current: HomeView = "dashboard";
  while (current !== "exit") {
    printHeader({
      profile: resolved.profileName,
      gateway: client.baseUrl,
      readOnly: client.readOnly,
      liveState: live.getState(),
      lastEventAt: live.getLastEvent()?.timestamp,
    });

    try {
      if (current === "dashboard") {
        await viewDashboard(client);
      } else if (current === "approvals") {
        await viewApprovals(client);
      } else if (current === "sessions") {
        await viewSessions(client);
      } else if (current === "costs") {
        await viewCosts(client);
      } else if (current === "tools") {
        await viewTools(client);
      } else if (current === "tasks") {
        await viewTasks(client);
      } else if (current === "skills") {
        await viewSkills(client);
      } else if (current === "integrations") {
        await viewIntegrations(client);
      } else if (current === "mesh") {
        await viewMesh(client);
      } else if (current === "npu") {
        await viewNpu(client);
      } else if (current === "system") {
        await viewSystem(client);
      } else if (current === "onboarding") {
        await viewOnboarding(client);
      } else if (current === "settings") {
        await viewSettings(client, resolved.filePath, resolved.profileName);
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      await pause();
    }

    current = await chooseNextView();
  }

  live.stop();
}

function parseArgs(argv: string[]): {
  profile?: string;
  gateway?: string;
  readOnly: boolean;
  doctor: boolean;
  deep: boolean;
  yes: boolean;
  json: boolean;
  auditOnly: boolean;
  noRepair: boolean;
} {
  let profile: string | undefined;
  let gateway: string | undefined;
  let readOnly = false;
  let doctor = false;
  let deep = false;
  let yes = false;
  let json = false;
  let auditOnly = false;
  let noRepair = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--profile") {
      profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--gateway") {
      gateway = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--read-only") {
      readOnly = true;
      continue;
    }
    if (value === "doctor" || value === "--doctor") {
      doctor = true;
      continue;
    }
    if (value === "--deep") {
      deep = true;
      continue;
    }
    if (value === "--yes" || value === "-y") {
      yes = true;
      continue;
    }
    if (value === "--json") {
      json = true;
      continue;
    }
    if (value === "--audit-only") {
      auditOnly = true;
      continue;
    }
    if (value === "--no-repair") {
      noRepair = true;
      continue;
    }
  }

  return { profile, gateway, readOnly, doctor, deep, yes, json, auditOnly, noRepair };
}

async function resolveAuth(auth: TuiResolvedAuth): Promise<TuiResolvedAuth> {
  if (auth.mode === "token" && !auth.token) {
    const token = await password({
      message: "Gateway token",
      mask: "*",
    });
    return {
      ...auth,
      token: token.trim(),
    };
  }
  if (auth.mode === "basic" && (!auth.username || !auth.password)) {
    const username = auth.username?.trim() || await input({ message: "Gateway basic username" });
    const pass = auth.password || await password({ message: "Gateway basic password", mask: "*" });
    return {
      ...auth,
      username: username.trim(),
      password: pass,
    };
  }
  return auth;
}

async function runDoctor(
  client: TuiApiClient,
  profileName: string,
  profilePath: string,
  auth: TuiResolvedAuth,
  args: {
    readOnly: boolean;
    deep: boolean;
    yes: boolean;
    json: boolean;
    auditOnly: boolean;
    noRepair: boolean;
  },
): Promise<void> {
  const spinner = ora("Running doctor checks...").start();
  try {
    const report = await runSharedDoctor({
      gatewayBaseUrl: client.baseUrl,
      profileName,
      profilePath,
      readOnly: args.readOnly,
      deep: args.deep,
      yes: args.yes,
      auditOnly: args.auditOnly,
      noRepair: args.noRepair,
      authToken: auth.token,
      authMode: auth.mode,
      promptConfirm: async (message: string) =>
        confirm({
          message,
          default: false,
        }),
    });
    spinner.stop();
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(chalk.bold("\nGoatCitadel TUI Doctor\n"));
      console.log(renderDoctorReport(report));
    }
    process.exitCode = report.summary.exitCode;
  } catch (error) {
    spinner.fail(`Doctor failed: ${(error as Error).message}`);
    process.exitCode = 2;
  }
}

function printHeader(input: {
  profile: string;
  gateway: string;
  readOnly: boolean;
  liveState: string;
  lastEventAt?: string;
}): void {
  console.clear();
  console.log(chalk.bold("GoatCitadel Terminal Mission Control"));
  console.log(
    `${chalk.cyan("Profile")}: ${input.profile}  ` +
    `${chalk.cyan("Gateway")}: ${input.gateway}  ` +
    `${chalk.cyan("Live")}: ${input.liveState}  ` +
    `${chalk.cyan("Mode")}: ${input.readOnly ? "read-only" : "read+safe-write"}`,
  );
  if (input.lastEventAt) {
    console.log(`${chalk.cyan("Last event")}: ${new Date(input.lastEventAt).toLocaleString()}`);
  }
  console.log(chalk.gray("=".repeat(96)));
}

async function chooseNextView(): Promise<HomeView> {
  return await select<HomeView>({
    message: "Navigate",
    choices: [
      { name: "Dashboard", value: "dashboard" },
      { name: "Approvals", value: "approvals" },
      { name: "Sessions", value: "sessions" },
      { name: "Costs", value: "costs" },
      { name: "Tools", value: "tools" },
      { name: "Tasks", value: "tasks" },
      { name: "Skills", value: "skills" },
      { name: "Integrations", value: "integrations" },
      { name: "Mesh", value: "mesh" },
      { name: "NPU", value: "npu" },
      { name: "System", value: "system" },
      { name: "Onboarding", value: "onboarding" },
      { name: "Settings", value: "settings" },
      { name: "Exit", value: "exit" },
    ],
  });
}

async function viewDashboard(client: TuiApiClient): Promise<void> {
  const spinner = ora("Loading dashboard...").start();
  const state = await client.dashboard();
  spinner.stop();

  console.log(chalk.bold("Dashboard"));
  console.log(`Timestamp: ${state.timestamp}`);
  console.log(`Sessions: ${state.sessions.length}`);
  console.log(`Pending approvals: ${state.pendingApprovals}`);
  console.log(`Active subagents: ${state.activeSubagents}`);
  console.log(`Daily cost (USD): ${state.dailyCostUsd.toFixed(4)}`);
  console.log("");

  console.log(chalk.bold("Task Status Counts"));
  console.table(state.taskStatusCounts);
  console.log(chalk.bold("Recent Events"));
  console.table(
    state.recentEvents.slice(0, 12).map((event) => ({
      timestamp: event.timestamp,
      eventType: event.eventType,
      source: event.source,
    })),
  );
  await pause();
}

async function viewApprovals(client: TuiApiClient): Promise<void> {
  const status = await select({
    message: "Approval status filter",
    choices: [
      { name: "pending", value: "pending" },
      { name: "approved", value: "approved" },
      { name: "rejected", value: "rejected" },
      { name: "edited", value: "edited" },
    ],
  });

  const approvals = await client.listApprovals(status);
  console.log(chalk.bold(`Approvals (${status})`));
  if (approvals.items.length === 0) {
    console.log("No approvals in this status.");
    await pause();
    return;
  }
  console.table(
    approvals.items.map((approval) => ({
      approvalId: approval.approvalId,
      kind: approval.kind,
      riskLevel: approval.riskLevel,
      status: approval.status,
      explanation: approval.explanationStatus,
      createdAt: approval.createdAt,
    })),
  );

  const selectedId = await input({
    message: "Enter approvalId to inspect/resolve (blank to return)",
  });
  if (!selectedId.trim()) {
    return;
  }

  const replay = await client.getApprovalReplay(selectedId.trim());
  console.log(chalk.bold("Approval Detail"));
  console.log(JSON.stringify(replay.approval, null, 2));
  if (replay.events.length > 0) {
    console.log(chalk.bold("Replay Trail"));
    console.table(
      replay.events.map((event) => ({
        timestamp: event.timestamp,
        eventType: event.eventType,
        actorId: event.actorId,
      })),
    );
  }

  if (replay.approval.status !== "pending") {
    await pause();
    return;
  }

  const action = await select<"approve" | "reject" | "skip">({
    message: "Resolve approval?",
    choices: [
      { name: "Approve", value: "approve" },
      { name: "Reject", value: "reject" },
      { name: "Leave pending", value: "skip" },
    ],
  });
  if (action === "skip") {
    return;
  }

  const confirmed = await confirm({
    message: `Confirm ${action} for ${replay.approval.approvalId}?`,
    default: false,
  });
  if (!confirmed) {
    return;
  }

  const result = await client.resolveApproval(replay.approval.approvalId, action);
  console.log(`Resolved: ${result.approval.status}`);
  await pause();
}

async function viewSessions(client: TuiApiClient): Promise<void> {
  const sessions = await client.listSessions(100);
  console.log(chalk.bold("Sessions"));
  console.table(
    sessions.items.map((session) => ({
      sessionId: session.sessionId,
      kind: session.kind,
      health: session.health,
      tokenTotal: session.tokenTotal,
      costUsdTotal: Number(session.costUsdTotal.toFixed(4)),
      updatedAt: session.updatedAt,
    })),
  );
  await pause();
}

async function viewCosts(client: TuiApiClient): Promise<void> {
  const scope = await select<"day" | "session" | "agent" | "task">({
    message: "Cost scope",
    choices: [
      { name: "day", value: "day" },
      { name: "session", value: "session" },
      { name: "agent", value: "agent" },
      { name: "task", value: "task" },
    ],
  });
  const costs = await client.listCosts(scope);
  const qmd = await client.listMemoryQmdStats();
  console.log(chalk.bold(`Costs (${scope})`));
  console.table(
    costs.items.map((item) => ({
      key: item.key,
      tokenTotal: item.tokenTotal,
      costUsd: Number(item.costUsd.toFixed(4)),
    })),
  );
  console.log(
    `QMD: ${qmd.totalRuns} runs, ${qmd.savingsPercent.toFixed(1)}% estimated savings ` +
    `(${qmd.originalTokenEstimate} -> ${qmd.distilledTokenEstimate})`,
  );

  const cheaper = await confirm({
    message: "Run cheaper recommendation?",
    default: false,
  });
  if (cheaper) {
    const res = await client.runCheaper();
    console.log(chalk.bold(`Mode: ${res.mode}`));
    for (const action of res.actions) {
      console.log(`- ${action}`);
    }
  }
  await pause();
}

async function viewTools(client: TuiApiClient): Promise<void> {
  const [catalog, grants] = await Promise.all([
    client.toolsCatalog(),
    client.toolsListGrants({ limit: 500 }),
  ]);

  console.log(chalk.bold("Tool Catalog"));
  console.table(
    catalog.items.map((item) => ({
      toolName: item.toolName,
      category: item.category,
      risk: item.riskLevel,
      requiresApproval: item.requiresApproval,
      pack: item.pack,
    })),
  );

  console.log(chalk.bold("Tool Grants"));
  console.table(
    grants.items.map((grant) => ({
      grantId: grant.grantId,
      toolPattern: grant.toolPattern,
      decision: grant.decision,
      scope: `${grant.scope}:${grant.scopeRef}`,
      grantType: grant.grantType,
      expiresAt: grant.expiresAt ?? "",
      revokedAt: grant.revokedAt ?? "",
    })),
  );

  const action = await select({
    message: "Tools action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Evaluate access", value: "evaluate" },
      { name: "Create grant", value: "create-grant" },
      { name: "Revoke grant", value: "revoke-grant" },
      { name: "Invoke dry-run", value: "dry-run" },
    ],
  });

  if (action === "back") {
    return;
  }

  if (action === "evaluate") {
    const toolName = await input({ message: "Tool name" });
    const agentId = await input({ message: "Agent ID", default: "operator" });
    const sessionId = await input({ message: "Session ID", default: "demo-session" });
    const taskId = await input({ message: "Task ID (optional)" });
    const result = await client.toolsEvaluateAccess({
      toolName,
      agentId,
      sessionId,
      taskId: taskId.trim() || undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    await pause();
    return;
  }

  if (action === "create-grant") {
    const toolPattern = await input({ message: "Tool pattern", default: "fs.list" });
    const decision = await select<"allow" | "deny">({
      message: "Decision",
      choices: [
        { name: "allow", value: "allow" },
        { name: "deny", value: "deny" },
      ],
    });
    const scope = await select<"global" | "session" | "agent" | "task">({
      message: "Scope",
      choices: [
        { name: "global", value: "global" },
        { name: "session", value: "session" },
        { name: "agent", value: "agent" },
        { name: "task", value: "task" },
      ],
    });
    const scopeRef = scope === "global" ? "" : await input({ message: "Scope ref" });
    const grantType = await select<"one_time" | "ttl" | "persistent">({
      message: "Grant type",
      choices: [
        { name: "one_time", value: "one_time" },
        { name: "ttl", value: "ttl" },
        { name: "persistent", value: "persistent" },
      ],
    });
    const expiresAt = await input({ message: "Expires at ISO (optional)" });
    const createdBy = await input({ message: "Created by", default: "tui-operator" });
    const confirmed = await confirm({ message: "Create grant?", default: false });
    if (!confirmed) {
      return;
    }

    const created = await client.toolsCreateGrant({
      toolPattern,
      decision,
      scope,
      scopeRef: scope === "global" ? undefined : (scopeRef.trim() || undefined),
      grantType,
      expiresAt: expiresAt.trim() || undefined,
      createdBy: createdBy.trim() || "tui-operator",
    });
    console.log(JSON.stringify(created, null, 2));
    await pause();
    return;
  }

  if (action === "revoke-grant") {
    const grantId = await input({ message: "Grant ID" });
    const confirmed = await confirm({ message: `Revoke grant ${grantId}?`, default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.toolsRevokeGrant(grantId.trim());
    console.log(JSON.stringify(result, null, 2));
    await pause();
    return;
  }

  const toolName = await input({ message: "Tool name", default: "fs.list" });
  const argsRaw = await input({ message: "Args JSON", default: "{\"path\":\"./workspace\"}" });
  const agentId = await input({ message: "Agent ID", default: "operator" });
  const sessionId = await input({ message: "Session ID", default: "demo-session" });
  const taskId = await input({ message: "Task ID (optional)" });
  const parsedArgs = JSON.parse(argsRaw) as Record<string, unknown>;
  const result = await client.toolsInvoke({
    toolName,
    args: parsedArgs,
    agentId,
    sessionId,
    taskId: taskId.trim() || undefined,
    dryRun: true,
    consentContext: {
      source: "tui",
      operatorId: "tui-operator",
      reason: "tools dry-run",
    },
  });
  console.log(JSON.stringify(result, null, 2));
  await pause();
}

async function viewTasks(client: TuiApiClient): Promise<void> {
  const tasks = await client.listTasks();
  const items = tasks.items;
  console.log(chalk.bold("Tasks"));
  console.table(
    items.map((task) => ({
      taskId: String(task.taskId ?? ""),
      status: String(task.status ?? ""),
      priority: String(task.priority ?? ""),
      title: String(task.title ?? ""),
      assignedAgentId: String(task.assignedAgentId ?? ""),
      updatedAt: String(task.updatedAt ?? ""),
    })),
  );

  const action = await select({
    message: "Task action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Create task", value: "create" },
      { name: "Update task status", value: "update" },
      { name: "Add task activity", value: "activity" },
    ],
  });
  if (action === "back") {
    return;
  }

  if (action === "create") {
    const title = await input({ message: "Title" });
    const description = await input({ message: "Description (optional)" });
    const priority = await select<"low" | "normal" | "high" | "urgent">({
      message: "Priority",
      choices: [
        { name: "low", value: "low" },
        { name: "normal", value: "normal" },
        { name: "high", value: "high" },
        { name: "urgent", value: "urgent" },
      ],
    });
    const confirmed = await confirm({
      message: "Create task?",
      default: true,
    });
    if (!confirmed) {
      return;
    }
    const created = await client.createTask({
      title,
      description: description.trim() || undefined,
      priority,
    });
    console.log(`Created task ${created.taskId as string}`);
    await pause();
    return;
  }

  const taskId = await input({ message: "Task ID" });
  if (!taskId.trim()) {
    return;
  }

  if (action === "update") {
    const status = await select({
      message: "New status",
      choices: [
        { name: "planning", value: "planning" },
        { name: "inbox", value: "inbox" },
        { name: "assigned", value: "assigned" },
        { name: "in_progress", value: "in_progress" },
        { name: "testing", value: "testing" },
        { name: "review", value: "review" },
        { name: "done", value: "done" },
        { name: "blocked", value: "blocked" },
      ],
    });
    const confirmed = await confirm({
      message: `Set task ${taskId} to ${status}?`,
      default: false,
    });
    if (!confirmed) {
      return;
    }
    await client.updateTask(taskId.trim(), { status });
    console.log("Task updated.");
    await pause();
    return;
  }

  if (action === "activity") {
    const message = await input({ message: "Activity message" });
    const activityType = await select({
      message: "Activity type",
      choices: [
        { name: "comment", value: "comment" },
        { name: "updated", value: "updated" },
        { name: "status_changed", value: "status_changed" },
        { name: "file_created", value: "file_created" },
        { name: "spawned", value: "spawned" },
        { name: "completed", value: "completed" },
      ],
    });
    const confirmed = await confirm({
      message: "Append activity?",
      default: true,
    });
    if (!confirmed) {
      return;
    }
    await client.appendTaskActivity(taskId.trim(), {
      activityType,
      message,
      agentId: "tui-operator",
    });
    console.log("Task activity appended.");
    await pause();
  }
}

async function viewSkills(client: TuiApiClient): Promise<void> {
  const skills = await client.listSkills();
  console.log(chalk.bold("Skills"));
  console.table(
    skills.items.map((skill) => ({
      skillId: String(skill.skillId ?? ""),
      name: String(skill.name ?? ""),
      source: String(skill.source ?? ""),
      tools: Array.isArray(skill.declaredTools) ? skill.declaredTools.join(",") : "",
    })),
  );

  const action = await select({
    message: "Skill action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Reload skills", value: "reload" },
      { name: "Resolve activation", value: "resolve" },
    ],
  });
  if (action === "reload") {
    const result = await client.reloadSkills();
    console.log(`Reloaded ${result.items.length} skills.`);
    await pause();
  } else if (action === "resolve") {
    const text = await input({ message: "Prompt text for activation resolution" });
    const decision = await client.resolveSkills(text);
    console.log(JSON.stringify(decision, null, 2));
    await pause();
  }
}

async function viewIntegrations(client: TuiApiClient): Promise<void> {
  const catalog = await client.integrationCatalog();
  const connections = await client.integrationConnections();
  console.log(chalk.bold("Integration Catalog"));
  console.table(
    catalog.items.map((entry) => ({
      catalogId: String(entry.catalogId ?? ""),
      kind: String(entry.kind ?? ""),
      key: String(entry.key ?? ""),
      maturity: String(entry.maturity ?? ""),
    })),
  );
  console.log(chalk.bold("Integration Connections"));
  console.table(
    connections.items.map((connection) => ({
      connectionId: String(connection.connectionId ?? ""),
      catalogId: String(connection.catalogId ?? ""),
      label: String(connection.label ?? ""),
      status: String(connection.status ?? ""),
      enabled: Boolean(connection.enabled),
    })),
  );

  const action = await select({
    message: "Integration action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Create connection", value: "create" },
      { name: "Toggle connection", value: "toggle" },
      { name: "Delete connection", value: "delete" },
    ],
  });
  if (action === "create") {
    const catalogId = await input({ message: "Catalog ID" });
    const label = await input({ message: "Label" });
    const confirmed = await confirm({ message: "Create integration connection?", default: true });
    if (!confirmed) {
      return;
    }
    await client.createIntegrationConnection({
      catalogId,
      label,
      enabled: true,
      status: "connected",
      config: {},
    });
    console.log("Connection created.");
    await pause();
    return;
  }

  const connectionId = await input({ message: "Connection ID" });
  if (!connectionId.trim()) {
    return;
  }
  if (action === "toggle") {
    const next = await select({
      message: "Set status",
      choices: [
        { name: "connected", value: "connected" },
        { name: "disconnected", value: "disconnected" },
        { name: "paused", value: "paused" },
        { name: "error", value: "error" },
      ],
    });
    const enabled = await confirm({ message: "Enabled?", default: next === "connected" });
    const confirmed = await confirm({ message: "Update connection?", default: false });
    if (!confirmed) {
      return;
    }
    await client.updateIntegrationConnection(connectionId.trim(), {
      status: next,
      enabled,
    });
    console.log("Connection updated.");
    await pause();
    return;
  }

  if (action === "delete") {
    const confirmed = await confirm({ message: `Delete connection ${connectionId}?`, default: false });
    if (!confirmed) {
      return;
    }
    await client.deleteIntegrationConnection(connectionId.trim());
    console.log("Connection deleted.");
    await pause();
  }
}

async function viewMesh(client: TuiApiClient): Promise<void> {
  const [status, nodes, leases, owners, offsets] = await Promise.all([
    client.meshStatus(),
    client.meshNodes(),
    client.meshLeases(),
    client.meshOwners(),
    client.meshReplicationOffsets(),
  ]);
  console.log(chalk.bold("Mesh Status"));
  console.log(JSON.stringify(status, null, 2));
  console.log(chalk.bold("Nodes"));
  console.table(nodes.items);
  console.log(chalk.bold("Leases"));
  console.table(leases.items);
  console.log(chalk.bold("Session Owners"));
  console.table(owners.items);
  console.log(chalk.bold("Replication Offsets"));
  console.table(offsets.items);

  const action = await select({
    message: "Mesh action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Acquire lease", value: "acquire" },
      { name: "Renew lease", value: "renew" },
      { name: "Release lease", value: "release" },
      { name: "Claim session owner", value: "claim" },
    ],
  });
  if (action === "back") {
    return;
  }

  if (action === "acquire") {
    const leaseKey = await input({ message: "Lease key" });
    const holderNodeId = await input({ message: "Holder node ID" });
    const ttlSeconds = Number(await input({ message: "TTL seconds", default: "30" }));
    const confirmed = await confirm({ message: "Acquire lease?", default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.meshAcquireLease({ leaseKey, holderNodeId, ttlSeconds });
    console.log(JSON.stringify(result, null, 2));
    await pause();
    return;
  }

  if (action === "renew") {
    const leaseKey = await input({ message: "Lease key" });
    const holderNodeId = await input({ message: "Holder node ID" });
    const fencingToken = Number(await input({ message: "Fencing token" }));
    const ttlSeconds = Number(await input({ message: "TTL seconds", default: "30" }));
    const confirmed = await confirm({ message: "Renew lease?", default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.meshRenewLease({ leaseKey, holderNodeId, fencingToken, ttlSeconds });
    console.log(JSON.stringify(result, null, 2));
    await pause();
    return;
  }

  if (action === "release") {
    const leaseKey = await input({ message: "Lease key" });
    const holderNodeId = await input({ message: "Holder node ID" });
    const fencingToken = Number(await input({ message: "Fencing token" }));
    const confirmed = await confirm({ message: "Release lease?", default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.meshReleaseLease({ leaseKey, holderNodeId, fencingToken });
    console.log(JSON.stringify(result, null, 2));
    await pause();
    return;
  }

  if (action === "claim") {
    const sessionId = await input({ message: "Session ID" });
    const ownerNodeId = await input({ message: "Owner node ID" });
    const minEpoch = Number(await input({ message: "Min epoch", default: "0" }));
    const confirmed = await confirm({ message: "Claim session ownership?", default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.meshClaimSession(sessionId, { ownerNodeId, minEpoch });
    console.log(JSON.stringify(result, null, 2));
    await pause();
  }
}

async function viewSystem(client: TuiApiClient): Promise<void> {
  const [vitals, settings, events] = await Promise.all([
    client.systemVitals(),
    client.runtimeSettings(),
    client.listEvents(20),
  ]);
  console.log(chalk.bold("System Vitals"));
  console.table([vitals]);
  console.log(chalk.bold("Runtime Settings"));
  console.log(JSON.stringify(settings, null, 2));
  console.log(chalk.bold("Recent Realtime Events"));
  console.table(events.items.map((item) => ({
    timestamp: item.timestamp,
    eventType: item.eventType,
    source: item.source,
  })));
  await pause();
}

async function viewNpu(client: TuiApiClient): Promise<void> {
  const [status, models] = await Promise.all([
    client.npuStatus(),
    client.npuModels().catch(() => ({ items: [] })),
  ]);

  console.log(chalk.bold("NPU Runtime"));
  console.log(JSON.stringify(status, null, 2));
  if (models.items.length > 0) {
    console.log(chalk.bold("NPU Models"));
    console.table(
      models.items.map((model) => ({
        modelId: model.modelId,
        family: model.family,
        source: model.source,
        default: model.default,
        enabled: model.enabled,
        requiresQnn: model.requiresQnn,
      })),
    );
  }

  const action = await select({
    message: "NPU action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Configure runtime", value: "configure" },
      { name: "Start runtime", value: "start" },
      { name: "Stop runtime", value: "stop" },
      { name: "Refresh status", value: "refresh" },
    ],
  });

  if (action === "back") {
    return;
  }

  if (action === "start") {
    const confirmed = await confirm({ message: "Start NPU sidecar runtime?", default: true });
    if (!confirmed) {
      return;
    }
    const result = await client.npuStart();
    console.log(JSON.stringify(result, null, 2));
    await pause();
    return;
  }

  if (action === "stop") {
    const confirmed = await confirm({ message: "Stop NPU sidecar runtime?", default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.npuStop();
    console.log(JSON.stringify(result, null, 2));
    await pause();
    return;
  }

  if (action === "configure") {
    const settings = await client.runtimeSettings();
    const npu = (settings.npu ?? {}) as {
      enabled?: boolean;
      autoStart?: boolean;
      sidecarUrl?: string;
    };
    const enabled = await confirm({
      message: "Enable NPU runtime?",
      default: npu.enabled ?? false,
    });
    const autoStart = await confirm({
      message: "Auto-start NPU sidecar on gateway boot?",
      default: npu.autoStart ?? false,
    });
    const sidecarUrl = await input({
      message: "NPU sidecar URL",
      default: npu.sidecarUrl ?? "http://127.0.0.1:11440",
    });
    const confirmed = await confirm({
      message: "Apply NPU config update?",
      default: false,
    });
    if (!confirmed) {
      return;
    }
    const updated = await client.patchRuntimeSettings({
      npu: {
        enabled,
        autoStart,
        sidecarUrl,
      },
    });
    console.log(JSON.stringify(updated.npu ?? {}, null, 2));
    await pause();
    return;
  }

  const result = await client.npuRefresh();
  console.log(JSON.stringify(result, null, 2));
  await pause();
}

async function viewOnboarding(client: TuiApiClient): Promise<void> {
  const state = await client.onboardingState();
  console.log(chalk.bold("Onboarding State"));
  console.log(`Completed: ${state.completed ? "yes" : "no"}`);
  console.table(
    state.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      detail: item.detail,
    })),
  );

  const action = await select({
    message: "Onboarding action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Mark complete", value: "complete" },
      { name: "Run quick bootstrap", value: "bootstrap" },
    ],
  });
  if (action === "complete") {
    const confirmed = await confirm({ message: "Mark onboarding complete?", default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.onboardingComplete("tui-operator");
    console.log(`Onboarding completed: ${result.state.completed ? "yes" : "no"}`);
    await pause();
    return;
  }
  if (action === "bootstrap") {
    const defaultToolProfile = await select<"minimal" | "standard" | "coding" | "ops" | "research" | "danger">({
      message: "Default tool profile",
      choices: [
        { name: "minimal", value: "minimal" },
        { name: "standard", value: "standard" },
        { name: "coding", value: "coding" },
        { name: "ops", value: "ops" },
        { name: "research", value: "research" },
        { name: "danger", value: "danger" },
      ],
    });
    const budgetMode = await select<"saver" | "balanced" | "power">({
      message: "Budget mode",
      choices: [
        { name: "saver", value: "saver" },
        { name: "balanced", value: "balanced" },
        { name: "power", value: "power" },
      ],
    });
    const confirmed = await confirm({ message: "Apply quick bootstrap?", default: false });
    if (!confirmed) {
      return;
    }
    const result = await client.onboardingBootstrap({
      defaultToolProfile,
      budgetMode,
      markComplete: false,
      completedBy: "tui-operator",
    });
    console.log(`Bootstrap applied at ${result.appliedAt}`);
    await pause();
  }
}

async function viewSettings(
  client: TuiApiClient,
  profilePath: string,
  profileName: string,
): Promise<void> {
  const settings = await client.runtimeSettings();
  console.log(chalk.bold("Gateway Settings"));
  console.log(JSON.stringify(settings, null, 2));

  const action = await select({
    message: "Settings action",
    choices: [
      { name: "Back", value: "back" },
      { name: "Set budget mode", value: "budget" },
      { name: "Set default tool profile", value: "profile" },
      { name: "Save TUI local defaults", value: "save-local" },
    ],
  });
  if (action === "budget") {
    const budgetMode = await select({
      message: "Budget mode",
      choices: [
        { name: "saver", value: "saver" },
        { name: "balanced", value: "balanced" },
        { name: "power", value: "power" },
      ],
    });
    const confirmed = await confirm({ message: "Apply gateway budget mode update?", default: false });
    if (!confirmed) {
      return;
    }
    await client.patchRuntimeSettings({ budgetMode });
    console.log("Budget mode updated.");
    await pause();
    return;
  }

  if (action === "profile") {
    const defaultToolProfile = await select<"minimal" | "standard" | "coding" | "ops" | "research" | "danger">({
      message: "Default tool profile",
      choices: [
        { name: "minimal", value: "minimal" },
        { name: "standard", value: "standard" },
        { name: "coding", value: "coding" },
        { name: "ops", value: "ops" },
        { name: "research", value: "research" },
        { name: "danger", value: "danger" },
      ],
    });
    const confirmed = await confirm({ message: "Apply gateway tool profile update?", default: false });
    if (!confirmed) {
      return;
    }
    await client.patchRuntimeSettings({ defaultToolProfile });
    console.log("Default tool profile updated.");
    await pause();
    return;
  }

  if (action === "save-local") {
    const gatewayBaseUrl = await input({
      message: "Gateway URL",
      default: client.baseUrl,
    });
    const authMode = await select<"none" | "token" | "basic">({
      message: "Auth mode",
      choices: [
        { name: "none", value: "none" },
        { name: "token", value: "token" },
        { name: "basic", value: "basic" },
      ],
    });
    await saveProfile(profilePath, {
      gatewayBaseUrl,
      authMode,
      tokenQueryParam: "access_token",
      defaultScope: "operator",
      pollIntervalsMs: {
        dashboard: 5000,
        activity: 2500,
        approvals: 5000,
      },
      ui: {
        denseMode: false,
        confirmRiskyWrites: true,
        colorLevel: "auto",
      },
    });
    console.log(`Saved local profile "${profileName}" to ${profilePath}`);
    await pause();
  }
}

async function pause(): Promise<void> {
  await input({ message: "Press Enter to continue" });
}

main().catch((error) => {
  console.error(chalk.red("Terminal Mission Control failed."));
  console.error(error);
  process.exitCode = 1;
});
