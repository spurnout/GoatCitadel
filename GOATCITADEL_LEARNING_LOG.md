# GoatCitadel Learning Log

This log tracks validated AI/system self-improvements.

## Policy

- Record only changes that were implemented and measured.
- Every entry must include objective before/after evidence.
- If a change fails to improve outcomes, do not record as successful.
- Product release history remains in `CHANGELOG.md`.

## Entry Template

```md
## YYYY-MM-DD - <short title>
- Hypothesis:
- Change implemented:
- Validation method:
- Before metrics:
- After metrics:
- Decision: kept | reverted
- Notes:
```

## Rejected Ideas (Optional)

Use this section only for ideas tested and reverted.

```md
## YYYY-MM-DD - <short title>
- Hypothesis:
- Reason rejected:
- Evidence:
```

## Validated Improvements

## 2026-03-05 - Performance hardening baseline checkpoint
- Hypothesis:
  - Reducing redundant intent detection, query scans, and refresh inefficiencies improves responsiveness without quality regression.
- Change implemented:
  - Single-pass intent detector caching in orchestrator.
  - Direct cron job lookups and bounded checkpoint/dead-letter paths.
  - Dashboard live refresh wiring, TUI fallback event dedupe, and root clock rerender containment.
  - SQLite tuning knobs added with safe bounds.
- Validation method:
  - Gate reports and perf artifact comparison in `artifacts/perf/summary-20260305.md`.
- Before metrics:
  - Prompt average score `8.51`
  - Pass rate @ `7/10` `87.9%`
  - Run failures `0`
- After metrics:
  - Prompt average score `8.60`
  - Pass rate @ `7/10` `89.6%`
  - Run failures `0`
- Decision: kept
- Notes:
  - Follow-up micro-benchmarks for chat p95 TTFB and SSE validation fanout are still recommended.
