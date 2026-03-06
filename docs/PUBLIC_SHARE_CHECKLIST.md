# Public Share Checklist

Last updated: 2026-03-05
Target release: `0.6.0-beta.2`

Use this checklist before you announce GoatCitadel publicly or hand a clean install to external testers.

## Engineering Gates

- [ ] `pnpm -r typecheck`
- [ ] `pnpm -r test`
- [ ] `pnpm smoke`
- [ ] `pnpm -r build`
- [ ] `pnpm docs:check`
- [ ] `pnpm coverage:collect`
- [ ] `pnpm coverage:gate`

## Install Readiness

- [ ] Windows installer path works from a clean directory.
- [ ] macOS/Linux installer path is documented accurately.
- [ ] Manual clone path works exactly as documented.
- [ ] `goatcitadel` and `goat` launchers expose the same command surface as the repo CLI.
- [ ] First-run guidance says `goat up` before `goat onboard`.
- [ ] Update flow works with `goatcitadel update`.

## Security Readiness

- [ ] `GOATCITADEL_AUTH_MODE` is `token` or `basic` for any non-loopback deployment.
- [ ] Break-glass env vars are unset.
- [ ] Channel/provider secrets are only in environment variables.
- [ ] Remote origin allowlist is explicitly configured if UI is exposed beyond loopback.
- [ ] Approval flow works for intentionally risky actions.

## Docs Readiness

- [ ] README is installer-first and beginner-safe.
- [ ] Manual/dev install instructions are present and accurate.
- [ ] CHANGELOG matches the current release line.
- [ ] Communication channel guide is current.
- [ ] Install/setup/testing guide matches real launcher behavior.
- [ ] Add-ons trust policy and Arena integration contract are published if Add-ons are visible in the UI.
- [ ] VISION status matrix and feature-gap reconciliation are current enough to describe beta scope honestly.

## Media Readiness

- [ ] Screenshot gallery has been regenerated or verified current.
- [ ] README screenshots are clipped/curated, not full-page dumps.
- [ ] Screenshot pipeline uses sanitized demo data.
- [ ] No screenshot contains local paths, secrets, or personal content.

## Repo Hygiene

- [ ] No runtime-generated files are intentionally tracked.
- [ ] Local-only files remain unstaged.
- [ ] Commit history is grouped logically enough to review.
- [ ] Release version is bumped consistently across workspace packages.

## Feature Closure Readiness

- [ ] Durable runs / replay / review queue closure is honest relative to current beta claims.
- [ ] Memory lifecycle admin is complete enough for public beta, or explicitly marked partial in docs.
- [ ] MCP runtime templates match the curated core set exposed in docs and UI.
- [ ] Skills and MCP discovery surfaces include trust labels and review-before-install warnings.
- [ ] Optional Add-ons install flow always shows separate-repo provenance and explicit consent.

## Suggested Announcement Positioning

- Local-first AI operations platform
- Guardrail-first automation with approvals and traces
- Web Mission Control plus native TUI
- Optional ecosystem: MCP, Skills, and Add-ons with explicit trust boundaries
- Best first external channel: Discord
- Public beta, not general availability

## Sign-Off

- Verified by:
- Verified date:
- Verified commit:
- Notes:
