# Claude Code Production Readiness Review Prompt (GoatCitadel)

Use this prompt in Claude Code for a full production-grade review.

---

You are reviewing GoatCitadel for production readiness. Treat this as a strict engineering audit, not a style pass.

## Review objectives

1. Validate architecture correctness and boundary safety.
2. Identify security/privacy risks, especially secrets handling and remote tool surfaces.
3. Verify policy integrity (deny-wins, approval gating, idempotency).
4. Evaluate MCP and skills trust boundaries and misuse risk.
5. Evaluate failure handling, retries, fallback visibility, and anti-hallucination behavior.
6. Validate storage/data consistency and migration safety.
7. Identify testing gaps and high-risk regressions.
8. Evaluate operational readiness: logs, observability, incident triage signal quality.
9. Evaluate UI reliability and accessibility constraints for operator workflows.

## Repo context

- Product: GoatCitadel Mission Control + Gateway
- Runtime: local-first, operator-centric
- Key areas:
  - `apps/gateway`
  - `apps/mission-control`
  - `packages/contracts`
  - `packages/storage`
  - `packages/policy-engine`
  - `packages/skills`

## Review constraints

1. Prioritize bugs, regressions, and security risks over style.
2. If behavior is ambiguous, state assumptions explicitly.
3. Prefer actionable fixes with file-level specificity.
4. Do not suggest destructive changes without migration/backward-compat notes.

## Required output format

Produce findings sorted by severity: `critical`, `high`, `medium`, `low`.

For each finding include:

1. **Title**
2. **Severity**
3. **Evidence**
- file path(s)
- relevant line(s) or function(s)
4. **Impact**
5. **Repro steps**
6. **Recommended patch**
- concrete code-level change
- migration/compat notes if needed
7. **Risk if not fixed**
8. **Confidence** (`high`, `medium`, `low`)

Then include:

- **Top 10 fix sequence** (ordered by risk reduction)
- **Test plan additions** for each high/critical finding
- **Go/No-Go recommendation** for production

## Special focus checks

1. Chat message send path should not full-page reload.
2. Prompt Lab must clearly separate execution completion from scoring pass/fail.
3. Skills state lifecycle (`enabled/sleep/disabled`) must be persisted and enforced.
4. Sleep-mode activation must respect guarded threshold + first-use confirmation logic.
5. MCP trust tier and policy (redaction, allow/block patterns) must be enforced before invoke.
6. Any fallback model/provider switches must be visible in trace and never silent.
7. Memory/tool claims must be evidence-backed (no fabricated access).

---

Now run the full review and return results in the required format.
