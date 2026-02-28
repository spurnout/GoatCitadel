# 06 - Testing Gaps

## Current Test Inventory

| Module | Test File | Tests | Coverage |
|--------|-----------|-------|----------|
| `policy-resolver.ts` | `policy-resolver.test.ts` | 1 | Single happy path |
| `path-jail.ts` | `path-jail.test.ts` | 2 | Write jail only |
| `network-guard.ts` | `network-guard.test.ts` | 3 | Basic cases |
| `shell-risk-gate.ts` | `shell-risk-gate.test.ts` | 2 | Flag/no-flag |
| `session-key.ts` | `session-key.test.ts` | 3 | Key construction |
| `deps.ts` | `deps.test.ts` | 2 | Resolve + cycle |
| `precedence.ts` | `precedence.test.ts` | 1 | Single ordering |
| `engine.ts` (orch) | `engine.test.ts` | 1 | HITL happy path |
| `ownership-matrix.ts` | `ownership-matrix.test.ts` | 1 | Basic overlap |
| `approval-explainer-service.ts` | `approval-explainer-service.test.ts` | 5 | Good coverage |
| Storage repos | Various `*.test.ts` | ~1 each | Thin smoke tests |

## Zero-Test Modules (Critical Gaps)

- **All route handlers** — zero integration tests
- **`ToolPolicyEngine`** — the enforcement boundary between agents and system, 8 decision branches, none tested
- **`GatewayService`** — the orchestrating service layer, untested
- **`EventIngestService`** — deduplication and transaction logic, untested
- **`LlmService`** — URL normalization, API key resolution, chat completions, untested
- **`ApprovalGate`** — approval creation logic, untested
- **`tool-executor.ts`** — actual tool execution dispatch, untested
- **`activation.ts`** — skill activation resolution, untested

---

## Prioritized Immediate Test Plan

### Test 1 (Critical): `ToolPolicyEngine.executeApprovedAction` — Policy Revocation After Approval

**File:** `packages/policy-engine/src/engine.test.ts`
**Why high value:** This is the most dangerous silent failure mode. An operator removes `fs.write` permission while a pending approval exists. Without this test, removing the re-check at engine.ts:72-88 would cause revoked tool invocations to execute silently.
**Failure mode caught:** Approved action executes after the underlying tool permission was revoked.

### Test 2 (Critical): `ToolPolicyEngine.invoke` — `fs.write` Outside Jail Is Blocked Before Approval Gate

**File:** `packages/policy-engine/src/engine.test.ts`
**Why high value:** If jail check and approval gate are reordered, an out-of-jail write creates an approvable request that, if approved, writes outside the jail.
**Failure mode caught:** Path traversal write escalated through approval workflow instead of immediately blocked.

### Test 3 (Critical): `EventIngestService` — Duplicate Idempotency Key Returns `deduped: true`

**File:** `packages/gateway-core/src/event-ingest.test.ts`
**Why high value:** Duplicate cost accounting manifests as inflated token cost totals in the dashboard. Retried events are common in channel integrations.
**Failure mode caught:** Duplicate transcript entries and double-counted costs.

### Test 4 (Critical): `assertReadPathAllowed` vs `assertExistingPathRealpathAllowed` — Symlink Traversal

**File:** `packages/policy-engine/src/path-jail.test.ts`
**Why high value:** Documents that `assertReadPathAllowed` does NOT follow symlinks (used by `fs.read` tool), while `assertExistingPathRealpathAllowed` does. Exposes that `tool-executor.ts:24` uses the wrong function.
**Failure mode caught:** Agent reads files outside workspace via symlink.

### Test 5 (High): `resolveEffectivePolicy` — Wildcard `"*"` Profile Allows Any Tool

**File:** `packages/policy-engine/src/policy-resolver.test.ts`
**Why high value:** The wildcard path (`effectiveTools.has("*")`) is a separate branch. If broken, trusted agents lose all tool access silently.
**Failure mode caught:** Agents configured with admin/wildcard profile denied all tools.

