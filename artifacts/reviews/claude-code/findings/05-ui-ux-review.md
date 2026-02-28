# 05 - UI/UX Review

---

## GC-UX-001: Approval Resolution Without Confirmation Dialog

- **Severity:** Critical | **Confidence:** 95
- **Affected Files:** `apps/mission-control/src/pages/ApprovalsPage.tsx:126-128`
- **Issue:** Approve/reject buttons directly invoke `resolveApproval()`. Single accidental click resolves approval permanently and may trigger immediate tool execution. Especially dangerous for `nuclear`-risk-level approvals.
- **Recommended Fix:** Render a modal showing approval preview and risk level before committing. At minimum, `window.confirm()`.

---

## GC-UX-002: Integration Connection Deleted Without Confirmation

- **Severity:** Critical | **Confidence:** 92
- **Affected Files:** `apps/mission-control/src/pages/IntegrationsPage.tsx:99-106, 218-220`
- **Issue:** "Remove" button deletes stored credentials permanently with no guard.
- **Recommended Fix:** Add confirmation dialog.

---

## GC-UX-003: SSE Connection Has No Reconnect/Error-Recovery UI

- **Severity:** Critical | **Confidence:** 90
- **Affected Files:** `apps/mission-control/src/api/client.ts:649-662`
- **Issue:** `connectEventStream` attaches no `onerror` handler. If the gateway restarts, users see a silently stale interface with no indication the live feed is disconnected.
- **Recommended Fix:** Add `onerror` handler. Expose `isConnected` state in App.tsx. Display "Live feed disconnected — reconnecting..." banner.

---

## GC-UX-005: DashboardPage Shows Permanent Loading State After API Error

- **Severity:** High | **Confidence:** 85
- **Affected Files:** `apps/mission-control/src/pages/DashboardPage.tsx:40-48`
- **Issue:** If `Promise.all` rejects, `error` is set but `state`/`vitals`/`cron`/`operators` remain `null`. The null guard at line 40 triggers before the error display. User sees "Loading summit overview..." indefinitely.
- **Recommended Fix:** Check for `error` before the null guard:
  ```tsx
  if (error && !state) return <p className="error">Failed to load: {error}</p>;
  ```

---

## GC-UX-009: AgentsPage Conflates Empty-Result with Loading

- **Severity:** Medium | **Confidence:** 82
- **Affected Files:** `apps/mission-control/src/pages/AgentsPage.tsx:61-63`
- **Issue:** `agents.length === 0` is used as the loading check. In practice, `buildAgentDirectory` always returns 7 entries, so this never triggers. But conceptually it conflates "API not yet called" with "no agents".
- **Recommended Fix:** Use a dedicated `loading` boolean state.

---

## GC-UX-010: Auth Credentials Stored in localStorage Without Expiry

- **Severity:** Medium | **Confidence:** 82
- **Affected Files:** `apps/mission-control/src/api/client.ts:29-61`, `SettingsPage.tsx:692-709`
- **Issue:** Bearer tokens and basic auth credentials (including passwords) stored as plaintext JSON in `localStorage`. Accessible to any JS on the same origin (XSS risk). No expiry, no integrity check. Mentioned as local-first app, but README notes it can be hosted.
- **Recommended Fix:** For local use, document the intentional tradeoff. For hosted deployments, prefer `sessionStorage` or httpOnly cookies. Display a warning in Settings UI when storing credentials.

---

## GC-UX-011: No Input Length Validation on Task Title

- **Severity:** Low | **Confidence:** 80
- **Affected Files:** `apps/mission-control/src/pages/TasksPage.tsx:126`, `apps/gateway/src/routes/tasks.ts:25`
- **Issue:** No `max()` constraint on title field client-side or server-side. Arbitrarily long titles break table layout.
- **Recommended Fix:** Add `z.string().min(1).max(200)` on server; add `maxLength={200}` on client input.

---

## General UI Patterns Observed

### Error Handling
Most pages follow a consistent pattern: `try/catch` in fetch, `setError(message)`, conditional render of error banner. **DashboardPage** is the notable exception where the error render is unreachable (GC-UX-005).

### Loading States
Pages generally use `null` checks on data state as loading indicators. This conflates "not yet fetched" with "fetch returned empty." A dedicated `loading` boolean would be more robust.

### Destructive Actions
**Two critical gaps** where destructive/irreversible actions lack confirmation (GC-UX-001, GC-UX-002). All other destructive actions (task deletion, file writes) either have some guard or are non-destructive reads.

### SSE Architecture
The current SSE implementation works but has redundancy (up to 4 connections) and no user-visible connection state. A shared context with connection status would improve both performance and operator confidence.

### Accessibility
No explicit accessibility testing was performed. Pages use standard HTML elements (`<button>`, `<input>`, `<select>`) which provide baseline keyboard/screen-reader support. No custom ARIA attributes observed. The WebGL OfficeCanvas is inherently inaccessible to screen readers.

### Polling Behavior
OfficePage polls every 20s with no visibility check. All other pages use SSE-driven `refreshKey` for updates, which is more efficient. The polling-based approach is isolated to OfficePage's snapshot loading.
