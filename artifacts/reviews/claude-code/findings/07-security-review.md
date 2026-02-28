# 07 - Security Review

## Threat Model Summary

GoatCitadel's security boundary is the **policy engine** — it stands between AI agents and the host system. The trust model assumes:

- The gateway operator is trusted.
- AI agents are semi-trusted (allowed specific tools per policy, but constrained).
- External network access is restricted to an allowlist.
- File system access is jailed to configured roots.

The primary attack surface is an agent attempting to escape its sandbox, and (for networked deployments) external attackers targeting the gateway HTTP API.

---

## Critical Findings

### GC-SEC-001: `fs.read` Symlink Bypass (Path Jail)

| Property | Value |
|----------|-------|
| Severity | Critical |
| Confidence | High |
| Affected | `packages/policy-engine/src/sandbox/path-jail.ts:9-16`, `tool-executor.ts:22-31` |

**Exploitability Analysis:**
- **Preconditions:** Agent with `fs.read` permission + ability to create symlinks (via `shell.exec` or `fs.write`)
- **Exploit Path:** Create symlink inside jail → read target file via symlink path → jail check passes (lexical resolve doesn't follow symlinks)
- **Blast Radius:** Read any file accessible to the Node.js process (private keys, database, config with secrets)
- **Mitigation Priority:** Immediate

### GC-SEC-002: `fs.write` Symlink Bypass (Path Jail)

| Property | Value |
|----------|-------|
| Severity | Critical |
| Confidence | High |
| Affected | `packages/policy-engine/src/sandbox/path-jail.ts:4-7`, `tool-executor.ts:36` |

**Exploitability Analysis:**
- **Preconditions:** Agent with `fs.write` and symlink creation capability
- **Exploit Path:** Create symlink inside jail pointing outside → write through symlink
- **Blast Radius:** Arbitrary file write as Node.js process user
- **Mitigation Priority:** Immediate

### GC-SEC-003: SSRF via LLM Provider `baseUrl`

| Property | Value |
|----------|-------|
| Severity | Critical |
| Confidence | High |
| Affected | `apps/gateway/src/routes/dashboard.ts:22-30`, `llm-service.ts:115-119` |

**Exploitability Analysis:**
- **Preconditions:** Authenticated API access OR loopback access (when bypass enabled)
- **Exploit Path:** Set baseUrl to internal endpoint → gateway fetches internal URL with API key in Authorization header
- **Blast Radius:** SSRF to internal network + API key exfiltration to attacker-controlled server
- **Mitigation Priority:** Immediate for networked deployments

---

## High Findings

### GC-SEC-004: Timing Attack on Token Authentication

| Property | Value |
|----------|-------|
| Severity | High |
| Confidence | High |
| Affected | `apps/gateway/src/plugins/auth.ts:33,53` |

**Exploitability Analysis:**
- **Preconditions:** Network access to gateway
- **Exploit Path:** Measure response times for different token prefixes; iteratively extract correct token
- **Blast Radius:** Full authentication bypass
- **Mitigation Priority:** High for networked deployments; low for local-only

### GC-SEC-005: Loopback Bypass Defeats Auth Behind Reverse Proxy

| Property | Value |
|----------|-------|
| Severity | High |
| Confidence | High |
| Affected | `apps/gateway/src/plugins/auth.ts:143-146` |

**Exploitability Analysis:**
- **Preconditions:** Gateway behind a reverse proxy on localhost + `allowLoopbackBypass: true`
- **Exploit Path:** External request → reverse proxy (127.0.0.1) → Fastify sees `request.ip = 127.0.0.1` → auth bypassed
- **Blast Radius:** All API endpoints accessible without authentication
- **Mitigation Priority:** High (document clearly; default `allowLoopbackBypass` to `false`)

### GC-SEC-006: Idempotency TOCTOU Race

| Property | Value |
|----------|-------|
| Severity | High |
| Confidence | High |
| Affected | `packages/gateway-core/src/event-ingest.ts:31-59` |

**Exploitability Analysis:**
- **Preconditions:** Two concurrent requests with same idempotency key
- **Exploit Path:** Both pass find check → first insert succeeds → second throws UNIQUE → catch handler corrupts first's status
- **Blast Radius:** Duplicate event processing; cost record corruption
- **Mitigation Priority:** High

### GC-SEC-007: Shell Risk Gate Bypassable

| Property | Value |
|----------|-------|
| Severity | High |
| Confidence | High |
| Affected | `packages/policy-engine/src/sandbox/shell-risk-gate.ts:6-17` |

**Exploitability Analysis:**
- **Preconditions:** Agent with `shell.exec` permission
- **Exploit Path:** Use shell quoting tricks, full paths, or interpreter routing to avoid pattern substrings
- **Blast Radius:** Execution of risky commands without approval
- **Mitigation Priority:** High (invert to always-require-approval for shell)

### GC-SEC-008: API Key Persisted in Plaintext

| Property | Value |
|----------|-------|
| Severity | High |
| Confidence | High |
| Affected | `apps/gateway/src/services/gateway-service.ts:1189-1193`, `llm-service.ts:106-111` |

**Exploitability Analysis:**
- **Preconditions:** File system read access to `config/llm-providers.json`
- **Exploit Path:** Read config file → extract API key
- **Blast Radius:** API key compromise; unauthorized use of paid LLM services
- **Mitigation Priority:** High

---

## Medium Findings

### GC-SEC-009: `normalizeRelativePath` Doesn't Block Standalone `".."`

| Property | Value |
|----------|-------|
| Severity | Medium |
| Confidence | High |
| Affected | `apps/gateway/src/services/gateway-service.ts:1157-1166` |

**Exploitability Analysis:**
- **Preconditions:** Access to file upload/write API
- **Exploit Path:** Submit path `".."` → resolves to parent of workspace directory → write to non-workspace location
- **Blast Radius:** File write one level above workspace (mitigated by write jail if configured correctly)
- **Mitigation Priority:** Medium

### GC-SEC-010: Auth Credentials Persisted to `assistant.config.json`

| Property | Value |
|----------|-------|
| Severity | Medium |
| Confidence | High |
| Affected | `apps/gateway/src/services/gateway-service.ts:1195-1211` |

**Exploitability:** Same class as GC-SEC-008. Auth token/password in plaintext config file.

### GC-SEC-011: HTTP Redirect Bypasses Network Allowlist

| Property | Value |
|----------|-------|
| Severity | Medium |
| Confidence | High |
| Affected | `packages/policy-engine/src/tool-executor.ts:45-59` |

**Exploitability Analysis:**
- **Preconditions:** Agent with `http.get` permission + attacker controls an allowed domain
- **Exploit Path:** Allowed domain redirects to internal IP → `fetch` follows redirect automatically
- **Blast Radius:** SSRF to internal network from allowed-domain redirect
- **Mitigation Priority:** Medium

### GC-SEC-012: Internal Error Messages Leaked to HTTP Clients

| Property | Value |
|----------|-------|
| Severity | Medium |
| Confidence | High |
| Affected | `apps/gateway/src/routes/tasks.ts:205-213`

**Exploitability:** Information disclosure — file paths, SQL details, internal state may leak to API callers.

### GC-SEC-013: No Migration Versioning

| Property | Value |
|----------|-------|
| Severity | Medium |
| Confidence | High |
| Affected | `packages/storage/src/sqlite.ts:25-298, 300` |

**Exploitability:** Not directly exploitable, but unconditional DDL on every startup creates risk of data loss during schema evolution.

---

## Positive Security Observations

1. **All SQL uses parameterized queries** — no SQL injection vectors found in any repository.
2. **PRAGMA foreign_keys = ON** is correctly set per-connection.
3. **WAL mode + synchronous = NORMAL** is appropriate for single-writer local deployment.
4. **Deny-wins policy** is correctly implemented in `resolveEffectivePolicy`.
5. **Idempotency-Key requirement** on all mutating endpoints is well-enforced (except for the TOCTOU race).
6. **Approval explainer is documented as informational only** — policy decisions do not depend on it.
7. **CORS configuration** exists and is applied before routes.
8. **Token cost values stored as SQL REAL** and accumulated via SQL `+` — avoids JavaScript float drift.
