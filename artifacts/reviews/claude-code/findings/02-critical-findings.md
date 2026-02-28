# 02 - Critical Findings

All findings rated **critical** severity. These represent correctness bugs, security vulnerabilities, or data integrity issues that should be fixed before any production or shared-network deployment.

---

## GC-SEC-001: `fs.read` Path Jail Bypass via Symlink (No `realpathSync`)

- **Severity:** Critical | **Confidence:** High | **False Positive Risk:** Low — `assertReadPathAllowed` uses lexical `path.resolve`, not `fs.realpathSync`
- **Affected Files:** `packages/policy-engine/src/sandbox/path-jail.ts:9-16`, `packages/policy-engine/src/tool-executor.ts:22-31`

**Root Cause:** `assertReadPathAllowed` resolves paths with `path.resolve` (no I/O, no symlink resolution). An agent that creates a symlink inside a jail root pointing outside it can read arbitrary files. The correct function `assertExistingPathRealpathAllowed` exists (line 18-25) and is used for file downloads, but `fs.read` tool uses the wrong one.

**Reproduction:** Create symlink `ln -s /etc/passwd /jail/data/escape.txt` → `fs.read` on `/jail/data/escape.txt` → passes jail check → reads `/etc/passwd`.

**Exploitability:** Attacker needs agent with `fs.read` + ability to create symlinks. Blast radius: read any file accessible to Node process.

**Recommended Fix:** Replace `path.resolve` with `fs.realpathSync` in `assertReadPathAllowed`.

**Recommended Test:** Create symlink inside jail pointing outside → assert `assertReadPathAllowed` throws.

---

## GC-SEC-002: `fs.write` Path Jail Bypass via Symlink (Same Root Cause)

- **Severity:** Critical | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `packages/policy-engine/src/sandbox/path-jail.ts:4-7`, `packages/policy-engine/src/tool-executor.ts:36`

**Root Cause:** Same as GC-SEC-001 but for write paths. `assertWritePathInJail` uses `path.resolve` (lexical). A symlink inside jail pointing outside allows writing to arbitrary locations.

**Recommended Fix:** Resolve realpath of nearest existing ancestor directory before checking jail containment.

---

## GC-SEC-003: SSRF via User-Controlled LLM Provider `baseUrl`

- **Severity:** Critical | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/routes/dashboard.ts:22-30`, `apps/gateway/src/services/llm-service.ts:115-119`

**Root Cause:** `PATCH /api/v1/settings` accepts arbitrary `baseUrl` (validated only as a valid URL structure by Zod). The gateway then uses this URL for outbound `fetch` calls, sending the API key as a Bearer token. No private-IP blocklist, no scheme restriction beyond URL syntax.

**Exploitation:** Set `baseUrl` to `http://169.254.169.254/latest` → gateway fetches cloud metadata with API key in Authorization header.

**Exploitability:** Any authenticated caller (or loopback when bypass enabled). Blast radius: SSRF to internal network + API key exfiltration.

**Recommended Fix:** Validate `baseUrl` against private IP ranges, cloud metadata endpoints, and optionally restrict to HTTPS.

---

## GC-STO-001: Event Ingest Transaction Gap — Partial Writes on Failure

- **Severity:** Critical | **Confidence:** 95 | **False Positive Risk:** Very low
- **Affected Files:** `packages/gateway-core/src/event-ingest.ts:59-68, 95-132`

**Root Cause:** The idempotency row insertion and session upsert happen **before** `BEGIN`. The transaction only covers `applyUsage`, `tokenCostLedger.record`, and `markProcessed`. If the ledger insert fails, ROLLBACK cannot undo the already-committed session upsert or idempotency row, leaving inconsistent state: session token counters incremented but event not accepted.

**Recommended Fix:** Move all writes — `insertPending`, `sessions.upsert`, `applyUsage`, `tokenCostLedger.record`, `markProcessed` — inside a single `BEGIN`/`COMMIT` block. Transcript JSONL append is filesystem I/O and should happen after commit as best-effort.

---

## GC-STO-002: Approval Resolution Is Non-Atomic — Double-Resolution Possible

- **Severity:** Critical | **Confidence:** 88 | **False Positive Risk:** Low
- **Affected Files:** `packages/storage/src/approval-repo.ts:114-137`

**Root Cause:** `resolve()` performs a `get()` to check status, then a separate `UPDATE`. Two concurrent requests can both read `status = 'pending'`, both pass the guard, both execute the update. The second silently overwrites the first.

**Recommended Fix:** Use a conditional `UPDATE ... WHERE approval_id = ? AND status = 'pending'` and check `result.changes === 0` to detect already-resolved.

---

