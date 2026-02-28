# 03 - Major Findings

All findings rated **high** or **medium** severity. These represent security hardening needs, API contract issues, data reliability risks, and important correctness bugs.

---

## High Severity

### GC-SEC-004: Token Authentication Vulnerable to Timing Attack

- **Severity:** High | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/plugins/auth.ts:33,53`

**Root Cause:** JavaScript `!==` string comparison short-circuits at first differing byte. An attacker with network access and fine-grained timing can leak the token character by character.

**Recommended Fix:** Use `crypto.timingSafeEqual` with length-safe padding.

---

### GC-SEC-005: Loopback Bypass Collapses All Auth Behind Reverse Proxy

- **Severity:** High | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/plugins/auth.ts:143-146`

**Root Cause:** When behind a reverse proxy on `127.0.0.1`, `request.ip` is the proxy's address. With `allowLoopbackBypass: true`, ALL proxy-forwarded requests bypass auth. Also includes dead `"localhost"` branch (never returned by `request.ip`).

**Recommended Fix:** Remove `"localhost"` branch. Document that `allowLoopbackBypass` must be `false` behind proxies. Consider `X-Internal-Secret` header approach.

---

### GC-SEC-007: Shell Risk Gate Bypassable via Substring Avoidance

- **Severity:** High | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `packages/policy-engine/src/sandbox/shell-risk-gate.ts:6-17`

**Root Cause:** `classifyShellRisk` uses `lower.includes(pattern)` — plain substring search. Bypassed by shell quoting tricks (`$'rm\x20-rf'`), full paths (`/bin/rm`), or routing through interpreters (`python3 -c "..."`) not in the pattern list.

**Recommended Fix:** Always require approval for `shell.exec`; use pattern matching for risk-level display only, not as sole gating mechanism.

---

### GC-SEC-008: LLM API Key Persisted to Disk in Plaintext

