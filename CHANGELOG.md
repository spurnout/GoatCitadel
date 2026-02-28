# Changelog

All notable changes to GoatCitadel are documented in this file.

The format is inspired by Keep a Changelog and uses semantic pre-release tags.

## [0.1.0-beta.1] - 2026-02-28

Initial beta baseline for private testing.

### Added

- Core platform architecture:
  - TypeScript monorepo with `apps/gateway`, `apps/mission-control`, and shared `packages/*`.
  - Local-first runtime with no Docker dependency.
- Gateway control plane:
  - Deterministic session routing and canonical session ownership.
  - Append-only JSONL transcripts and audit streams.
  - Gateway-owned token and cost accounting.
  - Idempotent mutation flow with indexed dedupe tracking.
- Tool policy and sandboxing:
  - Deny-wins policy resolver (`profile + allow + deny + per-agent overrides`).
  - Path jail and read scope enforcement.
  - Network allowlist gate.
  - Risky shell approval gates with replayable audit.
- Approval lifecycle:
  - Approval queue API and replay trail.
  - Async layman explainer with status (`pending/completed/failed`).
  - Realtime approval events.
- Skills system:
  - `SKILL.md` + YAML frontmatter parser.
  - Deterministic source precedence and conflict handling.
  - Activation resolution (explicit, keyword, dependency-aware).
- Mission Control UI:
  - Dashboard, system vitals, files, memory, agents, office, activity, cron, sessions, skills, costs, settings, approvals, tasks, integrations, mesh, onboarding.
  - API-first operations and SSE-driven live updates.
  - Office WebGL scene (central operator + radial goat subagents).
- Integrations and providers:
  - OpenAI-compatible `/v1/chat/completions` support.
  - Multi-provider runtime config and model discovery endpoints.
  - Integration catalog and connection lifecycle APIs.
- Mesh foundation:
  - Node membership, leases, session ownership, replication logs/offsets.
  - Mesh status and control API surface.
- Onboarding:
  - Web onboarding wizard (`/api/v1/onboarding/*`).
  - TUI onboarding (`pnpm onboarding:tui` / `goatcitadel onboard`).
- Installation and CLI:
  - Cross-platform installers: `install.ps1`, `install.cmd`, `install.sh`.
  - `goatcitadel` CLI launcher with `install/update/up/gateway/ui/onboard/smoke/doctor`.
- Unified configuration:
  - Canonical `config/goatcitadel.json`.
  - Automatic startup sync to split config files.
  - Manual sync command: `pnpm config:sync`.
- Gateway dev hot reload supervisor:
  - Restart-on-change supervisor for gateway dev runtime.
  - Child process tree termination and port release checks.
  - Health-checked restart readiness.
- Testing and validation:
  - Repository typecheck/test/build scripts.
  - Smoke tests covering gateway, sessions, tools, approvals, integrations, mesh, onboarding.
- Documentation:
  - Public README with install/run/config guidance.
  - Engineering handbook for architecture and operational behavior.
  - Screenshot gallery moved to `docs/screenshots/mission-control`.

### Changed

- Public repo hygiene cleanup:
  - Removed internal `.claude` settings from tracked files.
  - Removed private review artifacts from tracked files.
  - Moved public screenshots from `artifacts/` to `docs/screenshots/`.

### Notes

- This beta is intended for active local/private testing and iterative hardening.
- API and config contracts may evolve before stable `1.0.0`.
