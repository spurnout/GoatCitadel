# MCP + Skills Curation Matrix (GoatCitadel)

This document captures the curated MCP server and skill strategy for GoatCitadel production hardening.

## Selection principles

1. Prefer free/self-hostable paths first.
2. Keep overlapping tools minimized to reduce risk and token waste.
3. Enforce trust tiers and explicit policy boundaries before enabling broad automation.
4. Start with a curated core; phase in optional/specialized stacks later.

## MCP server curation

## Core set (enable first)

| Server | Category | Cost posture | Default trust | Reason |
|---|---|---|---|---|
| GitHub MCP | development | mixed | restricted | High-value repo/PR workflows, mature ecosystem |
| Playwright MCP | browser | free | restricted | Deterministic browser automation and extraction |
| Context7 MCP | research | unknown | restricted | Strong coding/docs context retrieval |
| n8n MCP | automation | mixed | restricted | Workflow automation hub with self-host path |
| GPT Researcher MCP | research | mixed | restricted | Deep source synthesis workflows |
| OpenSpec MCP | orchestration | unknown | restricted | Structured spec and planning support |

## Optional set (phase 2)

| Server | Category | Cost posture | Default trust | Notes |
|---|---|---|---|---|
| MindsDB MCP | data | mixed | restricted | Useful if data/ML query workflows are active |
| Blender MCP | creative | free | restricted | Useful for 3D/media pipelines |
| Task Master MCP | orchestration | unknown | restricted | Validate maintenance status before rollout |

## Deprioritized overlaps

- Chrome DevTools MCP
- Chrome Browser MCP
- Steel Browser MCP

Decision: Playwright remains primary browser automation layer to avoid duplicate browser-control surfaces.

## Quarantine candidates (insufficient confidence)

- Superpowers
- Ruflo
- Skill Seeker
- Archon / Claude Flow / Zen / HexStrike (enable one at a time only after validation)

## MCP enforcement defaults

1. `trustTier = restricted` by default.
2. `policy.redactionMode = basic` by default.
3. `policy.requireFirstToolApproval = false` by default; set to true for sensitive servers.
4. Use allow/block tool patterns before enabling mission sessions.

## Skills curation

## Core keep set

- github-integration-3
- coding-agent-orchestrator-1
- mcp-integration-1
- skill-finder-installer
- react-code-fix-linter
- web-automation-browser-control
- javascript-seo-auditor
- resource-curator
- frontend-design-7
- web-design-guidelines-auditor

## Conditional keep set

- heroui-react-v3-component-guide
- google-workspace-cli-assistant
- n8n-pull-request-creator
- next-js-cache-components-expert
- next-js-documentation-updater
- interactive-book-translator

## Overlap reductions

1. `prompt-finder-enhancer` over `prompt-lookup`
2. Keep JS doc workflow + fact checker, sleep standalone writer
3. Keep minimal plugin/command/skill authoring cluster; sleep redundant variants

## Skill runtime lifecycle

- `enabled`: always eligible for activation.
- `sleep`: guarded auto mode (high confidence + first-use confirmation).
- `disabled`: never selected by resolver until manually re-enabled.

## Guarded auto defaults

- `guardedAutoThreshold = 0.72`
- `requireFirstUseConfirmation = true`

## Operational concerns

1. Treat external skill/MCP repos as untrusted by default.
2. Verify license, maintainer activity, and security posture before enabling.
3. Keep audit trails for state/policy changes and activation outcomes.
4. Revalidate curated set monthly or before major release freezes.
