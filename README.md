# GoatCitadel

> [!WARNING]
> Active development in progress. Expect fast iteration and occasional breaking changes.

GoatCitadel is a local-first AI operations platform for running agentic workflows with real guardrails.
It is built for people who want model speed and automation, but with approvals, policy controls, traceability, and recovery paths.

## What GoatCitadel Is

GoatCitadel is not a single chatbot page. It is an operator system with:

- guided chat + tool orchestration,
- policy-enforced execution,
- human approvals for risky actions,
- replayable traces and auditability,
- MCP and skills expansion,
- workspace and guidance personalization,
- benchmark-driven quality testing.

## Why People Use It

- **Control over convenience**: you decide what tools run, when, and under what policy.
- **Explainable operations**: approvals, events, traces, and session history are visible.
- **Local-first posture**: data and runtime are on your machine/infrastructure.
- **Safety by default**: deny-wins policy, approval gates, bounded risk patterns.
- **Operator UX**: one Mission Control surface for chat, tests, tasks, memory, costs, and integrations.

## Core Capabilities (Deeper View)

### 1) Agentic Chat Workspace

Chat is split by intent, not just by model:

- `Chat`: quick assistance and reasoning.
- `Cowork`: collaborative planning and structured handoffs.
- `Code`: implementation-heavy workflows and technical output.

Includes:

- project/session organization,
- model and mode controls,
- attachments + citations + traces,
- constraints/workarounds surfacing when tools are blocked,
- workspace-aware behavior via guidance docs.

### 2) Prompt Lab (Quality and Regression)

Prompt Lab turns prompting into an engineering loop:

- import markdown test packs (`[TEST-##]`),
- run single/next/all,
- auto-score with model + rule checks,
- separate **run failures** (runtime/tooling) from **score failures** (quality),
- benchmark matrix across provider/model combinations,
- export reports for historical comparison.

### 3) Safety, Policy, and Approvals

Execution model:

- deny-wins policy resolution,
- explicit tool grants by scope (`task > agent > session > global`),
- idempotency requirement on mutating operations,
- approval queue + replay timeline for risky actions,
- policy-aware fallback behavior when action is blocked.

### 4) MCP + Skills Runtime Expansion

GoatCitadel supports expanding capabilities without giving up control:

- MCP server registration (`stdio`, `http`, `sse`),
- trust tiers and per-server policy posture,
- skills state controls (`enabled`, `sleep`, `disabled`),
- guarded activation policies,
- import validation + provenance tracking,
- dual-source skill discovery with explicit install review.

### 5) Optional Knowledge Integrations

Optional integrations stay optional. Example:

- Obsidian vault integration can be enabled for read/append-safe workflows,
- disabled by default,
- path-guarded to allowed subpaths.

### 6) Operational Observability

Mission Control surfaces runtime health, not just responses:

- realtime event stream,
- session/task/system visibility,
- cost tracking with tracked-vs-unknown usage context,
- refresh/freshness status,
- prompt test and benchmark outcomes.

## Who It’s For

- builders and operators running serious local/self-hosted AI workflows,
- teams that need auditability and controllable automation,
- users who want AI assistance without black-box behavior.

## Who It’s Not For (Yet)

- zero-setup SaaS expectations,
- enterprise-grade multi-tenant RBAC/OIDC-heavy compliance stacks,
- mobile-first-only operations.

## Screenshots

### Summit Dashboard

![Summit Dashboard](docs/screenshots/mission-control/dashboard.png)

### Chat Workspace

![Chat Workspace](docs/screenshots/mission-control/chat.png)

### Prompt Lab

![Prompt Lab](docs/screenshots/mission-control/prompt-lab.png)

### Sessions and Runs

![Runs and Session Views](docs/screenshots/mission-control/sessions.png)

### Tool Access

![Tool Access](docs/screenshots/mission-control/tools.png)

### Skills

![Skills](docs/screenshots/mission-control/skills.png)

### Integrations

![Integrations](docs/screenshots/mission-control/integrations.png)

### MCP and Workspaces

![MCP Servers](docs/screenshots/mission-control/mcp.png)

![Workspaces](docs/screenshots/mission-control/workspaces.png)

More screenshots: [`docs/screenshots/mission-control`](docs/screenshots/mission-control)

