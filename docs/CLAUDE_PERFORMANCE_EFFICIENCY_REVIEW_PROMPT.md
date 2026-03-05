# Claude Code Performance & Efficiency Review Prompt (GoatCitadel)

Use this in Claude Code for a read-only performance and efficiency audit.

```text
You are doing a read-only performance and efficiency optimization review for GoatCitadel.

Repo root: F:\code\personal-ai
Platform: Windows + PowerShell
Mode: READ-ONLY (no file edits)

Context:
- Security hardening is already in place (P0/P1 remediations landed).
- Current focus is speed, efficiency, and local-first behavior.
- Goal is not just "works," but "fast, low-latency, low-token-cost, scalable."
- TUI matters for technical users; compare TUI feature/perf posture vs web GUI.

Review objectives:
1) Find runtime bottlenecks and inefficiencies in:
   - gateway request-path latency
   - chat orchestration loops/tool retries
   - DB access/query patterns
   - SSE + fallback polling behavior
   - frontend render/re-fetch behavior
   - TUI polling/UI loops and API usage
2) Identify local-first opportunities that reduce model/tool token usage.
3) Evaluate TUI vs web parity for core ops workflows:
   - chat
   - approvals
   - tasks
   - prompt testing
   - tools access
   - costs/memory visibility
4) Produce prioritized optimization roadmap with expected impact.

Commands to run:
- git status
- pnpm -r typecheck
- pnpm -r test
- pnpm smoke
- pnpm -r build
- pnpm docs:check
- pnpm coverage:collect
- pnpm coverage:gate

Also inspect:
- artifacts/coverage/coverage-summary.json
- artifacts/coverage/coverage-summary.md
- artifacts/prompt-lab/gate-run-*.md (latest only)
- artifacts/perf/before.json
- artifacts/perf/after.json
- artifacts/perf/summary-*.md (latest only)

Mandatory output format:
A) Executive verdict on performance readiness (Ready / Conditionally Ready / Not Ready)
B) Findings by severity (Perf-P0/P1/P2), each with:
   - impact
   - evidence (file:line)
   - likely root cause
   - concrete optimization fix
   - expected gain estimate (latency/cost/throughput)
C) TUI vs Web parity matrix for core ops (have/partial/missing + recommendation)
D) Local-first/token-efficiency opportunities list (ranked)
E) 7-day optimization patch plan (ordered, decision-complete)
F) Regression risks and guardrails for each optimization

Rules:
- No generic advice.
- Every nontrivial claim must include file:line evidence.
- Separate quick wins (<1 day) from structural refactors (>1 day).
- Call out anything that could reduce token spend without harming reliability.
```

## Operator Notes

- Do not run prompt-pack gates in this review cycle unless explicitly asked.
- Prefer recommendations that preserve current API contracts and safety defaults.
- Treat TUI parity as an operator-value multiplier, not a cosmetic backlog item.
