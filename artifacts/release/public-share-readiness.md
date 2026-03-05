# GoatCitadel Public-Share Readiness

Date: 2026-03-05
Release line: `0.6.0-beta.2`
Status: GO for public beta testing from a pushed commit

## What Changed In This Sweep

1. Moved public docs to installer-first onboarding
2. Bumped release line to `0.6.0-beta.2`
3. Fixed runtime-root handling for installer/demo/temp-root runs
4. Fixed cross-workspace chat session lookup
5. Fixed memory context composition for transcript-empty sessions
6. Rebuilt the screenshot pipeline around sanitized demo data
7. Regenerated the full Mission Control screenshot gallery

## Gate Status

1. `pnpm -r typecheck` PASS
2. `pnpm -r test` PASS
3. `pnpm smoke` PASS
4. `pnpm -r build` PASS
5. `pnpm docs:check` PASS
6. `pnpm coverage:collect` PASS
7. `pnpm coverage:gate` PASS

Coverage:

- line `65.19%`
- branch `61.54%`

Artifacts:

- review: [public-share-readiness-2026-03-05.md](/f:/code/personal-ai/artifacts/reviews/public-share-readiness-2026-03-05.md)
- coverage: [coverage-summary.json](/f:/code/personal-ai/artifacts/coverage/coverage-summary.json)
- screenshots: [docs/screenshots/mission-control/index.html](/f:/code/personal-ai/docs/screenshots/mission-control/index.html)

## Public Beta Checklist

- README is installer-first
- Manual/dev path remains documented
- Screenshot set is sanitized and current
- No unresolved P0/P1 blockers remain from this sweep
- Next validation is the clean laptop install from the pushed commit

## Known Deferred Items

1. Clean laptop install has not yet been run on the pushed commit
2. Mission Control build still shows a non-blocking large vendor chunk warning
