# Install

Create this folder inside the GoatCitadel workspace:

```text
.goatcitadel/self-improvement/
```

Copy the templates into place:

- `templates/HOT_MEMORY.md` -> `.goatcitadel/self-improvement/HOT_MEMORY.md`
- `templates/corrections.md` -> `.goatcitadel/self-improvement/corrections.md`
- `templates/reflections.md` -> `.goatcitadel/self-improvement/reflections.md`
- `templates/index.md` -> `.goatcitadel/self-improvement/index.md`
- `templates/target-map.md` -> `.goatcitadel/self-improvement/target-map.md`
- `templates/logs/LEARNINGS.md` -> `.goatcitadel/self-improvement/logs/LEARNINGS.md`
- `templates/logs/ERRORS.md` -> `.goatcitadel/self-improvement/logs/ERRORS.md`
- `templates/logs/FEATURE_REQUESTS.md` -> `.goatcitadel/self-improvement/logs/FEATURE_REQUESTS.md`
- `templates/logs/ROUTING_GAPS.md` -> `.goatcitadel/self-improvement/logs/ROUTING_GAPS.md`
- `templates/logs/EVAL_IDEAS.md` -> `.goatcitadel/self-improvement/logs/EVAL_IDEAS.md`

Also create these directories:

```text
.goatcitadel/self-improvement/projects/
.goatcitadel/self-improvement/domains/
.goatcitadel/self-improvement/archive/
.goatcitadel/self-improvement/proposals/pending/
.goatcitadel/self-improvement/proposals/approved/
```

## Recommended Runtime Policy

Run this skill with a sandbox policy equivalent to:

- read/write: `.goatcitadel/self-improvement/**`
- read-only: nothing else
- network: disabled
- shell: optional, but not needed
- package installation: disabled
- secret access: disabled

## First Run

Start with empty templates.
Do not preload assumptions.

Seed only items that are already explicit and durable, such as:
- stable formatting preferences
- durable user workflow preferences
- recurring tool gotchas already confirmed multiple times

Everything else should earn its way in through the logs.
