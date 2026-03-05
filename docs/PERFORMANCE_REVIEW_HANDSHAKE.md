# Performance Review Handshake

Last updated: 2026-03-05

Use this sequence when running an external review (Claude) and converting it into implementation work.

## 1) Run reviewer prompt

Use: `docs/CLAUDE_PERFORMANCE_EFFICIENCY_REVIEW_PROMPT.md`

## 2) Normalize findings

Copy findings into:
- `artifacts/perf/PERF_REVIEW_TRIAGE_TEMPLATE.md`

Mark each item as:
- Implement
- Defer
- Reject

## 3) Implement accepted fixes

Run these gates after each patch batch:

```bash
pnpm -r typecheck
pnpm -r test
pnpm smoke
pnpm -r build
pnpm docs:check
pnpm coverage:collect
pnpm coverage:gate
```

## 4) Record cycle output

Store/refresh:
- `artifacts/perf/before.json`
- `artifacts/perf/after.json`
- `artifacts/perf/summary-<timestamp>.md`

## 5) Preserve prompt-pack budget

Prompt-pack gates are intentionally optional during performance-only cycles.
Run them only when quality regressions are suspected.
