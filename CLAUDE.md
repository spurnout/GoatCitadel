# CLAUDE Repository Guidance

This file documents workflow guidance for Claude-like coding assistants in GoatCitadel.

## Scope

Global default guidance. Workspace override may be provided via `workspaces/<workspaceId>/CLAUDE.md`.

## Core Workflow

1. Read relevant contracts and route/service files before edits.
2. Prefer additive, backward-compatible changes.
3. Preserve deny-wins, approvals, and grants precedence.
4. Run validation gates before declaring completion.

## Required Validation

Run from repo root:

```bash
pnpm -r typecheck
pnpm -r test
pnpm smoke
pnpm -r build
```

For docs/governance changes also run:

```bash
pnpm docs:check
```

## Editing Conventions

- Keep changes minimal and explicit.
- Do not remove unrelated user changes from a dirty worktree.
- Avoid silent behavior changes; document material impacts.
- Prefer clear names and deterministic control flow.

## Runtime Quality Rules

- Surface tool failures in final responses.
- Separate execution failures from quality-score failures where applicable.
- Maintain role-handoff section integrity on orchestration prompts.

## Security Rules

- Never bypass policy engine checks.
- Never auto-disable approval requirements.
- Keep host/origin controls explicit for non-loopback deployments.

