# Durable Runs + Replay Foundation (Feature-Flagged)

This document tracks the additive durable execution scaffolding introduced for GoatCitadel without changing the current default runtime path.

## Scope

- Add database schema for durable run bookkeeping.
- Add storage repository methods for runs, checkpoints, retries, and dead letters.
- Add read-only diagnostics API routes.
- Keep feature disabled by default.

## Feature Flag

- `assistant.durable.enabled` in gateway config (default: `false`)
- Env override: `GOATCITADEL_DURABLE_FOUNDATION_ENABLED=true|false`
- Diagnostics toggle (reserved): `assistant.durable.diagnosticsEnabled` and `GOATCITADEL_DURABLE_DIAGNOSTICS_ENABLED`

## Schema Added

Migration `v21` creates:

- `durable_runs`
- `durable_checkpoints`
- `durable_retries`
- `durable_dead_letters`

No existing tables were changed or dropped.

## Contracts Added

- `DurableRunRecord`
- `DurableCheckpointRecord`
- `DurableRetryRecord`
- `DurableDeadLetterRecord`
- `DurableDiagnosticsResponse`

## API Added (Read-Only)

- `GET /api/v1/durable/diagnostics`
- `GET /api/v1/durable/runs?limit=...`
- `GET /api/v1/durable/dead-letters?limit=...`
- `GET /api/v1/durable/runs/:runId/checkpoints?limit=...`

## Safety Defaults

- Foundation is additive only.
- No scheduler/execution path switches were introduced.
- No automatic replay retries were enabled by this change.
- Existing orchestration/improvement behavior remains unchanged.

## Implementation Checklist

- [x] Storage migration and repository scaffolding
- [x] Contract exports
- [x] Gateway read-only diagnostics methods
- [x] Gateway route registration
- [x] Repository skeleton tests
- [ ] Execution-engine adoption (future phase)
- [ ] Queue consumers / idempotent worker runtime (future phase)
- [ ] DLQ operator actions (future phase)

## Next Step (Activation Plan)

1. Add durable worker loop behind a second flag.
2. Migrate one low-risk flow (manual replay) to durable queue mode.
3. Validate retries and checkpoint resume end-to-end in staging.
4. Add DLQ triage UI and replay-with-overrides action.

