# Public Share Checklist

Last updated: 2026-03-05

Use this before announcing GoatCitadel publicly.

## Product Readiness

- [ ] `pnpm -r typecheck`
- [ ] `pnpm -r test`
- [ ] `pnpm smoke`
- [ ] `pnpm -r build`
- [ ] `pnpm docs:check`
- [ ] `pnpm coverage:collect`
- [ ] `pnpm coverage:gate`

## Security Readiness

- [ ] `GOATCITADEL_AUTH_MODE` is not `none` for non-loopback deployments.
- [ ] Channel/provider secrets are only in environment vars.
- [ ] Break-glass env vars are unset.
- [ ] Remote origin allowlist is explicitly configured.
- [ ] Approval flows tested for risky actions.

## Docs Readiness

- [ ] README reflects current capabilities and limits.
- [ ] CHANGELOG has accurate release notes.
- [ ] Setup docs match actual env/config behavior.
- [ ] Channel setup guide exists for beginners.
- [ ] Security policy is current.

## Release Hygiene

- [ ] Version bumped across workspace packages.
- [ ] Screenshot set refreshed or verified current.
- [ ] No runtime-generated files tracked by git.
- [ ] Commit history grouped logically by feature/fix area.

## Suggested Announcement Positioning

- Local-first operator AI system.
- Guardrail-first automation with explicit approvals.
- Best current channels: TUI, Webchat, Discord, Slack (beta).
- Public roadmap: durable execution, richer replay, mobile companion.
