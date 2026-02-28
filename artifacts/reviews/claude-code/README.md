# Claude Code Review Handoff

This folder is the handoff package for external read-only audits.

## Files

- `CLAUDE_CODE_REVIEW_PROMPT.md`: copy this prompt into Claude Code.
- `findings/`: target output directory for all review artifacts.

## Reviewer Rules

- No code changes.
- No commits.
- No pull requests.
- All findings written under `findings/`.

## Expected Output

The reviewer should create:

- `01-executive-summary.md`
- `02-critical-findings.md`
- `03-major-findings.md`
- `04-performance-and-optimization.md`
- `05-ui-ux-review.md`
- `06-testing-gaps.md`
- `07-security-review.md`
- `08-recommended-roadmap.md`
- `findings-index.json`

