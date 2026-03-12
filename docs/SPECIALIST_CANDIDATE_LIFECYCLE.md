# Specialist Candidate Lifecycle

Last updated: 2026-03-12

This doc defines the bounded design for future self-created specialist agents in GoatCitadel.

The goal is not to let the orchestrator spontaneously grow an unbounded zoo of agents. The goal is to let a run finish with the current roster, then emit a structured improvement item when a reusable specialist would have materially improved that class of task.

## Scope

This is a contract and lifecycle definition only.

It does **not** introduce:

- a new runtime orchestration primitive
- auto-activation of new specialists
- hidden routing to experimental agents
- a second agent registry outside the existing delegation and subagent model

Future implementation must reuse the current delegation, subagent, and session model.

## Core idea

When a run detects a real capability gap:

1. the orchestrator still completes the task with the current roster as best it can
2. the run emits a `specialist candidate` into the improvement lane
3. GoatCitadel may draft a dormant specialist profile for later use
4. that profile stays mostly disabled until approved and explicitly routable

This keeps the system useful in the current turn while turning repeated gaps into structured improvement work.

## Contract

The shared contract lives in:

- `packages/contracts/src/chat.ts`

Key types:

- `ChatSpecialistCandidateStatus`
- `ChatSpecialistCandidateRoutingMode`
- `ChatSpecialistCandidateEvidenceRecord`
- `ChatSpecialistCandidateRoutingHints`
- `ChatSpecialistCandidateRecord`
- `ChatSpecialistCandidateSuggestionRecord`

The current trace contract also allows:

- `ChatTurnTraceRecord.specialistCandidateSuggestions`

That is the intended place to surface these in the future improvement section for a run or turn.

## Lifecycle

Statuses are intentionally separate from routing mode.

### Statuses

- `suggested`
  - a run detected a gap and proposed a candidate
  - no durable specialist profile has to exist yet
- `drafted`
  - GoatCitadel assembled a concrete role/profile draft
  - still not routable by default
- `disabled`
  - the candidate exists durably, but routing is off
  - this is the expected default dormant state
- `approved`
  - the candidate profile passed human or policy review
  - still not necessarily active for general routing
- `active`
  - eligible for future routing under its routing mode and match rules
- `retired`
  - kept for history and audit, no longer eligible for routing

### Routing modes

- `disabled`
  - never auto-routed
  - can be inspected or edited only
- `manual_only`
  - only routed when explicitly selected or approved for the current run
- `strong_match_only`
  - routable only when the match is strong and policy allows it

This split is deliberate: `approved` does not have to mean `always on`.

## Evidence requirements

A specialist candidate should not exist because the system had a vague feeling.

Every candidate should carry evidence such as:

- `role_gap`
  - no current agent was an obvious fit for the objective
- `tool_gap`
  - a tool or connector mismatch forced a worse fallback path
- `skill_gap`
  - the system lacked a reusable workflow or skill for this pattern
- `successful_workaround`
  - the run succeeded, but only through a costly or awkward workaround

Good candidates should capture:

- the lead turn or run that exposed the gap
- the specific reason the current roster was weak
- suggested tools and skills
- routing hints
- a confidence score

## Promotion rules

The orchestrator must not auto-promote candidates casually.

Expected promotion path:

1. repeated gap in similar tasks
2. stable task shape or output contract
3. stable tool or skill boundary
4. clear routing hints
5. explicit approval or policy allowance

Good default:

- first appearance: `suggested`
- after profile drafting: `disabled` + `routingMode=disabled`

## Surface policy

This lifecycle must respect the locked surface identities:

- `Chat`
  - never silently grows a team
  - may surface a specialist candidate as an improvement suggestion only
- `Cowork`
  - primary home for guided swarm growth
  - can suggest or later activate specialists under visible caps and rules
- `Code`
  - can suggest narrow specialists for implementation, review, or test splits
  - remains tighter and more project-bound than Cowork

## Office implications

The future office should treat these as reserve or dormant specialists, not as ambient always-on workers.

Good future visual states:

- suggested specialist
- dormant specialist
- approved reserve specialist
- active specialist attached to a lead run
- retired specialist

## Non-negotiable guardrails

- no silent global registry sprawl
- no creation of a separate team-growth backend model
- no single-run auto-activation
- no hidden routing to low-confidence or dormant candidates
- every activation must remain visible in trace, task linkage, and future office state

## Implementation order

1. contract and lifecycle definition
2. improvement-lane suggestion emission
3. candidate review UI
4. dormant profile storage
5. bounded routing for `manual_only`
6. bounded routing for `strong_match_only`

Only after those exist should GoatCitadel consider runtime self-created specialists real.
