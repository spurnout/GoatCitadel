import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolInvokeRequest, ToolPolicyConfig } from "@goatcitadel/contracts";
import type { Storage } from "@goatcitadel/storage";
import { assertReadPathAllowed, assertWritePathInJail } from "./sandbox/path-jail.js";
import { assertHostAllowed } from "./sandbox/network-guard.js";
import { executeBrowserTool, isBrowserToolName } from "./browser-tools.js";
import { classifyShellRisk } from "./sandbox/shell-risk-gate.js";
import {
  appendBankrActionAudit,
  applyBankrBudgetUsage,
  evaluateBankrActionPreview,
  readBankrSafetyPolicy,
} from "./bankr-guard.js";

const execFileAsync = promisify(execFile);
const MAX_HTTP_REDIRECTS = 5;

export async function executeTool(
  request: ToolInvokeRequest,
  config: ToolPolicyConfig,
  storage: Storage,
): Promise<Record<string, unknown>> {
  if (isBrowserToolName(request.toolName)) {
    return executeBrowserTool(request.toolName, request.args, config);
  }

  switch (request.toolName) {
    case "session.status":
      return { sessionId: request.sessionId, status: "ok" };
    case "time.now":
      return timeNow();
    case "bankr.status":
      return bankrStatus(storage);
    case "bankr.read":
      return bankrPrompt(request, storage, "read");
    case "bankr.write":
      return bankrPrompt(request, storage, "write");
    case "fs.read":
      return fsRead(request.args, config);
    case "fs.write":
      return fsWrite(request.args, config);
    case "fs.list":
      return fsList(request.args, config);
    case "fs.stat":
      return fsStat(request.args, config);
    case "fs.copy":
      return fsCopy(request.args, config);
    case "fs.move":
      return fsMove(request.args, config);
    case "fs.delete":
      return fsDelete(request.args, config);
    case "http.get":
      return httpGet(request.args, config);
    case "http.post":
      return httpPost(request.args, config);
    case "shell.exec":
      return shellExec(request.args, config, request.consentContext?.reason);
    case "git.status":
      return gitStatus();
    case "git.diff":
      return gitDiff(request.args);
    case "git.add":
      return gitAdd(request.args, config);
    case "git.commit":
      return gitCommit(request.args);
    case "git.branch.create":
      return gitBranchCreate(request.args);
    case "git.branch.switch":
      return gitBranchSwitch(request.args);
    case "git.worktree.create":
      return gitWorktreeCreate(request.args, config);
    case "git.worktree.remove":
      return gitWorktreeRemove(request.args, config);
    case "tests.run":
      return runRestricted("test", request.args);
    case "lint.run":
      return runRestricted("lint", request.args);
    case "build.run":
      return runRestricted("build", request.args);
    case "memory.write":
      return memoryWrite(request.args, storage, false);
    case "memory.upsert":
      return memoryWrite(request.args, storage, true);
    case "memory.search":
      return memorySearch(request.args, storage);
    case "docs.ingest":
      return docsIngest(request.args, config, storage);
    case "embeddings.index":
      return embeddingsIndex(request.args, storage);
    case "embeddings.query":
      return embeddingsQuery(request.args, storage);
    case "artifacts.create":
      return artifactsCreate(request.args, config);
    case "channel.send":
    case "webhook.send":
    case "gmail.read":
    case "gmail.send":
    case "calendar.list":
    case "calendar.create_event":
    case "discord.send":
    case "slack.send":
      return commsInvoke(request.toolName, request.args, config, storage);
    default:
      return { simulated: true, toolName: request.toolName };
  }
}

function timeNow() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    epochMs: now.getTime(),
  };
}

async function bankrStatus(storage: Storage) {
  const policy = readBankrSafetyPolicy(storage);
  const cliAvailable = await hasBankrCli();
  return {
    cliAvailable,
    policy,
  };
}

