# GoatCitadel Public-Share Readiness Review

Date: 2026-03-05
Target release: `0.6.0-beta.2`

## Executive Verdict

Conditional GO for public beta sharing.

No unresolved P0/P1 code or documentation blockers remain in this sweep. The repository is ready for a pushed-commit clean install and laptop validation run. The remaining step is operator-run validation from the pushed commit, not additional known code remediation.

## Findings By Severity

### P1

1. Fixed: dev supervisor ignored caller-provided runtime root and forced the repo root
   - Evidence: [apps/gateway/src/dev-supervisor.ts](/f:/code/personal-ai/apps/gateway/src/dev-supervisor.ts:22), [apps/gateway/src/dev-supervisor.ts](/f:/code/personal-ai/apps/gateway/src/dev-supervisor.ts:123)
   - Impact: installer-style runs, temp runtime runs, and screenshot/demo runs wrote into or read from the repo root instead of the requested runtime root.
   - Resolution: supervisor now respects `GOATCITADEL_ROOT_DIR` when provided and logs both code root and runtime root.
   - Status: fixed

2. Fixed: chat session creation failed for non-default workspaces because session lookup re-filtered through the default workspace
   - Evidence: [apps/gateway/src/services/gateway-service.ts](/f:/code/personal-ai/apps/gateway/src/services/gateway-service.ts:11869)
   - Impact: `POST /api/v1/chat/sessions` could create a session in a non-default workspace and then immediately fail lookup with `Chat session ... not found`.
   - Resolution: `requireChatSession()` now resolves directly by `sessionId` using session/meta/project records instead of workspace-filtered list traversal.
   - Status: fixed

3. Fixed: memory context compose threw `ENOENT` for brand-new sessions with no transcript file
   - Evidence: [apps/gateway/src/services/memory-context-service.ts](/f:/code/personal-ai/apps/gateway/src/services/memory-context-service.ts:300), [apps/gateway/src/services/memory-context-service.ts](/f:/code/personal-ai/apps/gateway/src/services/memory-context-service.ts:331)
   - Impact: first-use or transcript-empty sessions could fail memory context composition with a 500 instead of falling back cleanly.
   - Resolution: transcript reads in memory context source collection now treat missing transcript files as empty transcript state.
   - Status: fixed

### P2

1. Fixed: installer/docs/CLI surface drift around install overrides and launcher behavior
   - Evidence: [bin/goatcitadel.mjs](/f:/code/personal-ai/bin/goatcitadel.mjs:116), [bin/goatcitadel.mjs](/f:/code/personal-ai/bin/goatcitadel.mjs:201), [install.ps1](/f:/code/personal-ai/install.ps1:51), [install.sh](/f:/code/personal-ai/install.sh:84), [docs/INSTALL_SETUP_TESTING.md](/f:/code/personal-ai/docs/INSTALL_SETUP_TESTING.md:27)
   - Impact: docs claimed install override behavior and a launcher surface that were not consistently represented across CLI/installers.
   - Resolution: CLI now supports `install` / `update` with `--install-dir` and `--repo`; installer-generated launchers delegate directly to the real CLI instead of a reduced wrapper.
   - Status: fixed

2. Fixed: screenshot/media pipeline relied on full-page captures and unsanitized/live-local behavior
   - Evidence: [packages/policy-engine/scripts/capture-mission-control-screenshots.mjs](/f:/code/personal-ai/packages/policy-engine/scripts/capture-mission-control-screenshots.mjs:45), [packages/policy-engine/scripts/capture-mission-control-screenshots.mjs](/f:/code/personal-ai/packages/policy-engine/scripts/capture-mission-control-screenshots.mjs:69), [packages/policy-engine/scripts/capture-mission-control-screenshots.mjs](/f:/code/personal-ai/packages/policy-engine/scripts/capture-mission-control-screenshots.mjs:160), [packages/policy-engine/scripts/capture-mission-control-screenshots.mjs](/f:/code/personal-ai/packages/policy-engine/scripts/capture-mission-control-screenshots.mjs:35)
   - Impact: README/gallery media was not suitable for public sharing and could drift from sanitized demo expectations.
   - Resolution: added deterministic Playwright capture pipeline backed by an isolated demo runtime, regenerated all Mission Control screenshots, and clipped the tools view instead of using a giant full-page dump.
   - Status: fixed