- **Severity:** High | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/services/gateway-service.ts:1189-1193`, `apps/gateway/src/services/llm-service.ts:106-111`

**Root Cause:** `exportConfigFile()` includes `provider.apiKey` in plaintext, written to `config/llm-providers.json`. Any file-system reader or accidental git commit exposes keys.

**Recommended Fix:** Omit `apiKey` from persisted config. Store keys only in memory or via environment variables.

---

### GC-STO-003: Subagent Table Rebuild Migration Runs Complex DDL Without Guaranteed Atomicity

- **Severity:** High | **Confidence:** 92 | **False Positive Risk:** Very low
- **Affected Files:** `packages/storage/src/sqlite.ts:336-378`

**Root Cause:** Fallback rebuild path executes `DROP TABLE` + `RENAME` inside `db.exec()` with multiple SQL statements. A crash between these operations causes permanent data loss.

**Recommended Fix:** Wrap entire `migrate()` in a transaction. Implement schema versioning table.

---

### GC-STO-004: Concurrent JSONL Appends Can Corrupt Transcript Lines (Windows)

- **Severity:** High | **Confidence:** 85 | **False Positive Risk:** Low
- **Affected Files:** `packages/storage/src/transcript-log.ts:8-23`

**Root Cause:** `fs.appendFile` is not atomic for concurrent writers, especially on Windows where `O_APPEND` lacks the POSIX atomicity guarantee. Two concurrent appends to the same `.jsonl` file can interleave at byte level, producing unparseable lines.

**Recommended Fix:** Implement per-session in-memory write queue (`Map<sessionId, Promise>`).

---

### GC-STO-005: Transcript Offset TOCTOU — Returned Byte Offset Is Stale

- **Severity:** High | **Confidence:** 90 | **False Positive Risk:** Very low
- **Affected Files:** `packages/storage/src/transcript-log.ts:12-22`

**Root Cause:** `fs.stat()` reads file size, then `fs.appendFile()` writes. Between the two async operations, another append can change the size. Returned offset points to wrong position.

**Recommended Fix:** Use `fs.open()` with append mode, write, then compute offset as `stat.size - byteLength`.

---

### GC-STO-006: Cursor Pagination Drops Rows Sharing Timestamp at Page Boundary

- **Severity:** High | **Confidence:** 88 | **False Positive Risk:** Low
- **Affected Files:** `packages/storage/src/session-repo.ts:76-81`, `task-repo.ts:55-61`, `realtime-event-repo.ts:26-31`

**Root Cause:** `WHERE updated_at < @cursor` with `ORDER BY updated_at DESC` drops rows whose `updated_at` exactly equals the cursor value. If 5 sessions share a timestamp and page size is 3, the remaining 2 are silently dropped.

**Recommended Fix:** Use composite cursor `(updated_at, primary_key)` with tie-breaker comparison.

---

### GC-ORC-002: `approvePhase` Throws Unhandled Exception for Missing Phase

- **Severity:** High | **Confidence:** 85 | **False Positive Risk:** Low
- **Affected Files:** `packages/orchestration/src/engine.ts:175`

**Root Cause:** If `currentPhaseId` is not found in any wave (corrupted state, manual DB edit), `nextPhase` throws. Callers expect a return value, not an exception.

**Recommended Fix:** Return a failed run state instead of throwing, or document the exception contract.

---

### GC-ORC-003: `startRun` Bypasses Ownership Conflict Validation

- **Severity:** High | **Confidence:** 82 | **False Positive Risk:** Medium
- **Affected Files:** `packages/orchestration/src/engine.ts:35-64`

**Root Cause:** `createRun` calls `validate(plan)` including ownership conflict detection. `startRun` does not. If the plan is mutated between calls, conflicts are bypassed.

**Recommended Fix:** Call `validate(plan)` at the top of `startRun`.

---

### GC-SKL-002: `use <word>` Regex Produces Unbounded False Positives

- **Severity:** High | **Confidence:** 90 | **False Positive Risk:** Low
- **Affected Files:** `packages/skills/src/activation.ts:60-64`

**Root Cause:** Regex `/\buse\s+([a-z0-9_-]+)\b/g` matches common English: "use the", "use a", "use it". These phantom names are added to the explicit set and will silently match if a skill is ever named `a`, `it`, `the`.

**Recommended Fix:** Remove the `use <word>` pattern entirely or tighten to `use skill <name>`.

---

### GC-SKL-003: Skill Parse Errors Silently Swallowed

- **Severity:** High | **Confidence:** 87 | **False Positive Risk:** Low
- **Affected Files:** `packages/skills/src/loader.ts:50-67`

**Root Cause:** Inner `try/catch` catches all errors and `continue`s. No logging, no error accumulation. A directory with 10 skills where 3 have malformed frontmatter returns 7 skills with no indication.

**Recommended Fix:** Accumulate parse errors and surface them via a logger or return value.

---

### GC-API-004: `assignedAgentId` Cannot Be Cleared Once Set

- **Severity:** High | **Confidence:** 85 | **False Positive Risk:** Low-medium
- **Affected Files:** `apps/gateway/src/routes/tasks.ts:38`, `packages/contracts/src/tasks.ts:36`

**Root Cause:** Zod `.optional()` permits omission but not `null`. Sending `"assignedAgentId": null` is rejected. Once an agent is assigned, there's no API path to unassign.

**Recommended Fix:** Add `.nullable()` support: `z.string().min(1).nullable().optional()`.

---

### GC-API-005: Client Under-Declares `resolveApproval` Response Type

- **Severity:** High | **Confidence:** 82 | **False Positive Risk:** Low
- **Affected Files:** `apps/mission-control/src/api/client.ts:341`

**Root Cause:** Client's `executedAction` type is missing `auditEventId`, `approvalId`, `result`. `approval` is typed as `unknown`. Fields exist at runtime but TypeScript doesn't know.

**Recommended Fix:** Align client types with `ToolInvokeResult` from contracts.

---

### GC-API-006: `SessionsResponse` Missing 9 Fields from `SessionMeta` Contract

- **Severity:** High | **Confidence:** 80 | **False Positive Risk:** Medium
- **Affected Files:** `apps/mission-control/src/api/client.ts:64-74`

**Root Cause:** Client type declares only 6 of 15+ `SessionMeta` fields. Missing: `kind`, `channel`, `account`, `displayName`, `routingHints`, `lastActivityAt`, `tokenInput`, `tokenOutput`, `tokenCachedInput`, `budgetState`.

**Recommended Fix:** Import and reuse `SessionMeta` type from contracts.

---

## Medium Severity

### GC-SEC-009: `normalizeRelativePath` Doesn't Block Standalone `".."`

- **Severity:** Medium | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/services/gateway-service.ts:1157-1166`

Input `".."` passes all guards (`startsWith("../")` is false, `includes("/../")` is false, `isAbsolute` is false). Resolves to parent of workspace directory.

**Recommended Fix:** Add `normalized === ".."` and `normalized.endsWith("/..")` to rejection set.

---

### GC-SEC-010: Auth Credentials Written to `assistant.config.json` in Plaintext

