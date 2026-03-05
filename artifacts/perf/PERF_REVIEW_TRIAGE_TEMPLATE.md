# Performance Review Triage Template

Use this file to normalize Claude findings into implementation-ready tasks.

## Metadata
- Review date:
- Reviewer:
- Commit/branch reviewed:
- Gate status summary:

## Decision Table

| ID | Severity | Finding | Evidence (file:line) | Decision (Implement/Defer/Reject) | Reason | Owner |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## Quick Wins (<1 Day)

| Task | Impact | Risk | Validation |
|---|---|---|---|
|  |  |  |  |

## Structural Refactors (>1 Day)

| Task | Impact | Risk | Rollout Plan |
|---|---|---|---|
|  |  |  |  |

## Token Efficiency Opportunities

| Opportunity | Expected Token Savings | Preconditions | Tradeoffs |
|---|---|---|---|
|  |  |  |  |

## TUI Parity Action List

| Workflow | Current State | Gap | Patch |
|---|---|---|---|
| Chat |  |  |  |
| Approvals |  |  |  |
| Tasks |  |  |  |
| Prompt Testing |  |  |  |
| Tools |  |  |  |
| Costs/Memory |  |  |  |

## Validation Plan

```bash
pnpm -r typecheck
pnpm -r test
pnpm smoke
pnpm -r build
pnpm docs:check
pnpm coverage:collect
pnpm coverage:gate
```

## Exit Criteria

- [ ] All accepted Perf-P0 findings fixed.
- [ ] Accepted Perf-P1 findings either fixed or assigned with dates.
- [ ] No regression in safety/policy behavior.
- [ ] Coverage gate remains green.
