import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { buildApp } from "./app.js";

interface JsonResponse<T = unknown> {
  statusCode: number;
  body: T;
}

async function run(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "goatcitadel-smoke-"));
  const priorRoot = process.env.GOATCITADEL_ROOT_DIR;

  try {
    await cp(path.join(repoRoot, "config"), path.join(tempRoot, "config"), { recursive: true });
    await mkdir(path.join(tempRoot, "data", "transcripts"), { recursive: true });
    await mkdir(path.join(tempRoot, "data", "audit"), { recursive: true });
    await mkdir(path.join(tempRoot, "workspace"), { recursive: true });
    process.env.GOATCITADEL_ROOT_DIR = tempRoot;

    const app = await buildApp();
    try {
      await smokeHealth(app);
      await smokeGatewayEvents(app);
      await smokeSessions(app);
      await smokeTools(app);
      await smokeNativeToolsExpansion(app);
      await smokeApprovals(app);
      await smokeAgents(app);
      await smokeIntegrations(app);
      await smokeMesh(app);
      await smokeNpu(app);
      await smokeOnboarding(app);
      console.log("Smoke tests passed.");
    } finally {
      await app.close();
    }
  } finally {
    if (priorRoot === undefined) {
      delete process.env.GOATCITADEL_ROOT_DIR;
    } else {
      process.env.GOATCITADEL_ROOT_DIR = priorRoot;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function smokeHealth(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200, "health should return 200");
  const body = JSON.parse(res.body) as { status: string };
  assert.equal(body.status, "ok");
}

async function smokeGatewayEvents(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const payload = {
    eventId: `evt-${randomUUID()}`,
    route: {
      channel: "webchat",
      account: "operator",
      peer: "assistant",
    },
    actor: {
      type: "user",
      id: "operator",
    },
    message: {
      role: "user",
      content: "smoke test message",
    },
    usage: {
      inputTokens: 5,
      outputTokens: 2,
      costUsd: 0.0003,
    },
  };
  const headers = {
    "Idempotency-Key": "smoke-gateway-event-1",
  };

  const first = await postJson(app, "/api/v1/gateway/events", payload, headers);
  assert.equal(first.statusCode, 200);
  assert.equal((first.body as { deduped: boolean }).deduped, false);

  const second = await postJson(app, "/api/v1/gateway/events", payload, headers);
  assert.equal(second.statusCode, 200);
  assert.equal((second.body as { deduped: boolean }).deduped, true);
}

async function smokeSessions(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const res = await app.inject({ method: "GET", url: "/api/v1/sessions?limit=5" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { items: Array<{ sessionId: string; tokenTotal: number }> };
  assert.equal(body.items.length >= 1, true);
  assert.equal(typeof body.items[0]?.sessionId, "string");
  assert.equal(typeof body.items[0]?.tokenTotal, "number");
}

async function smokeTools(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const request = {
    toolName: "session.status",
    args: {},
    agentId: "architect",
    sessionId: "smoke-session",
  };
  const res = await postJson(app, "/api/v1/tools/invoke", request, {
    "Idempotency-Key": "smoke-tool-invoke-1",
  });
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { outcome: string }).outcome, "executed");
}

async function smokeNativeToolsExpansion(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const catalogRes = await app.inject({
    method: "GET",
    url: "/api/v1/tools/catalog",
  });
  assert.equal(catalogRes.statusCode, 200);
  const catalog = JSON.parse(catalogRes.body) as { items: Array<{ toolName: string }> };
  assert.equal(catalog.items.some((item) => item.toolName === "memory.write"), true);

  const createGrant = await postJson<{ grantId: string }>(
    app,
    "/api/v1/tools/grants",
    {
      toolPattern: "memory.write",
      decision: "allow",
      scope: "session",
      scopeRef: "smoke-knowledge-session",
      grantType: "persistent",
      createdBy: "smoke",
    },
    {
      "Idempotency-Key": "smoke-tool-grant-create-1",
    },
  );
  assert.equal(createGrant.statusCode, 201);
  assert.equal(typeof createGrant.body.grantId, "string");

  const evaluate = await postJson<{
    toolName: string;
    allowed: boolean;
    requiresApproval: boolean;
    reasonCodes: string[];
  }>(
    app,
    "/api/v1/tools/access/evaluate",
    {
      toolName: "memory.write",
      agentId: "architect",
      sessionId: "smoke-knowledge-session",
      args: {
        namespace: "smoke",
        title: "entry",
        content: "hello",
      },
    },
    {
      "Idempotency-Key": "smoke-tool-access-evaluate-1",
    },
  );
  assert.equal(evaluate.statusCode, 200);
  assert.equal(evaluate.body.allowed, true);

  const memoryWrite = await postJson<{
    mode: string;
    document: { docId: string };
    chunksSaved: number;
  }>(
    app,
    "/api/v1/knowledge/memory/write",
    {
      namespace: "smoke",
      title: "smoke-note",
      content: "smoke tools expansion check",
      sessionId: "smoke-knowledge-session",
      agentId: "architect",
    },
    {
      "Idempotency-Key": "smoke-knowledge-write-1",
    },
  );
  assert.equal(memoryWrite.statusCode, 200);
  assert.equal(memoryWrite.body.mode, "write");
  assert.equal(memoryWrite.body.chunksSaved >= 1, true);

  const createSearchGrant = await postJson<{ grantId: string }>(
    app,
    "/api/v1/tools/grants",
    {
      toolPattern: "memory.search",
      decision: "allow",
      scope: "session",
      scopeRef: "smoke-knowledge-session",
      grantType: "persistent",
      createdBy: "smoke",
    },
    {
      "Idempotency-Key": "smoke-tool-grant-create-2",
    },
  );
  assert.equal(createSearchGrant.statusCode, 201);

  const memorySearch = await postJson<{
    namespace: string;
    query: string;
    items: unknown[];
  }>(
    app,
    "/api/v1/knowledge/memory/search",
    {
      namespace: "smoke",
      query: "tools expansion",
      sessionId: "smoke-knowledge-session",
      agentId: "architect",
    },
    {
      "Idempotency-Key": "smoke-knowledge-search-1",
    },
  );
  assert.equal(memorySearch.statusCode, 200);
  assert.equal(Array.isArray(memorySearch.body.items), true);

  const commsSend = await postJson<{ outcome?: string }>(
    app,
    "/api/v1/comms/send",
    {
      connectionId: randomUUID(),
      target: "smoke",
      message: "test",
      sessionId: "smoke-comms-session",
      agentId: "architect",
    },
    {
      "Idempotency-Key": "smoke-comms-send-1",
    },
  );
  assert.equal(commsSend.statusCode, 200);
  assert.equal(commsSend.body.outcome, "blocked");
}

async function smokeApprovals(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const invalidList = await app.inject({
    method: "GET",
    url: "/api/v1/approvals?status=invalid",
  });
  assert.equal(invalidList.statusCode, 400);

  const created = await postJson(app, "/api/v1/approvals", {
    kind: "shell.exec",
    riskLevel: "danger",
    payload: { command: "dir" },
    preview: { command: "dir" },
  }, {
    "Idempotency-Key": "smoke-approval-create-1",
  });
  assert.equal(created.statusCode, 201);
  const approval = created.body as { approvalId: string; status: string };
  assert.equal(approval.status, "pending");

  const resolved = await postJson(
    app,
    `/api/v1/approvals/${approval.approvalId}/resolve`,
    {
      decision: "reject",
      resolvedBy: "smoke-runner",
    },
    {
      "Idempotency-Key": "smoke-approval-resolve-1",
    },
  );
  assert.equal(resolved.statusCode, 200);
  assert.equal((resolved.body as { approval: { status: string } }).approval.status, "rejected");
}

async function smokeIntegrations(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const catalogRes = await app.inject({
    method: "GET",
    url: "/api/v1/integrations/catalog?kind=channel",
  });
  assert.equal(catalogRes.statusCode, 200);
  const catalog = JSON.parse(catalogRes.body) as { items: Array<{ catalogId: string }> };
  const first = catalog.items[0];
  assert.ok(first, "catalog should return at least one entry");

  const created = await postJson(
    app,
    "/api/v1/integrations/connections",
    {
      catalogId: first.catalogId,
      label: "Smoke Connection",
      enabled: true,
      status: "connected",
      config: {},
    },
    {
      "Idempotency-Key": "smoke-integration-create-1",
    },
  );
  assert.equal(created.statusCode, 201);
}

async function smokeAgents(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const initial = await app.inject({
    method: "GET",
    url: "/api/v1/agents?view=active&limit=100",
  });
  assert.equal(initial.statusCode, 200);
  const initialBody = JSON.parse(initial.body) as {
    items: Array<{ agentId: string; roleId: string; isBuiltin: boolean }>;
  };
  assert.equal(initialBody.items.length >= 1, true);

  const builtIn = initialBody.items.find((item) => item.roleId === "architect");
  assert.ok(builtIn, "architect builtin should be seeded");

  const created = await postJson<{ agentId: string; roleId: string; lifecycleStatus: string }>(
    app,
    "/api/v1/agents",
    {
      roleId: "smoke-custom",
      name: "Smoke Custom Goat",
      title: "Smoke Specialist",
      summary: "Created by smoke test",
      specialties: ["Smoke"],
      aliases: ["smoke"],
      defaultTools: ["memory.read"],
    },
    {
      "Idempotency-Key": "smoke-agent-create-1",
    },
  );
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.roleId, "smoke-custom");
  const customAgentId = created.body.agentId;

  const updated = await app.inject({
    method: "PATCH",
    url: `/api/v1/agents/${customAgentId}`,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-agent-update-1",
    },
    payload: JSON.stringify({
      title: "Smoke Specialist Updated",
      summary: "Updated by smoke test",
    }),
  });
  assert.equal(updated.statusCode, 200);

  const archived = await app.inject({
    method: "POST",
    url: `/api/v1/agents/${customAgentId}/archive`,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-agent-archive-1",
    },
    payload: JSON.stringify({
      archivedBy: "smoke",
      archiveReason: "smoke coverage",
    }),
  });
  assert.equal(archived.statusCode, 200);

  const restore = await app.inject({
    method: "POST",
    url: `/api/v1/agents/${customAgentId}/restore`,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-agent-restore-1",
    },
    payload: JSON.stringify({}),
  });
  assert.equal(restore.statusCode, 200);

  const builtInDeleteAttempt = await app.inject({
    method: "DELETE",
    url: `/api/v1/agents/${builtIn.agentId}?mode=hard`,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-agent-delete-built-in-1",
    },
    payload: JSON.stringify({}),
  });
  assert.equal(builtInDeleteAttempt.statusCode, 409);

  const deleted = await app.inject({
    method: "DELETE",
    url: `/api/v1/agents/${customAgentId}?mode=hard`,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-agent-delete-custom-1",
    },
    payload: JSON.stringify({}),
  });
  assert.equal(deleted.statusCode, 200);
}