- **Severity:** Medium | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/services/gateway-service.ts:1195-1211`

`persistAssistantConfig` serializes `auth.token.value` and `auth.basic.password` to disk.

**Recommended Fix:** Redact secret values when persisting; require env var sourcing.

---

### GC-SEC-011: HTTP Redirect from Allowed Domain Bypasses Network Guard

- **Severity:** Medium | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `packages/policy-engine/src/tool-executor.ts:45-59`

`fetch` follows redirects by default. Allowlist only checked against initial URL. Redirect to `http://192.168.1.1` bypasses the guard.

**Recommended Fix:** Set `redirect: "manual"` on fetch; re-check each redirect Location against allowlist.

---

### GC-SEC-012: Internal Error Messages Leaked to HTTP Clients

- **Severity:** Medium | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/routes/tasks.ts:205-213`

`sendTaskError` returns raw `Error.message` which may contain file paths, SQL details, or internal state.

**Recommended Fix:** Log full error server-side, return generic message for unexpected errors.

---

### GC-SEC-013: No Migration Versioning — DDL Runs Unconditionally

- **Severity:** Medium | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `packages/storage/src/sqlite.ts:25-298, 300`

No `schema_migrations` table. `DROP INDEX IF EXISTS` runs on every startup. No transaction boundary around the DDL block.

**Recommended Fix:** Implement numbered, versioned migration system.

---

### GC-STO-007: `update()` Cannot Clear Nullable Fields (Uses `??` Merge)

- **Severity:** Medium | **Confidence:** 83 | **False Positive Risk:** Low
- **Affected Files:** `packages/storage/src/task-repo.ts:128-141`, `integration-connection-repo.ts:114`

`input.description ?? current.description` ignores explicit `null`. Callers cannot clear fields.

**Recommended Fix:** Use `=== undefined` check to distinguish "not provided" from "explicitly null".

---

### GC-STO-008: No Foreign Keys on Audit Tables

- **Severity:** Medium | **Confidence:** 82 | **False Positive Risk:** Low
- **Affected Files:** `packages/storage/src/sqlite.ts:77-84`

`approval_events`, `tool_invocations`, `policy_blocks` have `approval_id`/`session_id` columns with no FK constraints. Orphaned events possible.

**Recommended Fix:** Add `FOREIGN KEY REFERENCES` with `ON DELETE CASCADE`.

---

### GC-STO-009: Cost Ledger Has No Deduplication Constraint

- **Severity:** Medium | **Confidence:** 80 | **False Positive Risk:** Moderate
- **Affected Files:** `packages/storage/src/sqlite.ts:122-133`

Deduplication depends entirely on upstream idempotency atomicity (GC-STO-001). If idempotency is bypassed, duplicate cost rows inflate totals.

**Recommended Fix:** Document the dependency; optionally add partial UNIQUE constraint.

---

## API Contract Diff Section

### Endpoint: `POST /api/v1/integrations/connections` (GC-API-001)
- **Declared:** 201 (per REST convention and all other POST creation routes)
- **Runtime:** 200
- **Mismatch:** Missing `.code(201)` in route handler

### Endpoint: `PATCH /api/v1/tasks/:taskId` (GC-API-002)
- **Declared:** `assignedAgentId: z.string().min(1).optional()` (createTaskSchema)
- **Runtime:** `assignedAgentId: z.string().optional()` (updateTaskSchema)
- **Mismatch:** PATCH allows empty string `""` which POST rejects

### Endpoint: `GET /api/v1/approvals` (GC-API-003)
- **Declared:** `status` should be one of `"pending" | "approved" | "rejected" | "edited"`
- **Runtime:** No Zod validation; any string passes through to SQL
- **Mismatch:** `?status=garbage` returns 200 with empty results instead of 400

### Endpoint: `PATCH /api/v1/tasks/:taskId` (GC-API-004)
- **Declared:** `assignedAgentId?: string` (no null support)
- **Runtime:** Once set, cannot be cleared to null/empty via API
- **Mismatch:** No path to unassign agent from task

### Endpoint: `POST /api/v1/approvals/:id/resolve` (GC-API-005)
- **Declared (client):** `executedAction?: { outcome: string; policyReason: string }`
- **Runtime (backend):** `executedAction?: ToolInvokeResult` (includes `auditEventId`, `approvalId`, `result`)
- **Mismatch:** Client type missing 3 fields

### Endpoint: `GET /api/v1/sessions` (GC-API-006)
- **Declared (client):** 6 fields on session items
- **Runtime (backend):** 15+ fields on `SessionMeta`
- **Mismatch:** Client type missing 9 fields including `kind`, `channel`, `budgetState`
