# GoatCitadel Native Verification Loop

This document defines GoatCitadel's native verification doctrine.

It is intended to make verification explicit, legible, and proportional to risk without importing external verification frameworks wholesale.

## Core Model

Verification is a named gate system, not a vague instruction to "test it a bit."

GoatCitadel verification uses six gate families:

1. **Implementation Integrity**
   - Confirm the local repo is the source of truth.
   - Check current behavior before changing it.
   - Confirm the diff matches the stated objective.
   - Sanity-check dependencies, trust boundaries, and surface ownership when relevant.

2. **Automated Correctness**
   - Run targeted tests first.
   - Run subsystem typecheck for touched areas.
   - Expand to repo-wide checks when blast radius crosses package or surface boundaries.

3. **Regression Discipline**
   - Capture the failing or risky condition when practical.
   - Re-run the same check after the change.
   - Use replayable checks when available, including session replay or prompt-pack replay regression for behavior-sensitive work.

4. **Safety and Trust**
   - Verify auth, policy, tool, and routing guardrails still hold.
   - Verify failures are surfaced honestly.
   - Verify source grounding and evidence language stay trustworthy.

5. **Interactive Proof**
   - For Mission Control, TUI, Office, browser, or other operator-facing work, include direct manual proof targets.
   - Focus on scanability, interruption handling, stale-state behavior, and operator confidence.

6. **Final Decision**
   - Close with a verdict: `ship`, `caution`, or `blocked`.
   - A verdict must be supported by explicit proof, not intuition.

## Evidence Classes

Use evidence that matches the actual risk:

- **Static evidence**
  - code inspection
  - contract/type inspection
  - diff sanity
- **Targeted repro evidence**
  - a specific failing case, then the same case passing
- **Regression evidence**
  - targeted regression tests
  - replay-style checks
  - repeated-turn or repeated-session confirmation
- **Safety evidence**
  - guardrail, auth, policy, or error-path validation
- **Interactive/manual evidence**
  - human-visible behavior proof for UI, TUI, streaming, Office, or browser flows

## Corroboration Rule

Not all signals are equal.

- A single weak or indirect signal usually means `caution`.
- Multiple aligned signals across different evidence classes raise confidence.
- A change is stronger when static review, automated checks, and direct behavior all point the same way.

Examples:

- A code path looks correct, but no repro or test was run: `caution`.
- A bug was reproduced, fixed, and the same repro plus targeted tests now pass: likely `ship`.
- One path passes, but trust, safety, or replay evidence still disagrees: `caution` or `blocked` depending on severity.

## Verdict Language

Use these final decision labels consistently:

- **`ship`**
  - No unresolved high-risk contradiction remains.
  - Validation matches the blast radius.
  - Interactive proof exists where the work is user-visible.

- **`caution`**
  - The change is directionally correct, but evidence is partial.
  - A residual risk, limited blind spot, or unverified branch remains.
  - Safe for targeted/manual testing, but not full sign-off.

- **`blocked`**
  - A release-critical risk is still active.
  - A core guardrail is unverified or failing.
  - The system still behaves in a way that would mislead or break trust for operators or testers.

## Proof Bundle

Every meaningful change should leave behind a compact proof bundle in the handoff, even if no formal artifact file is created.

A GoatCitadel proof bundle should include:

- objective
- scope of change
- checks run
- before/after evidence when applicable
- final verdict
- residual risks
- required restart or manual-test notes

The proof bundle may live in:

- the engineer handoff
- release-hardening notes
- review artifacts under `artifacts/`
- replay or verification outputs already owned by GoatCitadel

GoatCitadel does not require a separate external dashboard or telemetry pipeline for proof bundles.

## Anti-Patterns Rejected

GoatCitadel intentionally does **not** adopt these `wreckit-ralph` patterns:

- home-directory scans
- cross-repo dashboards
- telemetry collection for verification bookkeeping
- mandatory worker swarms or subagent spawning
- external verification scripts as a hard dependency
- mutation testing as a universal required gate

Useful ideas are adopted only when they fit GoatCitadel's existing trust, privacy, and operator model.

## Gate Selection by Work Type

### Localized code change

- implementation integrity
- targeted automated correctness
- regression check if behavior changed

### Shared contracts, routing, auth, storage, chat, or policy work

- implementation integrity
- targeted tests
- subsystem typecheck
- regression discipline
- safety and trust validation

### Mission Control, TUI, Office, or browser-facing work

- implementation integrity
- targeted tests/typecheck
- interactive proof
- stale-state, interruption, and scanability validation

### Release hardening / public-testing work

- repo-wide correctness checks
- regression discipline
- safety and trust checks
- interactive/manual proof where relevant
- explicit `ship` / `caution` / `blocked` verdict

## Relationship to the Coding Workflow

`docs/GOATCITADEL_AGENTIC_CODING_WORKFLOW.md` defines the working loop.

This document defines:

- proof vocabulary
- gate families
- corroboration expectations
- final decision language

Use both together:

- the coding workflow says when and how to prove a change
- the verification loop says what kind of proof is strong enough

## Future Hooks

Likely future integrations:

- `skills/bundled/qa`
- prompt-pack replay regression
- dev verification endpoints under the gateway
- manual test guides under `docs/testing`

These are hooks for later refinement, not new runtime promises in this pass.
