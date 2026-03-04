# Mission Control Manual Test Guide

This guide is for the exhaustive pre-test stabilization pass across all Mission Control pages.

## Files

- Matrix: `artifacts/manual-qa/mission-control-manual-test-matrix.csv`
- Defects: `artifacts/manual-qa/mission-control-defect-log.csv`

## How to run this pass

1. Start GoatCitadel and confirm UI + gateway are reachable.
2. Open the matrix in Excel or Google Sheets.
3. Execute rows in ascending `case_id` order.
4. For each row, fill `actual_result`, `status`, `severity`, `evidence_path`, `notes`, `build_ref`, and `tested_at`.
5. If a row fails, add a matching entry in defect log with `linked_case_id`.

## Preflight

- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm smoke`
- `pnpm -r build`

## Test data you should have before starting

- At least one configured provider/model.
- At least one chat project/session.
- One prompt pack imported in Prompt Lab.
- One integration connection (or deliberately missing credentials for blocked-state checks).
- One MCP template added (can remain disconnected).

## Execution order

1. Global shell + navigation rows.
2. Per-page simple mode rows.
3. Per-page advanced mode rows.
4. Cross-cutting rows for refresh/flicker/workspace switching/accessibility.

## Status values

- `pass`: expected behavior confirmed.
- `fail`: expected behavior not met.
- `blocked`: cannot complete due prerequisite/environment issue.
- `not_run`: intentionally skipped or deferred.

## Severity values

- `none`: pass/no issue.
- `low`: cosmetic/minor friction.
- `medium`: meaningful usability or reliability issue.
- `high`: major workflow break.
- `critical`: blocking core usage or safety risk.

## Evidence naming convention

Use predictable filenames so triage is fast:

- Screenshot: `evidence/screenshots/<case_id>.png`
- Video: `evidence/videos/<case_id>.mp4`
- Log snippet: `evidence/logs/<case_id>.txt`

## Exit criteria for this pass

- All P0 and P1 rows executed.
- No unresolved critical defects.
- No in-page hard reload/flicker defects on key workflows.
- Prompt Lab run-vs-score classification remains clear.
