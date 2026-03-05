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
- [ ] `goatcitadel` and `gc` launchers expose the same command surface as the repo CLI.
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

## Suggested Announcement Positioning

- Local-first AI operations platform
- Guardrail-first automation with approvals and traces
- Web Mission Control plus native TUI
- Best first external channel: Discord
- Public beta, not general availability
