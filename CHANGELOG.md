# Changelog

All notable changes to GoatCitadel are documented in this file.

The format is inspired by Keep a Changelog and uses semantic pre-release tags.

## [Unreleased]

Target release: `0.6.0-beta.1`

### Added

- First-class workspace domain foundation:
  - `workspaces` table and repository with `create/list/update/archive/restore`.
  - Backward-compatible default workspace (`default`) backfill for existing records.
  - Workspace scoping columns added to core chat/task entities (`chat_projects`, `chat_session_meta`, `chat_session_bindings`, `chat_attachments`, `tasks`).
- Workspace and guidance APIs:
  - `GET/POST/PATCH` workspace lifecycle endpoints.
  - Global guidance and workspace guidance read/write endpoints.
- Runtime guidance resolution:
  - Global + workspace override precedence.
  - Bounded guidance injection on chat send/stream paths.
  - Trace metadata for applied guidance sources and truncation state.
  - Guidance injection kill-switch for debugging (`GOATCITADEL_DISABLE_GUIDANCE_INJECTION`).
- Mission Control workspace UX:
  - Workspaces page with switch/create/archive/restore.
  - Guidance editor for global and workspace scopes.
  - Active workspace selection persisted in UI preferences.
  - Core pages wired to active workspace context (chat, tasks, files, memory, plus workspace-aware page props for prompt/improvement flows).
- Governance documentation set:
  - `GOATCITADEL.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `VISION.md`.
  - `GOATCITADEL_LEARNING_LOG.md` for validated self-improvement tracking.
  - Workspace override templates under `workspaces/default/`.
- Docs validation script:
  - `pnpm docs:check` validates required governance docs and headings.
- Optional Bankr migration assets:
  - `docs/OPTIONAL_BANKR_SKILL.md`
  - `templates/skills/bankr-optional/SKILL.md`
- Production-readiness hardening additions:
  - `chat_messages` projection table and repository-backed chat message listing.
  - Batch session autonomy preferences repository path for proactive scheduler flows.
  - Hot-path storage indexes for approvals, tool invocations, and policy blocks.
  - Expanded route/service tests for auth/chat/orchestrator and storage hot paths.
- Public-share docs and review assets:
  - `docs/COMMUNICATION_CHANNEL_SETUP_GUIDE.md`
  - `docs/PUBLIC_SHARE_CHECKLIST.md`
  - `docs/CLAUDE_PERFORMANCE_EFFICIENCY_REVIEW_PROMPT.md`
  - `docs/CLAUDE_UI_UX_HUMANIZATION_PROMPT.md`
  - `artifacts/perf/PERF_REVIEW_TRIAGE_TEMPLATE.md`

### Changed

- Contracts updated with workspace and guidance types in shared package exports.
- Chat/task contract records expanded with optional `workspaceId`.
- Chat turn traces now support persisted `guidance` metadata.
- README and docs positioning updated to include governance and workspace behavior expectations.
- Built-in Bankr moved behind feature flag default-off (`bankrBuiltinEnabled: false`).
- Legacy Bankr built-in endpoints now return migration guidance (`410`) while disabled.
- Mission Control Skills page now shows a compact Bankr migration card instead of built-in Bankr policy controls.
- Root/workspace package versions bumped to `0.6.0-beta.1`.
- README refreshed for public-facing use:
  - screenshot layout in compact table form,
  - explicit docs links for channel setup and public share checklist.

### Notes

- This release remains pre-1.0 and backward-compatible by defaulting omitted workspace references to `default`.
- Product release history stays in `CHANGELOG.md`; validated runtime learning outcomes are tracked separately in `GOATCITADEL_LEARNING_LOG.md`.

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
