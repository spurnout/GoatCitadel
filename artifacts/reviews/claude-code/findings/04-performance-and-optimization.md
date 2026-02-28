# 04 - Performance and Optimization

---

## GC-PERF-001: MemoryPage Fetches Up to 3000 Files Client-Side

- **Severity:** High | **Confidence:** 88 | **False Positive Risk:** Low
- **Affected Files:** `apps/mission-control/src/pages/MemoryPage.tsx:25`
- **Root Cause:** `fetchFilesList(".", 3000)` retrieves up to 3,000 file records on every `refreshKey` change. All filtering (`summarizeAreas`, `summarizeMemorySubspaces`) runs synchronously in the React render thread. In a workspace with thousands of files, this causes visible UI jank.
- **Recommended Fix:** Apply server-side filtering via the `dir` query parameter. Reduce limit to 200. Move computation to `useMemo` with `startTransition`.

---

## GC-PERF-002: `realtime_events` Table Grows Unbounded

- **Severity:** High | **Confidence:** 87 | **False Positive Risk:** Low
- **Affected Files:** `packages/storage/src/realtime-event-repo.ts:18-31`, `packages/storage/src/sqlite.ts:198-207`
- **Root Cause:** Every event appended via `RealtimeEventRepository.append()` is permanently stored. No TTL, no `DELETE` on insert, no row count limit. A busy system will grow this table indefinitely, degrading write performance and bloating the WAL file.
- **Recommended Fix:** Add a row-count or age-based prune on insert (e.g., `DELETE FROM realtime_events WHERE created_at < datetime('now', '-7 days')`), or run a periodic maintenance job.

---

## GC-PERF-003: `cost_ledger` Accumulates One Row Per Event — No Aggregation

- **Severity:** High | **Confidence:** 85 | **False Positive Risk:** Low
- **Affected Files:** `packages/gateway-core/src/token-cost-ledger.ts:17-28`, `packages/storage/src/sqlite.ts:122-136`
- **Root Cause:** Each call to `TokenCostLedger.record()` performs an `INSERT`. For high-throughput systems with many short agent messages, the `summary()` query must aggregate across potentially millions of rows. Indexes on `day` and `session_id` help but are insufficient for dashboard-level aggregation at scale.
- **Recommended Fix:** Upsert pattern aggregating by `(session_id, agent_id, task_id, day)`, or a daily rollup job that replaces individual rows with aggregate rows for past days.

---

## GC-PERF-004: OfficeCanvas `useFrame` Runs Every Frame for All Agents

- **Severity:** Medium | **Confidence:** 83 | **False Positive Risk:** Low
- **Affected Files:** `apps/mission-control/src/components/OfficeCanvas.tsx:151-158, 222-229`
- **Root Cause:** With N agents, N+1 `useFrame` callbacks execute at 60fps. Each callback runs sine-wave animation math even for off-screen or idle agents. CPU usage scales linearly with agent count.
- **Recommended Fix:** Frame-skip for idle agents (animate at half speed). For large agent counts (>20), consider instanced meshes.

---

## GC-PERF-005: `three.js` Bundle Split Correctness Unverified

- **Severity:** Medium | **Confidence:** 80 | **False Positive Risk:** Moderate
- **Affected Files:** `apps/mission-control/src/App.tsx:18-21`, `apps/mission-control/package.json`
- **Root Cause:** `OfficePage` is lazy-loaded, which should split `three` (~600KB) into a separate chunk. However, without `manualChunks` Vite config, Vite's code-splitting heuristics may bundle it into a shared vendor chunk loaded on first page visit.
- **Recommended Fix:** Add Vite `manualChunks` config to guarantee split: `{ three: ["three", "@react-three/fiber", "@react-three/drei"] }`. Verify with `vite-bundle-visualizer`.

---

## GC-UX-004: Multiple Simultaneous SSE Connections Per Tab

- **Severity:** Medium | **Confidence:** 88 | **False Positive Risk:** Low
- **Affected Files:** `apps/mission-control/src/App.tsx:110`, `ActivityPage.tsx:13`, `LiveFeedPage.tsx:13`, `OfficePage.tsx:115`
- **Root Cause:** `App.tsx` opens a global `EventSource`. `ActivityPage`, `LiveFeedPage`, and `OfficePage` each independently open additional connections. Up to 3-4 concurrent SSE connections from a single browser tab.
- **Recommended Fix:** Move SSE to a shared React Context or global singleton. Consumers subscribe to the in-memory emitter.

---

## GC-UX-008: OfficePage 20s Polling Fires Even When Tab Is Hidden

- **Severity:** Medium | **Confidence:** 83 | **False Positive Risk:** Low
- **Affected Files:** `apps/mission-control/src/pages/OfficePage.tsx:111-113, 27`
- **Root Cause:** `setInterval` with no `document.visibilityState` check. `loadSnapshot(false)` fires 4 concurrent API calls every 20 seconds even when browser tab is hidden.
- **Recommended Fix:** Add `if (document.visibilityState === "visible")` guard inside interval callback.

---

## GC-UX-006: File Downloads Not Cancelled on Path Change

- **Severity:** Medium | **Confidence:** 85 | **False Positive Risk:** Low
- **Affected Files:** `apps/mission-control/src/pages/FilesPage.tsx:36-44`
- **Root Cause:** Rapid clicks fire multiple in-flight `downloadFile` requests with no `AbortController`. Last response to resolve wins, which may be stale. Causes content flicker.
- **Recommended Fix:** Use `AbortController` in `useEffect` cleanup to cancel in-flight requests.

---

## GC-UX-007: Task Detail Fetch Races on Rapid Selection

- **Severity:** Medium | **Confidence:** 85 | **False Positive Risk:** Low
- **Affected Files:** `apps/mission-control/src/pages/TasksPage.tsx:94-106, 118-123`
- **Root Cause:** `loadTaskDetail` fires 3 parallel requests per task selection with no cancellation. Clicking quickly between tasks causes overlapping `Promise.all` sets; the winning result may belong to a previously selected task.
- **Recommended Fix:** Track a `currentTaskId` ref and discard stale responses; use cleanup function in `useEffect`.