### Test 6 (High): `GatewayService.resolveApproval` — Double-Approve Returns Meaningful Error

**File:** `apps/gateway/src/services/gateway-service.test.ts`
**Why high value:** `approval-repo.ts:116` throws synchronously. Route handler must return 409, not 500. Without test, a refactor could swallow the error and return 200, executing a tool twice.
**Failure mode caught:** Approval resolved twice; tool executed twice; HTTP 500 instead of 409.

### Test 7 (High): `OrchestrationEngine.approvePhase` — Wrong phaseId Throws

**File:** `packages/orchestration/src/engine.test.ts`
**Why high value:** Guards against out-of-order approvals (race condition where two operators approve different phases simultaneously).
**Failure mode caught:** Out-of-order phase approval skips or duplicates execution.

### Test 8 (High): `LlmService` URL Normalization — No Double `/v1`

**File:** `apps/gateway/src/services/llm-service.test.ts`
**Why high value:** A provider URL with trailing slash (common user input) silently becomes `http://host/v1/v1/chat/completions` → 404 on every LLM call with no diagnostic.
**Failure mode caught:** Silent LLM call failure from common configuration error.

### Test 9 (High): Migration — Existing Approval Rows Survive Column Addition

**File:** `packages/storage/src/sqlite-migration-approvals.test.ts`
**Why high value:** Current test checks column existence, not data survival. If migration accidentally drops and recreates, all pending approvals vanish on upgrade.
**Failure mode caught:** Data loss on schema upgrade.

### Test 10 (High): Route — `PATCH /api/v1/tasks/:taskId` with `status: "done"` and No Deliverables Returns 409

**File:** `apps/gateway/src/routes/tasks.test.ts`
**Why high value:** `sendTaskError` uses string matching (`message.includes("Cannot mark task done")`). Any error message text change silently degrades 409 to 400. Impacts agents/UI checking HTTP status codes.
**Failure mode caught:** Incorrect HTTP status on business rule violation.

---

## Full Gap Table by Priority

| Priority | Module | Gap | Failure Mode |
|----------|--------|-----|--------------|
| Critical | `ToolPolicyEngine` | `executeApprovedAction` post-revocation check | Revoked tool executes |
| Critical | `ToolPolicyEngine` | `fs.write` jail blocks before approval gate | Out-of-jail write approvable |
| Critical | `EventIngestService` | Idempotency deduplication | Duplicate costs |
| Critical | `path-jail.ts` | Symlink traversal via `assertReadPathAllowed` | File read outside jail |
| High | `policy-resolver.ts` | Wildcard `"*"` profile | Trusted agents denied tools |
| High | `GatewayService` | Double-approve returns 500 not 409 | Tool double-execution |
| High | `OrchestrationEngine` | Wrong phaseId approval | Out-of-order execution |
| High | `LlmService` | URL trailing-slash normalization | Silent LLM 404s |
| High | Migration | Existing rows survive ADD COLUMN | Data loss on upgrade |
| High | Route handlers | `PATCH /tasks done` without deliverables | 409 degrades to 400 |
| Medium | `OrchestrationEngine` | Cost limit `>=` boundary | Plan doesn't stop at limit |
| Medium | `OrchestrationEngine` | Runtime minutes limit | Time-based stop untested |
| Medium | `OrchestrationEngine` | Cross-wave phase transition | Phase skip in multi-wave |
| Medium | `ownership-matrix.ts` | Same-agent overlap intentionally not conflict | Guard removal breaks agents |
| Medium | `LlmService` | Empty provider list at construction | Startup crash |
| Medium | `activation.ts` | `@skill` mention extraction | Can't activate skills by name |
| Low | `ApprovalRepository` | Re-resolve already-resolved approval | Correct error text |
| Low | `precedence.ts` | Tie-breaking by mtime within source | Non-deterministic selection |
