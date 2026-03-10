# GoatCitadel Target Surfaces

This skill should think in terms of **proposal targets**, not direct mutations.

Current repo guarantee in this pass:

- `AGENTS.md`
- `docs/*` style destinations

Targets like `TOOLS.md`, `SOUL.md`, `ROUTING.md`, `EVALS.md`, and `PLAYBOOKS/` are valid conceptual proposal destinations, but they are not auto-created here. If they do not exist, keep the proposal draft under `.goatcitadel/self-improvement/proposals/pending/` and label the intended target clearly.

## AGENTS.md
Use for:
- general execution rules
- multi-step review checklists
- coordination rules between surfaces or agents
- recurring anti-footgun guidance

Do not use for:
- personal style preferences
- one-off project notes
- ephemeral experiments

## TOOLS.md
Use for:
- tool selection guidance
- preflight checks
- error handling notes
- safe/unsafe tool boundaries
- routing warnings

Do not use for:
- identity or tone rules
- feature roadmap items

## SOUL.md
Use for:
- stable assistant behavior
- long-lived voice and collaboration norms
- user-trust guardrails
- reflective posture rules

Do not use for:
- operational file paths
- detailed workflow steps
- per-tool minutiae

## PLAYBOOKS/*.md
Use for:
- repeatable workflows
- troubleshooting runbooks
- install flows
- evaluation or QA loops

Do not use for:
- single-sentence guardrails that belong in AGENTS.md

## ROUTING.md
Use for:
- surface choice rules
- model choice rules
- escalation criteria
- when to browse, search, ask, or propose

## EVALS.md
Use for:
- regression scenarios
- benchmark prompts
- test cases
- replayable failures

## HOT_MEMORY.md
Use for:
- explicit durable user preferences
- compact high-value reminders
- proven recurring gotchas

Keep it tiny. It is a scalpel, not a junk drawer.