async function bankrPrompt(
  request: ToolInvokeRequest,
  storage: Storage,
  mode: "read" | "write",
) {
  const preview = evaluateBankrActionPreview(storage, {
    ...(request.args as Record<string, unknown>),
    sessionId: request.sessionId,
    actorId: request.agentId,
  });

  if (mode === "read" && preview.normalized.actionType !== "read") {
    appendBankrActionAudit(storage, {
      sessionId: request.sessionId,
      actorId: request.agentId,
      actionType: preview.normalized.actionType,
      chain: preview.normalized.chain,
      symbol: preview.normalized.symbol,
      usdEstimate: preview.normalized.usdEstimate,
      status: "blocked",
      policyReason: "bankr.read only supports read actions",
      details: { requestedMode: mode, normalized: preview.normalized },
    });
    throw new Error(
      "bankr.read only supports read actions. Use bankr.write for trade/transfer/sign/submit/deploy.",
    );
  }

  if (mode === "write" && preview.normalized.actionType === "read") {
    appendBankrActionAudit(storage, {
      sessionId: request.sessionId,
      actorId: request.agentId,
      actionType: "read",
      chain: preview.normalized.chain,
      symbol: preview.normalized.symbol,
      usdEstimate: preview.normalized.usdEstimate,
      status: "blocked",
      policyReason: "bankr.write received read-like request",
      details: { requestedMode: mode, normalized: preview.normalized },
    });
    throw new Error("bankr.write requires a money-moving action intent.");
  }

  if (!preview.allowed) {
    appendBankrActionAudit(storage, {
      sessionId: request.sessionId,
      actorId: request.agentId,
      actionType: preview.normalized.actionType,
      chain: preview.normalized.chain,
      symbol: preview.normalized.symbol,
      usdEstimate: preview.normalized.usdEstimate,
      status: "blocked",
      policyReason: `${preview.reasonCode}: ${preview.reason}`,
      details: { preview },
    });
    throw new Error(`Bankr policy blocked action: ${preview.reason}`);
  }

  if (!(await hasBankrCli())) {
    appendBankrActionAudit(storage, {
      sessionId: request.sessionId,
      actorId: request.agentId,
      actionType: preview.normalized.actionType,
      chain: preview.normalized.chain,
      symbol: preview.normalized.symbol,
      usdEstimate: preview.normalized.usdEstimate,
      status: "failed",
      policyReason: "bankr_cli_missing",
    });
    throw new Error("Bankr CLI not found. Install @bankr/cli and authenticate before invoking bankr tools.");
  }

  const prompt = required(
    request.args.prompt ?? request.args.content ?? request.args.text,
    "prompt",
  );
  const cliArgs = ["prompt"];
  if (asBoolean(request.args.continue, false)) {
    cliArgs.push("--continue");
  } else {
    const threadId = asString(request.args.threadId);
    if (threadId) {
      cliArgs.push("--thread", threadId);
    }
  }
  cliArgs.push(prompt);

  try {
    const { stdout, stderr } = await execFileAsync("bankr", cliArgs, {
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });

    let dailyUsageUsdAfter = preview.dailyUsageUsd;
    if (mode === "write" && Number.isFinite(preview.normalized.usdEstimate)) {
      dailyUsageUsdAfter = applyBankrBudgetUsage(
        storage,
        Number(preview.normalized.usdEstimate),
      );
    }

    appendBankrActionAudit(storage, {
      sessionId: request.sessionId,
      actorId: request.agentId,
      actionType: preview.normalized.actionType,
      chain: preview.normalized.chain,
      symbol: preview.normalized.symbol,
      usdEstimate: preview.normalized.usdEstimate,
      status: "executed",
      policyReason: "executed",
      details: {
        command: ["bankr", ...cliArgs],
        stdout: stdout.slice(0, 12000),
        stderr: stderr.slice(0, 4000),
        dailyUsageUsdAfter,
      },
    });

    return {
      mode,
      actionType: preview.normalized.actionType,
      chain: preview.normalized.chain,
      symbol: preview.normalized.symbol,
      usdEstimate: preview.normalized.usdEstimate,
      stdoutSnippet: stdout.slice(0, 12000),
      stderrSnippet: stderr.slice(0, 4000),
      dailyUsageUsdAfter,
    };
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      message: string;
      code?: number | string;
    };
    appendBankrActionAudit(storage, {
      sessionId: request.sessionId,
      actorId: request.agentId,
      actionType: preview.normalized.actionType,
      chain: preview.normalized.chain,
      symbol: preview.normalized.symbol,
      usdEstimate: preview.normalized.usdEstimate,
      status: "failed",
      policyReason: "cli_execution_failed",
      details: {
        command: ["bankr", ...cliArgs],
        code: err.code,
        stdout: (err.stdout ?? "").slice(0, 12000),
        stderr: (err.stderr ?? err.message).slice(0, 4000),
      },
    });
    throw new Error(`Bankr command failed: ${err.stderr ?? err.message}`);
  }
}

