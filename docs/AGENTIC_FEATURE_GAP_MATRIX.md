# GoatCitadel Agentic Feature Gap Matrix (2025-2026)

This matrix maps common market requests to current GoatCitadel capability and identifies the next build lane.

## Legend

- `Have`: production-usable path exists now.
- `Partial`: capability exists but has functional/UX/scale gaps.
- `Missing`: no first-class implementation yet.

## Matrix

| Requested capability | Current status in GoatCitadel | Gap severity | Recommended next action |
|---|---|---:|---|
| Human-in-the-loop approvals, pause/resume | **Have / Partial** | Medium | Tighten resume-from-checkpoint UX so users continue from exact step state. |
| Run observability, traceability, replay | **Partial** | High | Add timeline replay with editable step overrides and comparison reruns. |
| Durable long-running execution (checkpoint/retry/event wait/DLQ) | **Partial / Missing** | **Critical** | Build durable job kernel with persisted checkpoints, idempotent retries, and dead-letter queue. |
| Security scopes, deny-first policy, audit | **Have** | Low | Continue policy linting and preflight diagnostics. |
| Standardized tool/connectors (MCP + discovery) | **Have** | Medium | Expand template discovery and health diagnostics for connectors. |
| Memory lifecycle controls (inspect/edit/forget/TTL) | **Partial** | High | Add memory admin controls: pin, TTL override, targeted forget, change history. |
| Realtime multimodal interaction (voice/screen/event reaction) | **Partial** | Medium | Improve operator explanations and flow, then add structured event hooks. |
| Computer-use automation with safety rails | **Partial** | High | Add explicit step-verification and confirm-before-submit defaults for browser actions. |
| Scheduling + background automation + review queue | **Have / Partial** | Medium | Add richer result inbox with change diff summaries and retry actions. |
| Evals + regression suite for agents | **Have** | Medium | Add replay-based regression packs and per-capability trend alerts. |

## Locked Next Lane (90 Days)

Priority is **Durable runs + replay**.

### Phase 1: Durable execution kernel

1. Persist run graph state per step.
2. Support pause/resume from checkpoint.
3. Add idempotent retry policies (bounded, backoff, cause-aware).
4. Add dead-letter queue with operator recovery actions.

### Phase 2: Replay with overrides

1. Replay any run from selected step.
2. Allow step result override (tool response, prompt patch, policy decision).
3. Emit side-by-side outcome diff (latency/cost/success deltas).

### Phase 3: Operational guardrails

1. Alert on rising retry/failure cohorts.
2. Add replay audit attribution.
3. Add runbook shortcuts for recurring failure classes.

## Measurable Success Criteria

1. 95% of interrupted runs can resume from checkpoint without full rerun.
2. 0 duplicate side effects in retry scenarios covered by idempotency policy.
3. Dead-letter backlog has deterministic recovery actions for every item.
4. Replay-with-override flow is usable in under 3 operator clicks from run details.
5. Prompt Lab regression trend includes replay-derived quality deltas by model/profile.