## GC-SEC-006: Idempotency TOCTOU Race — Duplicate Events Processed

- **Severity:** Critical (High per security, escalated due to data corruption risk) | **Confidence:** High | **False Positive Risk:** Low
- **Affected Files:** `packages/gateway-core/src/event-ingest.ts:31-59`

**Root Cause:** `find` → `insertPending` is not atomic. Two concurrent requests with same idempotency key both pass the find check, first insert succeeds, second throws UNIQUE violation. The catch handler can overwrite the first's status.

**Recommended Fix:** Use `INSERT ... ON CONFLICT DO NOTHING` or wrap `find + insertPending` in `BEGIN IMMEDIATE`.

---

## GC-ORC-001: Final-Phase Run Incorrectly Labeled `stopped_by_limit` Instead of `completed`

- **Severity:** Critical | **Confidence:** 92 | **False Positive Risk:** Low
- **Affected Files:** `packages/orchestration/src/engine.ts:85-114`

**Root Cause:** In `approvePhase`, when the last phase is approved and `totalIterations` reaches `maxIterations`, `shouldStopByLimits` returns `true` (uses `>=`). The run is labeled `stopped_by_limit` even though all work completed successfully. The test at `engine.test.ts:58-59` **normalizes this bug** by asserting `stopped_by_limit` as expected.

**Expected:** A run that finishes all phases should be `completed`. The limit guard should only fire when `next !== undefined` (more work remains).

**Recommended Fix:** `if (next && this.shouldStopByLimits(...))` — only apply limit check when there is remaining work to suppress.

---

## GC-SKL-001: Dependency Cycle Detection Emits Cycle-Participant to `ordered`

- **Severity:** Critical | **Confidence:** 88 | **False Positive Risk:** Low
- **Affected Files:** `packages/skills/src/deps.ts:16-46`

**Root Cause:** When a cycle is detected, the blocked entry is pushed for the skill being visited, but the outer call that triggered the cycle continues: it marks the skill as `visited` and pushes it to `ordered`. A skill with a cyclic dependency ends up activated despite its dependency being blocked.

**Recommended Fix:** Have `visit()` return a boolean indicating success; only push to `ordered` when all dependency visits succeeded.

---

## GC-API-001: `POST /api/v1/integrations/connections` Returns 200 Instead of 201

- **Severity:** Critical | **Confidence:** 95 | **False Positive Risk:** Very low
- **Affected Files:** `apps/gateway/src/routes/integrations.ts:85`

**Root Cause:** Missing `.code(201)` before `.send()`. Every other POST creation route returns 201.

**Recommended Fix:** `return reply.code(201).send(...)`.

---

## GC-API-002: `PATCH /api/v1/tasks/:taskId` Allows Empty `assignedAgentId`

- **Severity:** Critical | **Confidence:** 90 | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/routes/tasks.ts:28,38`

**Root Cause:** `createTaskSchema` has `.min(1)` on `assignedAgentId`; `updateTaskSchema` does not. PATCH allows `""` which is semantically invalid and persisted to DB.

**Recommended Fix:** Add `.min(1)` to `updateTaskSchema.assignedAgentId`.

---

## GC-API-003: `GET /api/v1/approvals` Has No Query Parameter Validation

- **Severity:** Critical | **Confidence:** 88 | **False Positive Risk:** Low
- **Affected Files:** `apps/gateway/src/routes/approvals.ts:30-33`

**Root Cause:** Only route in the codebase that casts `request.query` directly without Zod validation. Invalid `status` values pass through to the database query unchecked.

**Recommended Fix:** Add Zod schema with `z.enum(["pending", "approved", "rejected", "edited"])` for status parameter.

---

## GC-UX-001: Approval Resolution Without Confirmation Dialog

- **Severity:** Critical | **Confidence:** 95 | **False Positive Risk:** Very low
- **Affected Files:** `apps/mission-control/src/pages/ApprovalsPage.tsx:126-128`

**Root Cause:** Approve/reject buttons directly call `resolveApproval()` with no confirmation step. Approval resolution is irreversible and may trigger immediate tool execution. Particularly dangerous for `nuclear`-risk-level approvals.

**Recommended Fix:** Add `window.confirm()` at minimum; for production, render a modal showing the approval preview and risk level.

---

## GC-UX-002: Integration Connection Deleted Without Confirmation

- **Severity:** Critical | **Confidence:** 92 | **False Positive Risk:** Very low
- **Affected Files:** `apps/mission-control/src/pages/IntegrationsPage.tsx:99-106, 218-220`

**Root Cause:** "Remove" button calls `deleteIntegrationConnection()` directly. Deleting removes stored credentials permanently. No confirmation guard.

**Recommended Fix:** Add confirmation before deletion.