Refresh screenshots locally:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture-mission-control-screenshots.ps1
```

## Quick Start

### Prerequisites

- Node.js `22+`
- `pnpm`
- Git

### Install

```bash
git clone https://github.com/<your-org-or-user>/goatcitadel.git
cd goatcitadel
pnpm install
pnpm config:sync
```

### Verify

```bash
pnpm -r typecheck
pnpm -r test
pnpm smoke
pnpm -r build
```

### Doctor (diagnose + safe repair)

```bash
goatcitadel doctor
```

Useful flags:

- `--audit-only` / `--no-repair`: diagnostics only, no file writes.
- `--deep`: include runtime/onboarding API checks.
- `--yes`: auto-approve guarded repair prompts.
- `--json`: machine-readable output.

Full setup/testing guide: [`docs/INSTALL_SETUP_TESTING.md`](docs/INSTALL_SETUP_TESTING.md)

## First 10 Minutes for New Users

1. Open Mission Control and complete onboarding.
2. Start in `Chat Workspace` with one concrete task.
3. Use this prompt shape:
   - Goal
   - Context
   - Constraints
   - Output format
4. If you want reliability testing, import a prompt pack in Prompt Lab and run a subset first.
5. Use approvals and policy controls for anything risky.

Beginner prompt library: [`docs/GoatCitadel_Prompt_Library.md`](docs/GoatCitadel_Prompt_Library.md)

## API Highlights

### Chat

- `POST /api/v1/chat/sessions/:sessionId/agent-send`
- `POST /api/v1/chat/sessions/:sessionId/agent-send/stream`

### Prompt Lab

- `POST /api/v1/prompt-packs/import`
- `POST /api/v1/prompt-packs/:packId/tests/:testId/run`
- `POST /api/v1/prompt-packs/:packId/tests/:testId/score`
- `GET /api/v1/prompt-packs/:packId/report`
- `POST /api/v1/prompt-packs/:packId/benchmark/run`
- `GET /api/v1/prompt-packs/benchmark/:benchmarkRunId`

### Skills

- `GET /api/v1/skills`
- `PATCH /api/v1/skills/:skillId/state`
- `POST /api/v1/skills/bulk-state`
- `GET /api/v1/skills/sources`
- `POST /api/v1/skills/import/validate`
- `POST /api/v1/skills/import/install`
- `GET /api/v1/skills/import/history`

### MCP

- `GET /api/v1/mcp/servers`
- `POST /api/v1/mcp/servers`
- `PATCH /api/v1/mcp/servers/:serverId`
- `PATCH /api/v1/mcp/servers/:serverId/policy`
- `POST /api/v1/mcp/invoke`

### Workspaces + Guidance

- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `PATCH /api/v1/workspaces/:workspaceId`
- `GET /api/v1/guidance/global`
- `PUT /api/v1/guidance/global/:docType`
- `GET /api/v1/workspaces/:workspaceId/guidance`
- `PUT /api/v1/workspaces/:workspaceId/guidance/:docType`

## Architecture (High Level)

- `apps/gateway`: Fastify API + orchestration runtime
- `apps/mission-control`: React + Vite UI
- `packages/contracts`: shared API/domain contracts
- `packages/storage`: SQLite repositories + transcript/audit persistence
- `packages/policy-engine`: policy and guard logic
- `packages/skills`: skill loader and activation behavior

Local data:

- `data/index.db`
- `data/transcripts/<sessionId>.jsonl`
- `data/audit/*.jsonl`

## Security Snapshot

- deny-wins policy semantics,
- approval-first for risky operations,
- idempotency keys for mutating routes,
- policy-gated tool execution,
- runtime warnings for weak remote auth posture.

## Documentation

- Install/setup/testing: [`docs/INSTALL_SETUP_TESTING.md`](docs/INSTALL_SETUP_TESTING.md)
- Engineering handbook: [`docs/ENGINEERING_HANDBOOK.md`](docs/ENGINEERING_HANDBOOK.md)
- MCP + skills curation: [`docs/MCP_SKILLS_CURATION.md`](docs/MCP_SKILLS_CURATION.md)
- Prompt library: [`docs/GoatCitadel_Prompt_Library.md`](docs/GoatCitadel_Prompt_Library.md)
- Optional Obsidian integration: [`docs/OBSIDIAN_OPTIONAL_INTEGRATION.md`](docs/OBSIDIAN_OPTIONAL_INTEGRATION.md)
- Skill import trust policy: [`docs/SKILL_IMPORT_AND_TRUST_POLICY.md`](docs/SKILL_IMPORT_AND_TRUST_POLICY.md)
- Feature-gap roadmap: [`docs/AGENTIC_FEATURE_GAP_MATRIX.md`](docs/AGENTIC_FEATURE_GAP_MATRIX.md)
- Runtime guidance: [`GOATCITADEL.md`](GOATCITADEL.md)
- Agent conventions: [`AGENTS.md`](AGENTS.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

## Local-First Promise

GoatCitadel is built so you can run high-leverage AI workflows on infrastructure you control, with transparent execution and explicit safety boundaries.
