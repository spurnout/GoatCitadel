# 08 - Recommended Roadmap

## Quick Wins (< 1 Day Each)

### QW-1: Fix Path Jail Symlink Bypass (GC-SEC-001, GC-SEC-002)
- **Effort:** < 1 hour
- **Impact:** Eliminates the most critical security vulnerability
- **Change:** Replace `path.resolve` with `fs.realpathSync` in `assertReadPathAllowed`. For write paths, resolve realpath of nearest existing ancestor.
- **Files:** `packages/policy-engine/src/sandbox/path-jail.ts`

### QW-2: Add Confirmation Dialogs (GC-UX-001, GC-UX-002)
- **Effort:** < 1 hour
- **Impact:** Prevents accidental irreversible actions
- **Change:** Add `window.confirm()` (or modal) before approval resolution and connection deletion.
- **Files:** `ApprovalsPage.tsx`, `IntegrationsPage.tsx`

### QW-3: Fix Approval Resolution Atomicity (GC-STO-002)
- **Effort:** < 1 hour
- **Impact:** Prevents double-resolution race condition
- **Change:** Use conditional `UPDATE ... WHERE status = 'pending'` + check `changes === 0`.
- **Files:** `packages/storage/src/approval-repo.ts`

### QW-4: Validate LLM Provider baseUrl (GC-SEC-003)
- **Effort:** < 1 hour
- **Impact:** Blocks SSRF to internal networks
- **Change:** Add private IP range blocklist and cloud metadata endpoint blocklist.
- **Files:** `apps/gateway/src/services/llm-service.ts`

### QW-5: Fix Idempotency TOCTOU (GC-SEC-006)
- **Effort:** < 1 hour
- **Impact:** Prevents duplicate event processing
- **Change:** Use `INSERT ... ON CONFLICT DO NOTHING` or `BEGIN IMMEDIATE`.
- **Files:** `packages/storage/src/idempotency-repo.ts` or `event-ingest.ts`

### QW-6: Add Zod Validation to GET /api/v1/approvals (GC-API-003)
- **Effort:** < 30 min
- **Impact:** Closes the only unvalidated query endpoint
- **Files:** `apps/gateway/src/routes/approvals.ts`

### QW-7: Fix POST /integrations/connections HTTP Status (GC-API-001)
- **Effort:** < 5 min
- **Impact:** Correct REST semantics
- **Change:** Add `.code(201)` before `.send()`.
- **Files:** `apps/gateway/src/routes/integrations.ts`

### QW-8: Fix updateTaskSchema Validation (GC-API-002)
- **Effort:** < 5 min
- **Impact:** Prevents invalid empty string in assignedAgentId
- **Change:** Add `.min(1)` to `updateTaskSchema.assignedAgentId`.
- **Files:** `apps/gateway/src/routes/tasks.ts`

### QW-9: Fix Orchestration Final-Phase Status (GC-ORC-001)
- **Effort:** < 30 min
- **Impact:** Correct run status on completion
- **Change:** Only apply limit check when `next !== undefined`.
- **Files:** `packages/orchestration/src/engine.ts`

### QW-10: Fix Dependency Cycle Detection (GC-SKL-001)
- **Effort:** < 1 hour
- **Impact:** Prevents activation of skills with blocked dependencies
- **Change:** Have `visit()` return boolean; only push to `ordered` on full success.
- **Files:** `packages/skills/src/deps.ts`

### QW-11: Stop Persisting API Keys to Disk (GC-SEC-008)
- **Effort:** < 1 hour
- **Impact:** Prevents API key leakage via config files
- **Change:** Omit `apiKey` from `exportConfigFile()` output.
- **Files:** `apps/gateway/src/services/llm-service.ts`

### QW-12: Add SSE Error Handler (GC-UX-003)
- **Effort:** < 1 hour
- **Impact:** Operators know when live feed is disconnected
- **Change:** Add `onerror` handler + connection status banner.
- **Files:** `apps/mission-control/src/api/client.ts`, `App.tsx`

### QW-13: Fix DashboardPage Error State (GC-UX-005)
- **Effort:** < 15 min
- **Impact:** Dashboard shows error instead of infinite loading
- **Change:** Check `error` before null guard.
- **Files:** `apps/mission-control/src/pages/DashboardPage.tsx`

### QW-14: Use Timing-Safe Comparison for Auth (GC-SEC-004)
- **Effort:** < 30 min
- **Impact:** Closes timing attack on token auth
- **Files:** `apps/gateway/src/plugins/auth.ts`

---

## Structural Refactors (Multi-Day)

