# Claude Code Review Prompt for GoatCitadel

Use this prompt in Claude Code when reviewing this repository.

---

You are performing a **read-only, no-code-change** review of this repository:

- Repo path: `F:\code\personal-ai`
- Product: `GoatCitadel`
- Stack: TypeScript, Node.js, Fastify, React (Vite), SQLite, JSONL logs
- Priority domains: performance, optimization, UI/UX quality, bugs, reliability, security, architecture consistency

## Hard constraints

1. **Do not modify any source file.**
2. **Do not run destructive commands.**
3. **Do not open pull requests or create commits.**
4. Write all findings into:
   - `artifacts/reviews/claude-code/findings/`
5. Create these files:
   - `artifacts/reviews/claude-code/findings/01-executive-summary.md`
   - `artifacts/reviews/claude-code/findings/02-critical-findings.md`
   - `artifacts/reviews/claude-code/findings/03-major-findings.md`
   - `artifacts/reviews/claude-code/findings/04-performance-and-optimization.md`
   - `artifacts/reviews/claude-code/findings/05-ui-ux-review.md`
   - `artifacts/reviews/claude-code/findings/06-testing-gaps.md`
   - `artifacts/reviews/claude-code/findings/07-security-review.md`
   - `artifacts/reviews/claude-code/findings/08-recommended-roadmap.md`
   - `artifacts/reviews/claude-code/findings/findings-index.json`

## Review objectives

1. Identify correctness bugs and behavioral regressions.
2. Identify performance bottlenecks and optimization opportunities.
3. Review UI/UX for utility, clarity, and operator safety.
4. Validate safety controls:
   - idempotency,
   - deny-wins policy behavior,
   - path jail and allowlist checks,
   - approval gating.
5. Validate persistence and migration safety for SQLite and logs.
6. Validate API contract consistency between backend and frontend.
7. Identify test coverage gaps and missing edge-case tests.

## Severity model

Use this severity classification:

- `critical`: exploit/data loss/corruption or major safety violation.
- `high`: major reliability or security risk likely in normal operation.
- `medium`: meaningful defect with bounded impact.
- `low`: minor defect, maintainability issue, or polish gap.

For each finding include:

- unique id (for example `GC-SEC-001`)
- severity
- confidence (`high`, `medium`, `low`)
- affected files
- exact line references
- reproduction steps
- expected behavior
- observed behavior
- root cause analysis
- recommended fix
- test case recommendation
- risk of false positive (`low`, `medium`, `high`) with one-sentence justification

## Additional required review instructions

1. For every security finding, include an **exploitability analysis** subsection:
   - attacker preconditions
   - realistic exploit path
   - blast radius / impact scope
   - practical mitigation priority
2. For each finding, explicitly include a **risk of false positive** assessment.
3. In `08-recommended-roadmap.md`, include two separate sections:
   - `Quick Wins (<1 day)`
   - `Structural Refactors`
4. In `03-major-findings.md`, include an **API Contract Diff** section:
   - declared/requested schema vs actual runtime behavior
   - affected endpoint path and method
   - concrete mismatch examples
5. In `06-testing-gaps.md`, include a **Prioritized Immediate Test Plan**:
   - tests that should be added first
   - why each test is high value
   - expected failure mode each test would catch

## Required output quality

- Prefer actionable, testable findings over generic comments.
- Be explicit when uncertain.
- Separate factual findings from assumptions.
- Include examples and pseudocode where useful.
- Include a short "what to fix first" list ranked by impact and effort.

## Scope guidance

Review all layers:

- `apps/gateway`
- `apps/mission-control`
- `packages/*`
- `config/*`
- `scripts/*`

Primary technical references:

- `README.md`
- `docs/ENGINEERING_HANDBOOK.md`

## Final step

After writing all files in `artifacts/reviews/claude-code/findings/`, print a concise terminal summary with:

- total finding count by severity
- top 10 fixes
- any blockers to full review

---
