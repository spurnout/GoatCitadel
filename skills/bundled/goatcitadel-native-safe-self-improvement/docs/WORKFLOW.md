# Workflow

## The Safe Flywheel

1. Load `HOT_MEMORY.md`
2. Execute the user's task
3. Capture explicit corrections
4. Log errors and friction
5. Log repeatable wins
6. Log routing gaps
7. Create eval ideas where appropriate
8. Reflect
9. Draft a proposal only when recurrence threshold is met
10. Wait for review

## What Goes Where

### `HOT_MEMORY.md`
Only the shortest, highest-value durable guidance.

### `corrections.md`
Raw explicit user corrections and preference statements.

### `logs/LEARNINGS.md`
Durable lessons with recurrence tracking.

### `logs/ERRORS.md`
Failures, bad assumptions, and mitigations.

### `logs/FEATURE_REQUESTS.md`
Missing capabilities and desired future features.

### `logs/ROUTING_GAPS.md`
Cases where the wrong surface, tool, or model was chosen.

### `logs/EVAL_IDEAS.md`
Future regressions, scenarios, and eval prompts.

### `reflections.md`
Compact post-task self-review.

### `proposals/pending/*.md`
Reviewable changes, never auto-applied.

## Recurrence Heuristic

Promote only when a pattern:
- repeats at least 3 times
- spans 2 or more distinct tasks or sessions
- remains valid after reflection
- can be expressed in a concise rule or playbook step
- does not widen permissions

## Preferred Proposal Targets

- AGENTS.md for durable execution rules
- TOOLS.md for tool routing and constraints
- SOUL.md for stable behavioral guidance
- PLAYBOOKS for multi-step workflows
- ROUTING.md for surface/model selection
- EVALS.md for replayable regressions
- HOT_MEMORY.md for explicit durable user-facing preferences only