### SR-1: Wrap Event Ingest in Single Transaction (GC-STO-001)
- **Effort:** 2-4 hours
- **Impact:** Atomic event processing — the most impactful data integrity fix
- **Scope:** Move `insertPending`, `sessions.upsert`, `applyUsage`, `tokenCostLedger.record`, `markProcessed` into one `BEGIN`/`COMMIT`. Transcript JSONL append moves to post-commit best-effort.
- **Risk:** Requires careful testing; touches the hottest code path.
- **Files:** `packages/gateway-core/src/event-ingest.ts`

### SR-2: Implement Schema Migration Versioning (GC-SEC-013, GC-STO-003)
- **Effort:** 1-2 days
- **Impact:** Safe, incremental schema evolution
- **Scope:** Add `schema_migrations` table. Number each migration. Apply only unapplied migrations in order. Wrap each in a transaction.
- **Files:** `packages/storage/src/sqlite.ts`

### SR-3: Add Integration Test Suite for Route Handlers
- **Effort:** 2-3 days
- **Impact:** Covers the largest test gap
- **Scope:** Use Fastify `inject()` to test all route handlers: schema validation, error codes, idempotency, auth. Start with the 10 tests in the Prioritized Immediate Test Plan.
- **Files:** New test files in `apps/gateway/src/routes/`

### SR-4: Shared SSE Context (GC-UX-004)
- **Effort:** 1 day
- **Impact:** Reduces SSE connections from 3-4 to 1 per tab
- **Scope:** Create React Context wrapping a single `EventSource`. Pages subscribe to filtered events. Add connection state indicator.
- **Files:** `apps/mission-control/src/api/client.ts`, `App.tsx`, all pages using SSE

### SR-5: JSONL Write Queue (GC-STO-004, GC-STO-005)
- **Effort:** 1 day
- **Impact:** Eliminates JSONL corruption and stale offsets
- **Scope:** Implement per-session write queue (`Map<string, Promise>`) in `TranscriptLog` and `AuditLog`. Use `fs.open()` for atomic offset calculation.
- **Files:** `packages/storage/src/transcript-log.ts`, `audit-log.ts` (if similar)

### SR-6: Composite Cursor Pagination (GC-STO-006)
- **Effort:** 1 day
- **Impact:** Correct pagination across all list endpoints
- **Scope:** Use `(timestamp, id)` composite cursor in all `list()` queries. Encode cursor as opaque string.
- **Files:** `session-repo.ts`, `task-repo.ts`, `realtime-event-repo.ts`

### SR-7: Realtime Events Pruning (GC-PERF-002) and Cost Ledger Rollup (GC-PERF-003)
- **Effort:** 1 day
- **Impact:** Prevents unbounded DB growth
- **Scope:** Add TTL-based prune on `realtime_events` insert. Add daily rollup for `cost_ledger` rows older than 7 days.
- **Files:** `realtime-event-repo.ts`, `cost-ledger-repo.ts`

### SR-8: ToolPolicyEngine Test Suite
- **Effort:** 1-2 days
- **Impact:** Covers the most critical untested enforcement boundary
- **Scope:** Test all 8 decision branches in `invoke()`, including deny-wins, jail checks, allowlist checks, approval gates, and `executeApprovedAction` with policy revocation.
- **Files:** New `packages/policy-engine/src/engine.test.ts`

---

## Prioritized Fix-First List (by Impact x Effort)

| Rank | ID | Fix | Impact | Effort |
|------|----|-----|--------|--------|
| 1 | GC-SEC-001/002 | Symlink realpathSync | Critical security | < 1h |
| 2 | GC-STO-002 | Atomic approval resolve | Critical correctness | < 1h |
| 3 | GC-SEC-003 | baseUrl validation | Critical security | < 1h |
| 4 | GC-SEC-006 | Idempotency TOCTOU | Critical correctness | < 1h |
| 5 | GC-UX-001/002 | Confirmation dialogs | Critical UX safety | < 1h |
| 6 | GC-API-001/002/003 | API validation fixes | Critical correctness | < 30m |
| 7 | GC-SEC-008 | Stop persisting API keys | High security | < 1h |
| 8 | GC-ORC-001 | Final-phase status fix | Critical correctness | < 30m |
| 9 | GC-SKL-001 | Dep cycle detection | Critical correctness | < 1h |
| 10 | GC-SEC-004 | Timing-safe auth | High security | < 30m |
| 11 | GC-STO-001 | Transaction boundary fix | Critical correctness | 2-4h |
| 12 | GC-UX-003 | SSE error handler | Critical UX | < 1h |
| 13 | GC-UX-005 | Dashboard error state | High UX | < 15m |
| 14 | SR-3 | Route handler tests | High test gap | 2-3 days |
| 15 | SR-8 | Policy engine tests | High test gap | 1-2 days |