async function hasBankrCli(): Promise<boolean> {
  try {
    await execFileAsync("bankr", ["--version"], {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 256 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function fsRead(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = required(args.path, "path");
  assertReadPathAllowed(p, config.sandbox.writeJailRoots, config.sandbox.readOnlyRoots);
  const content = await fs.readFile(path.resolve(p), "utf8");
  return { path: path.resolve(p), bytes: content.length, content };
}

async function fsWrite(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = required(args.path, "path");
  const content = String(args.content ?? "");
  assertWritePathInJail(p, config.sandbox.writeJailRoots);
  const full = path.resolve(p);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return { path: full, bytesWritten: content.length };
}

async function fsList(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = asString(args.path) ?? ".";
  assertReadPathAllowed(p, config.sandbox.writeJailRoots, config.sandbox.readOnlyRoots);
  const full = path.resolve(p);
  const items = await fs.readdir(full, { withFileTypes: true });
  return {
    path: full,
    items: items.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other",
    })),
  };
}

async function fsStat(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = required(args.path, "path");
  assertReadPathAllowed(p, config.sandbox.writeJailRoots, config.sandbox.readOnlyRoots);
  const full = path.resolve(p);
  const stat = await fs.stat(full);
  return {
    path: full,
    isFile: stat.isFile(),
    isDirectory: stat.isDirectory(),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

async function fsCopy(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const from = required(args.from, "from");
  const to = required(args.to, "to");
  assertReadPathAllowed(from, config.sandbox.writeJailRoots, config.sandbox.readOnlyRoots);
  assertWritePathInJail(to, config.sandbox.writeJailRoots);
  const fullTo = path.resolve(to);
  await fs.mkdir(path.dirname(fullTo), { recursive: true });
  await fs.copyFile(path.resolve(from), fullTo);
  return { from: path.resolve(from), to: fullTo };
}

async function fsMove(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const from = required(args.from, "from");
  const to = required(args.to, "to");
  assertWritePathInJail(from, config.sandbox.writeJailRoots);
  assertWritePathInJail(to, config.sandbox.writeJailRoots);
  const fullTo = path.resolve(to);
  await fs.mkdir(path.dirname(fullTo), { recursive: true });
  await fs.rename(path.resolve(from), fullTo);
  return { from: path.resolve(from), to: fullTo };
}

async function fsDelete(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = required(args.path, "path");
  assertWritePathInJail(p, config.sandbox.writeJailRoots);
  await fs.rm(path.resolve(p), { recursive: asBoolean(args.recursive, false), force: false });
  return { path: path.resolve(p), deleted: true };
}

async function httpGet(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const url = required(args.url, "url");
  const res = await fetchAllowlisted(url, { method: "GET" }, config.sandbox.networkAllowlist);
  const text = await res.response.text();
  return { url: res.finalUrl, status: res.response.status, bodySnippet: text.slice(0, 4000) };
}

async function httpPost(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const url = required(args.url, "url");
  const body = JSON.stringify(args.body ?? {});
  const res = await fetchAllowlisted(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
    config.sandbox.networkAllowlist,
  );
  const text = await res.response.text();
  return { url: res.finalUrl, status: res.response.status, bodySnippet: text.slice(0, 4000) };
}

async function shellExec(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
  consentReason?: string,
) {
  const command = required(args.command, "command");
  const shellRisk = classifyShellRisk(command, config.sandbox.riskyShellPatterns);
  const approvalBypass = typeof consentReason === "string" && consentReason.startsWith("approval:");
  if (shellRisk.risky && config.sandbox.requireApprovalForRiskyShell && !approvalBypass) {
    throw new Error(
      `Risky shell command requires approval (matched pattern: ${shellRisk.matchedPattern ?? "unknown"})`,
    );
  }
  const parsed = parseExecFileCommand(command);
  try {
    const { stdout, stderr } = await execFileAsync(parsed.file, parsed.args, {
      timeout: 20000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return {
      command,
      executable: parsed.file,
      argv: parsed.args,
      stdout: stdout.slice(0, 8000),
      stderr: stderr.slice(0, 8000),
      exitCode: 0,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number | string; message: string };
    return {
      command,
      executable: parsed.file,
      argv: parsed.args,
      stdout: (err.stdout ?? "").slice(0, 8000),
      stderr: (err.stderr ?? err.message).slice(0, 8000),
      exitCode: typeof err.code === "number" ? err.code : -1,
    };
  }
}

async function gitStatus() {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "--branch"], { timeout: 15000, windowsHide: true });
  return { summary: stdout.slice(0, 10000) };
}

async function gitDiff(args: Record<string, unknown>) {
  const staged = asBoolean(args.staged, false);
  const { stdout } = await execFileAsync("git", staged ? ["diff", "--cached"] : ["diff"], { timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  return { staged, diffSnippet: stdout.slice(0, 12000), truncated: stdout.length > 12000 };
}

async function gitAdd(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const paths = stringArray(args.paths);
  for (const p of paths) {
    if (p !== ".") {
      assertWritePathInJail(path.resolve(p), config.sandbox.writeJailRoots);
    }
  }
  await execFileAsync("git", ["add", ...(paths.length > 0 ? paths : ["."])], { timeout: 15000, windowsHide: true });
  return { staged: paths.length > 0 ? paths : ["."] };
}

async function gitCommit(args: Record<string, unknown>) {
  const message = required(args.message, "message");
  const { stdout } = await execFileAsync("git", ["commit", "-m", message], { timeout: 20000, windowsHide: true });
  return { committed: true, output: stdout.slice(0, 4000) };
}

async function gitBranchCreate(args: Record<string, unknown>) {
  const branch = required(args.branch, "branch");
  await execFileAsync("git", ["branch", branch], { timeout: 10000, windowsHide: true });
  return { created: true, branch };
}

async function gitBranchSwitch(args: Record<string, unknown>) {
  const branch = required(args.branch, "branch");
  await execFileAsync("git", ["switch", branch], { timeout: 15000, windowsHide: true });
  return { switched: true, branch };
}

async function gitWorktreeCreate(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = required(args.path, "path");
  const branch = required(args.branch, "branch");
  assertWritePathInJail(p, config.sandbox.writeJailRoots);
  await execFileAsync("git", ["worktree", "add", p, branch], { timeout: 30000, windowsHide: true });
  return { created: true, path: path.resolve(p), branch };
}

async function gitWorktreeRemove(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = required(args.path, "path");
  assertWritePathInJail(p, config.sandbox.writeJailRoots);
  await execFileAsync("git", ["worktree", "remove", p, "--force"], { timeout: 30000, windowsHide: true });
  return { removed: true, path: path.resolve(p) };
}

async function runRestricted(kind: "test" | "lint" | "build", args: Record<string, unknown>) {
  const manager = asString(args.manager) ?? "pnpm";
  const filter = asString(args.filter);
  if (filter && !/^[a-zA-Z0-9@/_\-.]+$/.test(filter)) {
    throw new Error(`Invalid filter: ${filter}`);
  }
  if (manager !== "pnpm" && manager !== "npm") {
    throw new Error("Only pnpm/npm are allowed");
  }
  const cmdArgs = manager === "pnpm"
    ? [...(filter ? ["--filter", filter] : []), kind]
    : ["run", kind];
  const { stdout, stderr } = await execFileAsync(manager, cmdArgs, { timeout: 120000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  return { manager, kind, stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 10000) };
}

async function memoryWrite(args: Record<string, unknown>, storage: Storage, upsert: boolean) {
  const namespace = required(args.namespace, "namespace");
  const title = required(args.title, "title");
  const content = required(args.content, "content");
  const doc = storage.knowledge.createDocument({
    namespace,
    sourceType: "memory",
    sourceRef: upsert ? `upsert:${namespace}:${title}` : `memory:${Date.now()}`,
    title,
    metadata: {
      tags: stringArray(args.tags),
      ...(record(args.metadata)),
    },
  });
  const chunks = chunkText(content, 1200, 180, 400);
  storage.knowledge.appendChunks(doc.docId, chunks.map((chunk) => ({
    content: chunk,
    embedding: pseudoEmbedding(chunk),
  })));
  return {
    mode: upsert ? "upsert" : "write",
    document: doc,
    chunksSaved: chunks.length,
  };
}

async function memorySearch(args: Record<string, unknown>, storage: Storage) {
  const query = required(args.query, "query").toLowerCase();
  const namespace = asString(args.namespace);
  const limit = clampInt(args.limit, 12, 1, 100);
  const chunks = storage.knowledge.listChunksByNamespace(namespace, 2000);
  const items = chunks
    .map((chunk) => ({
      chunkId: chunk.chunkId,
      docId: chunk.docId,
      score: scoreLexical(query, chunk.content.toLowerCase()),
      snippet: chunk.content.slice(0, 320),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { namespace: namespace ?? "all", query, items };
}

async function docsIngest(args: Record<string, unknown>, config: ToolPolicyConfig, storage: Storage) {
  const sourceType = required(args.sourceType, "sourceType");
  const source = required(args.source, "source");
  const namespace = required(args.namespace, "namespace");
  let text = "";
  if (sourceType === "file") {
    assertReadPathAllowed(source, config.sandbox.writeJailRoots, config.sandbox.readOnlyRoots);
    text = await fs.readFile(path.resolve(source), "utf8");
  } else if (sourceType === "url") {
    const res = await fetchAllowlisted(source, { method: "GET" }, config.sandbox.networkAllowlist);
    text = await res.response.text();
  } else if (sourceType === "text") {
    text = source;
  } else {
    throw new Error(`Unsupported sourceType: ${sourceType}`);
  }
  const chunking = record(args.chunking);
  const chunks = chunkText(
    text,
    clampInt(chunking.targetChars, 1200, 300, 3000),
    clampInt(chunking.overlapChars, 180, 0, 900),
    clampInt(chunking.maxChunks, 400, 1, 2000),
  );
  const doc = storage.knowledge.createDocument({
    namespace,
    sourceType: sourceType as "file" | "url" | "text",
    sourceRef: source,
    title: asString(args.title) ?? `${sourceType}:${source.slice(0, 64)}`,
    metadata: record(args.metadata),
  });
  storage.knowledge.appendChunks(doc.docId, chunks.map((chunk) => ({
    content: chunk,
    embedding: pseudoEmbedding(chunk),
  })));
  return { document: doc, chunksSaved: chunks.length };
}

async function embeddingsIndex(args: Record<string, unknown>, storage: Storage) {
  const namespace = asString(args.namespace);
  const documentId = asString(args.documentId);
  const force = asBoolean(args.force, false);
  const chunks = documentId
    ? storage.knowledge.listChunksByDocument(documentId, 2000)
    : storage.knowledge.listChunksByNamespace(namespace, 2000);
  let indexed = 0;
  for (const chunk of chunks) {
    if (!chunk.embedding || force) {
      storage.knowledge.updateChunkEmbedding(chunk.chunkId, pseudoEmbedding(chunk.content));
      indexed += 1;
    }
  }
  return { namespace: namespace ?? "all", documentId, indexed };
}

async function embeddingsQuery(args: Record<string, unknown>, storage: Storage) {
  const namespace = asString(args.namespace);
  const query = required(args.query, "query");
  const limit = clampInt(args.limit, 10, 1, 100);
  const q = pseudoEmbedding(query);
  const chunks = storage.knowledge.listChunksByNamespace(namespace, 2000);
  const items = chunks
    .map((chunk) => ({
      chunkId: chunk.chunkId,
      docId: chunk.docId,
      score: cosine(q, chunk.embedding ?? pseudoEmbedding(chunk.content)),
      snippet: chunk.content.slice(0, 320),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { namespace: namespace ?? "all", query, items, method: "pseudo-embedding" };
}

async function artifactsCreate(args: Record<string, unknown>, config: ToolPolicyConfig) {
  const p = required(args.path, "path");
  assertWritePathInJail(p, config.sandbox.writeJailRoots);
  const title = asString(args.title) ?? "Artifact";
  const template = asString(args.template) ?? "report";
  const body = asString(args.body) ?? "";
  const out = [
    `# ${title}`,
    "",
    `Template: ${template}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    body || "_No content provided._",
    "",
  ].join("\n");
  const full = path.resolve(p);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, out, "utf8");
  return { path: full, bytesWritten: out.length, template };
}

async function commsInvoke(
  toolName: string,
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
  storage: Storage,
) {
  const connectionId = required(args.connectionId, "connectionId");
  const connection = storage.integrationConnections.get(connectionId);
  const target = asString(args.target) ?? connection.key;
  const message = asString(args.message) ?? "";
  const queued = storage.commsDeliveries.createQueued({
    connectionId,
    channelKey: connection.key,
    target,
    payload: { toolName, args },
  });
  try {
    if (toolName === "gmail.read") {
      const records = await gmailRead(connection.config, args, config.sandbox.networkAllowlist);
      storage.commsDeliveries.markSent(queued.deliveryId, "gmail-read");
      return { ...queued, status: "sent", providerMessageId: "gmail-read", records };
    }
    if (toolName === "calendar.list") {
      const records = await calendarList(connection.config, args, config.sandbox.networkAllowlist);
      storage.commsDeliveries.markSent(queued.deliveryId, "calendar-list");
      return { ...queued, status: "sent", providerMessageId: "calendar-list", records };
    }
    const providerMessageId = await commsSend(toolName, connection.config, args, config.sandbox.networkAllowlist, target, message);
    storage.commsDeliveries.markSent(queued.deliveryId, providerMessageId);
    return { ...queued, status: "sent", providerMessageId, updatedAt: new Date().toISOString() };
  } catch (error) {
    const errorMessage = (error as Error).message;
    storage.commsDeliveries.markFailed(queued.deliveryId, errorMessage);
    return { ...queued, status: "failed", error: errorMessage, updatedAt: new Date().toISOString() };
  }
}

async function commsSend(
  toolName: string,
  connectionConfig: Record<string, unknown>,
  args: Record<string, unknown>,
  allowlist: string[],
  target: string,
  message: string,
): Promise<string> {
  if (toolName === "gmail.send") {
    return gmailSend(connectionConfig, args, allowlist);
  }
  if (toolName === "calendar.create_event") {
    return calendarCreate(connectionConfig, args, allowlist);
  }
  const webhookUrl = asString(args.url)
    ?? secretFrom(connectionConfig, "webhookUrl", "webhookUrlEnv")
    ?? secretFrom(connectionConfig, "url", "urlEnv");
  if (!webhookUrl) {
    throw new Error("Missing webhook URL");
  }
  const payload = toolName === "discord.send"
    ? { content: message }
    : { text: message, target, payload: record(args.payload) };
  const res = await fetchAllowlisted(
    webhookUrl,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    allowlist,
  );
  if (!res.response.ok) {
    throw new Error(`${toolName} failed (${res.response.status})`);
  }
  return `${toolName}-${Date.now()}`;
}

async function gmailRead(config: Record<string, unknown>, args: Record<string, unknown>, allowlist: string[]) {
  const token = secretFrom(config, "accessToken", "accessTokenEnv");
  if (!token) {
    throw new Error("Missing Gmail access token");
  }
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  if (asString(args.query)) {
    url.searchParams.set("q", asString(args.query) as string);
  }
  url.searchParams.set("maxResults", String(clampInt(args.maxResults, 10, 1, 50)));
  const res = await fetchAllowlisted(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}` } }, allowlist);
  const body = await res.response.text();
  if (!res.response.ok) {
    throw new Error(`gmail.read failed (${res.response.status})`);
  }
  return (JSON.parse(body) as { messages?: unknown[] }).messages ?? [];
}

async function gmailSend(config: Record<string, unknown>, args: Record<string, unknown>, allowlist: string[]) {
  const token = secretFrom(config, "accessToken", "accessTokenEnv");
  if (!token) {
    throw new Error("Missing Gmail access token");
  }
  const to = stringArray(args.to);
  if (to.length === 0) {
    throw new Error("gmail.send requires args.to");
  }
  const subject = required(args.subject, "subject");
  const bodyText = required(args.bodyText, "bodyText");
  const rawMessage = [`To: ${to.join(", ")}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=\"UTF-8\"", "", bodyText].join("\r\n");
  const raw = Buffer.from(rawMessage).toString("base64url");
  const res = await fetchAllowlisted(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ raw }) },
    allowlist,
  );
  const body = await res.response.text();
  if (!res.response.ok) {
    throw new Error(`gmail.send failed (${res.response.status})`);
  }
  return (JSON.parse(body) as { id?: string }).id ?? `gmail-${Date.now()}`;
}

async function calendarList(config: Record<string, unknown>, args: Record<string, unknown>, allowlist: string[]) {
  const token = secretFrom(config, "accessToken", "accessTokenEnv");
  if (!token) {
    throw new Error("Missing Calendar access token");
  }
  const calendarId = encodeURIComponent(asString(args.calendarId) ?? "primary");
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  if (asString(args.fromIso)) url.searchParams.set("timeMin", asString(args.fromIso) as string);
  if (asString(args.toIso)) url.searchParams.set("timeMax", asString(args.toIso) as string);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(clampInt(args.maxResults, 10, 1, 100)));
  const res = await fetchAllowlisted(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}` } }, allowlist);
  const body = await res.response.text();
  if (!res.response.ok) {
    throw new Error(`calendar.list failed (${res.response.status})`);
  }
  return (JSON.parse(body) as { items?: unknown[] }).items ?? [];
}

async function calendarCreate(config: Record<string, unknown>, args: Record<string, unknown>, allowlist: string[]) {
  const token = secretFrom(config, "accessToken", "accessTokenEnv");
  if (!token) {
    throw new Error("Missing Calendar access token");
  }
  const calendarId = encodeURIComponent(asString(args.calendarId) ?? "primary");
  const payload = {
    summary: required(args.title, "title"),
    description: asString(args.description),
    start: { dateTime: required(args.startIso, "startIso"), timeZone: asString(args.timeZone) ?? "UTC" },
    end: { dateTime: required(args.endIso, "endIso"), timeZone: asString(args.timeZone) ?? "UTC" },
    attendees: stringArray(args.attendees).map((email) => ({ email })),
  };
  const res = await fetchAllowlisted(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) },
    allowlist,
  );
  const body = await res.response.text();
  if (!res.response.ok) {
    throw new Error(`calendar.create_event failed (${res.response.status})`);
  }
  return (JSON.parse(body) as { id?: string }).id ?? `calendar-${Date.now()}`;
}

async function fetchAllowlisted(
  url: string,
  init: RequestInit,
  allowlist: string[],
): Promise<{ response: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_HTTP_REDIRECTS; hop += 1) {
    assertHostAllowed(current, allowlist);
    const response = await fetch(current, { ...init, redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (!(response.status >= 300 && response.status < 400)) {
      return { response, finalUrl: current };
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Redirect missing location for ${current}`);
    }
    current = new URL(location, current).toString();
  }
  throw new Error(`Too many redirects for ${url}`);
}

function secretFrom(config: Record<string, unknown>, directKey: string, envKey: string): string | undefined {
  const direct = asString(config[directKey]);
  if (direct) return direct;
  const envName = asString(config[envKey]);
  if (!envName) return undefined;
  const envValue = process.env[envName];
  return envValue?.trim() || undefined;
}

function chunkText(text: string, targetChars: number, overlap: number, maxChunks: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  let cursor = 0;
  while (cursor < trimmed.length && out.length < maxChunks) {
    const end = Math.min(trimmed.length, cursor + targetChars);
    const chunk = trimmed.slice(cursor, end).trim();
    if (chunk) out.push(chunk);
    if (end >= trimmed.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }
  return out;
}

function pseudoEmbedding(text: string, dimensions = 64): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i += 1) {
    const index = lower.charCodeAt(i) % dimensions;
    vec[index] = (vec[index] ?? 0) + 1;
  }
  const mag = Math.sqrt(vec.reduce((acc, value) => acc + value * value, 0)) || 1;
  return vec.map((value) => value / mag);
}

function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  return dot / ((Math.sqrt(magA) * Math.sqrt(magB)) || 1);
}

function scoreLexical(query: string, candidate: string): number {
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (candidate.includes(token)) hits += 1;
  }
  return hits / tokens.length;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function required(value: unknown, field: string): string {
  const parsed = asString(value);
  if (!parsed) throw new Error(`${field} is required`);
  return parsed;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseExecFileCommand(command: string): { file: string; args: string[] } {
  const input = command.trim();
  if (!input) {
    throw new Error("shell.exec command is required");
  }
  if (input.includes("\u0000")) {
    throw new Error("shell.exec command contains invalid null byte");
  }

  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      const next = input[index + 1] ?? "";
      const escapable = next === "\"" || next === "'" || next === "\\" || /\s/.test(next);
      if (!escapable) {
        current += char;
        continue;
      }
      escaping = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === "\"" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping || inSingle || inDouble) {
    throw new Error("shell.exec command has unmatched quotes or escape sequence");
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  if (tokens.length === 0) {
    throw new Error("shell.exec command is required");
  }

  const file = tokens[0];
  if (!file) {
    throw new Error("shell.exec command is required");
  }
  const args = tokens.slice(1);
  return { file, args };
}
