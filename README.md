# GoatCitadel

GoatCitadel is a local-first AI operations platform for people who want ChatGPT-style UX with real policy controls, auditable tool use, and deterministic session truth.

You get one Mission Control surface to run conversations, orchestrate tasks, apply approvals, inspect traces, and manage external capabilities (tools, MCP servers, integrations) without losing safety or observability.

## Why GoatCitadel

- Local-first by default: your runtime, your data paths, your policy.
- Operator-first controls: approvals, grants, deny-wins policy, and replay.
- Agentic chat without hand-wavy magic: tool traces, fallback visibility, and explicit routing.
- Built to evolve: modular contracts, storage-backed state, and API-first UI.

## Who It Is For

- Builders running serious AI workflows on a workstation or self-hosted node.
- Teams that need explainable tool access and safer automation.
- People migrating from "just a chatbot" toward structured operator workflows.

## Who It Is Not For

- One-click SaaS users wanting zero setup.
- Multi-tenant enterprise RBAC/OIDC-heavy deployments (planned, not primary).
- Mobile-first app users (web-first surface today).

## Core Product Capabilities

### Chat Workspace (Agentic)
- Chat, Cowork, and Code interaction modes.
- Session switching, project grouping, and attachment-aware messaging.
- Trace-first execution: tool timeline, routing metadata, citations, fallback notes.
- Explicit approval path for risky actions.

### Prompt Lab
- Import markdown prompt packs with `[TEST-##]` blocks.
- Run one, run next, or run all.
- Score runs against a 0-2 rubric and generate pass/fail summaries.
- Separate execution status from scoring status for honest evaluation.

### Safety and Governance
- Deny-wins policy model.
- Idempotency enforcement on mutating APIs.
- Approval queue with replay history.
- Directory and network boundary controls.

### Skills and Capability Control
- Skill lifecycle states: `enabled`, `sleep`, `disabled`.
- Guarded auto mode for sleeping skills with confidence threshold.
- Activation policies with first-use confirmation controls.
- Skill activation traces to reduce hidden behavior.

### MCP Server Operations
- Register local and remote MCP servers (`stdio`, `http`, `sse`).
- Trust tiers (`trusted`, `restricted`, `quarantined`) and cost posture metadata.
- Per-server policy: first-use approval, redaction, allow/block patterns.
- Tool discovery and invoke testing from Mission Control.

### Operational Console
- Dashboard, system vitals, task board, approvals, integrations, memory, and more.
- Live stream event feed for runtime diagnostics.
- Cost and token visibility with run-cheaper guidance.

## Feature Matrix (What You Actually Get)

| Area | Outcome |
|---|---|
| Chat Workspace | Agentic chat with visible execution traces and approvals |
| Prompt Lab | Repeatable benchmark runs and rubric scoring |
| Tool Access | Fine-grained grants plus policy enforcement |
| MCP Management | Controlled expansion through external tool servers |
| Playbook (Skills) | Dynamic capability activation with runtime posture |
| Gatehouse | Human-in-the-loop approval decisions and replay |
| Feed Ledger | Spend awareness by session/agent/task/day |
| Memory Pasture | Retrieval visibility and context-pack diagnostics |

## Runtime Architecture

- `apps/gateway`: Fastify API and orchestration runtime.
- `apps/mission-control`: React + Vite operator UI.
- `packages/contracts`: shared API/domain contract types.
- `packages/storage`: SQLite repositories + transcript/audit logs.
- `packages/policy-engine`: policy resolver and guard rails.
- `packages/skills`: skill loading, precedence, activation logic.

Primary data locations:
- SQLite: `data/index.db`
- Transcripts: `data/transcripts/<sessionId>.jsonl`
- Audit: `data/audit/*.jsonl`

## Security Model At A Glance

- Mutating operations require `Idempotency-Key`.
- Deny-wins tool policy semantics.
- Approval gates for risky actions.
- Redaction and trust posture support for MCP execution.
- No plaintext secret storage requirement for remote auth references.

## Quick Start (5 Minutes)

### Prereqs
- Node.js 22+
- pnpm
- Git

### 1) Install dependencies

```bash
pnpm install
```

### 2) Start Gateway + Mission Control

```bash
pnpm dev
```

### 3) Open locally
- Mission Control: `http://localhost:5173`
- Gateway health: `http://127.0.0.1:8787/health`

### 4) Validate baseline

```bash
pnpm typecheck
pnpm smoke
pnpm build
```

## Setup Paths

### Unified config source
- `config/goatcitadel.json`

Derived configs (synced at startup):
- `config/assistant.config.json`
- `config/tool-policy.json`
- `config/budgets.json`
- `config/llm-providers.json`
- `config/cron-jobs.json`

Manual sync:

```bash
pnpm config:sync
```

## Mission Control Modules

- `Launch Wizard`: first-time setup and bootstrap.
- `Summit`: operational overview.
- `Chat Workspace`: project/session chat runtime.
- `Prompt Lab`: prompt-pack execution and scoring.
- `Tool Access`: grants and risk posture.
- `Playbook`: skills management.
- `MCP Servers`: external MCP runtime controls.
- `Gatehouse`: approval queue + replay.
- `Trailboard`: tasks, subagents, deliverables.

## API Highlights

### Chat
- `POST /api/v1/chat/sessions/:sessionId/agent-send`
- `POST /api/v1/chat/sessions/:sessionId/agent-send/stream`

### Skills
- `GET /api/v1/skills`
- `PATCH /api/v1/skills/:skillId/state`
- `POST /api/v1/skills/bulk-state`
- `GET /api/v1/skills/activation-policies`
- `PATCH /api/v1/skills/activation-policies`

### MCP
- `GET /api/v1/mcp/servers`
- `POST /api/v1/mcp/servers`
- `PATCH /api/v1/mcp/servers/:serverId`
- `PATCH /api/v1/mcp/servers/:serverId/policy`
- `POST /api/v1/mcp/invoke`

### Prompt Lab
- `POST /api/v1/prompt-packs/import`
- `POST /api/v1/prompt-packs/:packId/tests/:testId/run`
- `POST /api/v1/prompt-packs/:packId/tests/:testId/score`
- `GET /api/v1/prompt-packs/:packId/report`

## Production Readiness Checklist

- [ ] All required providers and models configured.
- [ ] Tool policy reviewed (`deny`, `allow`, profiles).
- [ ] MCP trust tiers and policies configured.
- [ ] Approval flow tested for risky actions.
- [ ] Prompt Lab run + rubric scored for target pack.
- [ ] Backup and restore path validated.
- [ ] Typecheck/test/smoke/build passing.

## Documentation

- Engineering handbook: [`docs/ENGINEERING_HANDBOOK.md`](./docs/ENGINEERING_HANDBOOK.md)
- Install and testing guide: [`docs/INSTALL_SETUP_TESTING.md`](./docs/INSTALL_SETUP_TESTING.md)

## Roadmap Signal

Near-term focus:
- Better extraction reliability and visual fallback.
- Deeper MCP runtime adapters.
- Expanded voice + multimodal reliability.
- UX density improvements for high-volume operators.

## Local-First Promise

GoatCitadel is designed so you can run serious workflows on your own machine and infrastructure, with explicit controls over what tools can do, where data goes, and what must be approved.