3. Fixed: demo cron seed used unsupported schedule syntax
   - Evidence: [packages/policy-engine/scripts/capture-mission-control-screenshots.mjs](/f:/code/personal-ai/packages/policy-engine/scripts/capture-mission-control-screenshots.mjs:227)
   - Impact: screenshot generation failed before reaching the full gallery capture pass.
   - Resolution: demo fixture now uses a valid explicit UTC schedule.
   - Status: fixed

4. Fixed: public-facing docs were clone-first and not aligned to installer-first share posture
   - Evidence: [README.md](/f:/code/personal-ai/README.md:46), [docs/INSTALL_SETUP_TESTING.md](/f:/code/personal-ai/docs/INSTALL_SETUP_TESTING.md:12), [docs/PUBLIC_SHARE_CHECKLIST.md](/f:/code/personal-ai/docs/PUBLIC_SHARE_CHECKLIST.md:1), [docs/COMMUNICATION_CHANNEL_SETUP_GUIDE.md](/f:/code/personal-ai/docs/COMMUNICATION_CHANNEL_SETUP_GUIDE.md:1)
   - Impact: first-time users would land on the more complex path instead of the intended home-folder installer path.
   - Resolution: README and public docs now lead with installer-first onboarding, keep manual/dev install second, and reflect the actual launcher behavior.
   - Status: fixed

## Validation Results

Engineering gates run on 2026-03-05:

1. `pnpm -r typecheck` PASS
2. `pnpm -r test` PASS
3. `pnpm smoke` PASS
4. `pnpm -r build` PASS
5. `pnpm docs:check` PASS
6. `pnpm coverage:collect` PASS
7. `pnpm coverage:gate` PASS

Coverage summary:

- line: `65.19%`
- branch: `61.54%`
- thresholds: line `65`, branch `45`
- source: [coverage-summary.json](/f:/code/personal-ai/artifacts/coverage/coverage-summary.json)

Media validation:

- sanitized screenshot pipeline executed successfully with isolated runtime
- full Mission Control gallery regenerated under [docs/screenshots/mission-control](/f:/code/personal-ai/docs/screenshots/mission-control)
- gallery index regenerated: [index.html](/f:/code/personal-ai/docs/screenshots/mission-control/index.html)

## Deferred Debt

1. Clean laptop / clean-pushed-commit installer validation is still operator-run
   - Reason: the current local workspace is not the same thing as a pushed public commit. The next correct step is to push and run the clean laptop install exactly from GitHub.
   - Severity: operational follow-up, not a known code blocker

2. Mission Control build still emits large-chunk warnings for the Three.js vendor path
   - Evidence: `pnpm -r build`
   - Reason: non-blocking for public beta sharing; chunk warning is already known and isolated to the Office-related vendor path.
   - Severity: P3 / deferred

## Fix / Disposition Summary

- Fixed in this sweep:
  - installer/docs/CLI parity
  - runtime-root handling in gateway dev supervisor
  - cross-workspace chat session lookup
  - empty-transcript memory context compose handling
  - deterministic sanitized screenshot pipeline
  - curated screenshot gallery and README media
  - installer-first public docs and release-line update

- Reviewed and left unchanged:
  - [GOATCITADEL.md](/f:/code/personal-ai/GOATCITADEL.md)
  - [VISION.md](/f:/code/personal-ai/VISION.md)
  - [SECURITY.md](/f:/code/personal-ai/SECURITY.md)
  - [CONTRIBUTING.md](/f:/code/personal-ai/CONTRIBUTING.md)
  These were already consistent enough for public beta and did not require content changes in this pass.

## Public-Share Summary

GoatCitadel is ready for public beta sharing from a pushed commit.

Recommended immediate next step:

1. Push the current branch/commit.
2. Perform the clean laptop install from GitHub using the installer-first path in [README.md](/f:/code/personal-ai/README.md).
3. Treat any friction in that run as a new product/doc issue.
