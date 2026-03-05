# GoatCitadel

> [!IMPORTANT]
> GoatCitadel is currently a public beta. The install paths and core validation gates are ready for external testing, but you should still expect fast iteration before 1.0.

Current release line: `0.6.0-beta.2`

GoatCitadel is a local-first AI operations platform for people who want more than a chat box: guardrails, approvals, traces, recoverability, prompt testing, runtime visibility, and channel integrations under one roof.

## What GoatCitadel Is

GoatCitadel is an operator system for serious AI workflows:

- agentic chat with tool orchestration
- explicit tool policy and approval gates
- Mission Control web UI and a native TUI
- prompt testing and benchmark workflows
- MCP, skills, integrations, and workspace guidance
- local-first runtime with your data on your machine or infrastructure

## Who It Is For

- builders running local or self-hosted AI workflows
- operators who need auditability and explicit control
- technical users who want a TUI as well as a browser UI
- teams experimenting with guarded automation before wider rollout

## Public Beta Scope

GoatCitadel is share-ready for public beta testing, not general availability.

Current strengths:

- installable from GitHub with home-folder launcher setup
- strict validation gates and coverage gate in place
- installer-first docs plus manual/developer path
- web Mission Control plus terminal workflows
- Discord and Slack are viable first external channels

Still evolving:

- durable execution and replay depth
- richer mobile/companion monitoring
- deeper team and multi-tenant collaboration features

## Quick Install

Default installer location is your home directory under `~/.GoatCitadel` with launchers in `~/.GoatCitadel/bin`.

### Windows (recommended)

Safer download-and-run flow:

```powershell
iwr https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Power-user one-liner:

```powershell
iwr -useb https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.ps1 | iex
```

Optional custom install root:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -InstallDir "$HOME\\.GoatCitadel"
```

### macOS / Linux

Safer download-and-run flow:

```bash
curl -fsSL https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.sh -o install.sh
bash install.sh
```

Power-user one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.sh | bash
```

Optional custom install root:

```bash
bash install.sh --install-dir "$HOME/.GoatCitadel"
```

### Verify The Installed Launcher

```bash
goatcitadel doctor --deep
goatcitadel onboard
goatcitadel up
```

Short alias also works:

```bash
gc doctor --deep
gc up
```

### Update An Existing Install

```bash
goatcitadel update
```

## Manual Install / Dev Install

Use this path if you want the raw repo, contributor workflow, or a clean install-from-source validation.

```bash
git clone https://github.com/spurnout/GoatCitadel.git
cd GoatCitadel
corepack enable
corepack prepare pnpm@10.29.3 --activate
pnpm install --frozen-lockfile
pnpm config:sync
```

### Verify The Repo Build

```bash
pnpm typecheck
pnpm test
pnpm smoke
pnpm build
pnpm docs:check
pnpm coverage:collect
pnpm coverage:gate
```

### First Run From A Clone

```bash
pnpm doctor -- --deep
pnpm onboarding:tui
pnpm dev
```

## First Run

1. Run `goatcitadel doctor --deep` or `pnpm doctor -- --deep`.
2. Complete onboarding in the TUI or Mission Control.
3. Set at least one provider/model in Settings.
4. Open Dashboard and Chat first.
5. Keep approvals on for anything risky or externally connected.

Mission Control default local URLs:

- UI: `http://localhost:5173`
- Gateway: `http://127.0.0.1:8787`

## Key Capabilities

### Chat + Operator Control

- chat, cowork, and code modes
- tool-aware traces and approval handling
- workspace-aware guidance injection
- session/project organization

### Prompt Lab

- import markdown prompt packs
- run single, next, or full test passes
- benchmark providers/models
- export reports for regression tracking

### Safety + Policy

- deny-wins policy resolution
- scoped tool grants
- risky action approvals
- path and network guardrails
- break-glass env vars documented explicitly

### Runtime Expansion

- MCP server registration and policy
- skill discovery/import with review
- integrations and channel connections
- TUI operator workflows for local-first users

## Communication Channels

Current recommended order:

1. `channel.tui` for advanced local operators
2. `channel.webchat` for browser-first local workflows
3. `channel.discord` for first external beta rollout
4. `channel.slack` after Discord sandbox validation

Beginner walkthroughs live here:

- [Communication Channel Setup Guide](docs/COMMUNICATION_CHANNEL_SETUP_GUIDE.md)

## Screenshots

| View | Screenshot |
|---|---|
| Dashboard | ![Dashboard](docs/screenshots/mission-control/dashboard.png) |
| Chat Workspace | ![Chat Workspace](docs/screenshots/mission-control/chat.png) |
| Prompt Lab | ![Prompt Lab](docs/screenshots/mission-control/prompt-lab.png) |
| Sessions | ![Sessions](docs/screenshots/mission-control/sessions.png) |
| Tool Access | ![Tool Access](docs/screenshots/mission-control/tools.png) |
| Skills | ![Skills](docs/screenshots/mission-control/skills.png) |
| Integrations | ![Integrations](docs/screenshots/mission-control/integrations.png) |
| MCP Servers | ![MCP Servers](docs/screenshots/mission-control/mcp.png) |
| Workspaces | ![Workspaces](docs/screenshots/mission-control/workspaces.png) |

Full gallery: [docs/screenshots/mission-control](docs/screenshots/mission-control)

Refresh screenshots locally:

```bash
pnpm screenshots:capture
```

Windows wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture-mission-control-screenshots.ps1
```

## Security Snapshot

- deny-wins policy semantics
- approval-first posture for risky actions
- fail-closed remote bind/auth guard
- loopback-only approval creation by default
- path-jail enforcement for workspace and backup paths
- session-default auth storage in Mission Control

Break-glass env vars are supported but should stay off in shared/public environments:

- `GOATCITADEL_ALLOW_UNAUTH_NETWORK=1`
- `GOATCITADEL_ALLOW_REMOTE_APPROVAL_CREATE=1`
- `GOATCITADEL_WARN_UNAUTH_NON_LOOPBACK=false`

## Optional Integrations

- Bankr is not built in by default. See [docs/OPTIONAL_BANKR_SKILL.md](docs/OPTIONAL_BANKR_SKILL.md).
- Obsidian remains optional and path-guarded. See [docs/OBSIDIAN_OPTIONAL_INTEGRATION.md](docs/OBSIDIAN_OPTIONAL_INTEGRATION.md).

## Documentation

- [Install / Setup / Testing](docs/INSTALL_SETUP_TESTING.md)
- [Public Share Checklist](docs/PUBLIC_SHARE_CHECKLIST.md)
- [Communication Channel Setup Guide](docs/COMMUNICATION_CHANNEL_SETUP_GUIDE.md)
- [Security Policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Engineering Handbook](docs/ENGINEERING_HANDBOOK.md)
- [Runtime Guidance](GOATCITADEL.md)
- [Vision](VISION.md)

## Beta Caveats

GoatCitadel is ready for public beta testing when the validation gates are green, but you should still treat this as fast-moving software.

The safe operating stance is:

- test from a clean install path
- use token auth for anything beyond loopback
- keep break-glass env vars off
- use sandbox channels first before wider rollout
- record install or onboarding friction as product bugs, not user error

## Local-First Promise

GoatCitadel is built so you can run high-leverage AI workflows on infrastructure you control, with transparent execution, explicit safety boundaries, and a real operator surface instead of a black box.