async function smokeMesh(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const statusRes = await app.inject({
    method: "GET",
    url: "/api/v1/mesh/status",
  });
  assert.equal(statusRes.statusCode, 200);
  const status = JSON.parse(statusRes.body) as { enabled: boolean; localNodeId: string };
  assert.equal(typeof status.enabled, "boolean");
  assert.equal(typeof status.localNodeId, "string");

  const nodesRes = await app.inject({
    method: "GET",
    url: "/api/v1/mesh/nodes?limit=10",
  });
  assert.equal(nodesRes.statusCode, 200);
  const nodes = JSON.parse(nodesRes.body) as { items: Array<{ nodeId: string }> };
  assert.equal(nodes.items.length >= 1, true);
}

async function smokeNpu(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const statusRes = await app.inject({
    method: "GET",
    url: "/api/v1/npu/status",
  });
  assert.equal(statusRes.statusCode, 200);
  const status = JSON.parse(statusRes.body) as {
    enabled: boolean;
    sidecarUrl: string;
    processState: string;
  };
  assert.equal(typeof status.enabled, "boolean");
  assert.equal(typeof status.sidecarUrl, "string");
  assert.equal(typeof status.processState, "string");
}

async function smokeOnboarding(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const initial = await app.inject({
    method: "GET",
    url: "/api/v1/onboarding/state",
  });
  assert.equal(initial.statusCode, 200);
  const initialBody = JSON.parse(initial.body) as {
    completed: boolean;
    checklist: Array<{ id: string; status: string }>;
  };
  assert.equal(Array.isArray(initialBody.checklist), true);

  const bootstrap = await postJson(app, "/api/v1/onboarding/bootstrap", {
    budgetMode: "balanced",
    defaultToolProfile: "minimal",
    networkAllowlist: ["127.0.0.1", "localhost"],
    markComplete: true,
    completedBy: "smoke",
  }, {
    "Idempotency-Key": "smoke-onboarding-bootstrap-1",
  });
  assert.equal(bootstrap.statusCode, 200);
  const bootstrapBody = bootstrap.body as {
    appliedAt: string;
    state: { completed: boolean };
  };
  assert.equal(typeof bootstrapBody.appliedAt, "string");
  assert.equal(bootstrapBody.state.completed, true);
}

async function postJson<T>(
  app: Awaited<ReturnType<typeof buildApp>>,
  url: string,
  payload: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<JsonResponse<T>> {
  const res = await app.inject({
    method: "POST",
    url,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    payload: JSON.stringify(payload),
  });

  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as T,
  };
}

run().catch((error) => {
  console.error("Smoke tests failed.");
  console.error(error);
  process.exitCode = 1;
});
