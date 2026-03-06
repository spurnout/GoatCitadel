# GoatCitadel Install, Setup, and Testing

Last updated: 2026-03-05
Target release: `0.6.0-beta.2`

Related guides:

- [Public Share Checklist](./PUBLIC_SHARE_CHECKLIST.md)
- [Communication Channel Setup Guide](./COMMUNICATION_CHANNEL_SETUP_GUIDE.md)
- [Optional Bankr Skill](./OPTIONAL_BANKR_SKILL.md)

## Install Paths

GoatCitadel supports two valid install paths:

1. Installer-first: best for most users and public beta testers.
2. Manual/dev install: best for contributors and raw GitHub validation.

Default installer home is under your user home directory:

- base dir: `~/.GoatCitadel`
- app dir: `~/.GoatCitadel/app`
- launcher dir: `~/.GoatCitadel/bin`

You can override the install root:

- PowerShell installer: `-InstallDir <path>`
- shell installer: `--install-dir <path>`
- CLI install/update path: `goatcitadel install --install-dir <path>` or `goatcitadel update --install-dir <path>`
- environment fallback: `GOATCITADEL_HOME=<path>`

## Prerequisites

Required:

- Git
- Node.js 22+
- Corepack

Optional:

- Python 3.10+ for the local NPU sidecar
- Playwright Chromium if you plan to use browser automation or refresh screenshots

Quick checks:

```bash
git --version
node --version
corepack --version
```

## Path A: Installer-First

### Windows

Safer download-and-run flow:

```powershell
iwr https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Power-user one-liner:

```powershell
iwr -useb https://raw.githubusercontent.com/spurnout/GoatCitadel/main/install.ps1 | iex
```

Custom install root:

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

Custom install root:

```bash
bash install.sh --install-dir "$HOME/.GoatCitadel"
```

### Verify the installed launcher

```bash
goatcitadel help
goatcitadel doctor --deep
goatcitadel onboard
goatcitadel up
```

Short alias:

```bash
goat help
goat up
```

PowerShell note:

- use `goatcitadel` or `goat`
- do not use `gc` in PowerShell because it is the built-in alias for `Get-Content`
- if `goatcitadel` is not found immediately after install, open a new PowerShell window
- immediate fallback: `& "$HOME\\.GoatCitadel\\bin\\goatcitadel.cmd" onboard`

### Update an existing install

```bash
goatcitadel update
```

## Path B: Manual / Dev Install

```bash
git clone https://github.com/spurnout/GoatCitadel.git
cd GoatCitadel
corepack enable
corepack prepare pnpm@10.29.3 --activate
pnpm install --frozen-lockfile
pnpm config:sync
```

### Manual path commands

Use repo scripts directly from a clone:

```bash
pnpm doctor -- --deep
pnpm onboarding:tui
pnpm dev
```

Do not assume the `goatcitadel` launcher exists in a raw clone unless you installed it separately.

## Configure Providers and Auth

Create a local env file for repo-based development or to simplify provider setup:

```bash
cp .env.example .env
```

Windows:

```powershell
Copy-Item .env.example .env -Force
```

At minimum, set one model provider key if you plan to use cloud models:

```env
OPENAI_API_KEY=your_key_here
GLM_API_KEY=your_key_here
MOONSHOT_API_KEY=your_key_here
```

### Recommended remote / shared-host posture

If you expose GoatCitadel beyond loopback, set these explicitly:

```env
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=8787
GOATCITADEL_AUTH_MODE=token
GOATCITADEL_AUTH_TOKEN=replace-with-long-random-token
GOATCITADEL_WARN_UNAUTH_NON_LOOPBACK=true
GOATCITADEL_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
GOATCITADEL_VITE_ALLOWED_HOSTS=localhost,127.0.0.1
VITE_GATEWAY_ALLOWED_HOSTS=localhost,127.0.0.1
```

Important:

- non-loopback with weak/no auth is blocked by default
- `GOATCITADEL_ALLOW_UNAUTH_NETWORK=1` is break-glass only
- `GOATCITADEL_ALLOW_REMOTE_APPROVAL_CREATE=1` is break-glass only
- `GOATCITADEL_WARN_UNAUTH_NON_LOOPBACK=false` only suppresses warnings; it does not make the deployment safer

## Start GoatCitadel

Installed launcher path:

```bash
goatcitadel up
```

Manual repo path:

```bash
pnpm dev
```

Split terminals if needed:

```bash
pnpm dev:gateway
pnpm dev:ui
```

Default local endpoints:

- Mission Control: `http://localhost:5173`
- Gateway health: `http://127.0.0.1:8787/health`

Expected health response:

```json
{"status":"ok"}
```

## First-Run Checklist

1. Run doctor.
2. Complete onboarding.
3. Set your active provider and model in Settings.
4. Confirm Dashboard, Chat, Sessions, and Tool Access load cleanly.
5. Test approvals with one intentionally risky action.
6. If you plan to use Discord or Slack, configure those after local validation is clean.

## Validation Gates

Run these before public testing or wider sharing:

```bash
pnpm typecheck
pnpm test
pnpm smoke
pnpm build
pnpm docs:check
pnpm coverage:collect
pnpm coverage:gate
```

## TUI And Operator Commands

Installed path:

```bash
goatcitadel tui
goatcitadel tools catalog
goatcitadel admin backups list
```

Manual path:

```bash
pnpm tui
pnpm tools -- catalog
pnpm admin -- backups list
```

## Optional: Browser Automation Prerequisite

```bash
pnpm exec playwright install chromium
```

## Optional: NPU Sidecar

Direct run:

```bash
cd apps/npu-sidecar
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

Windows activate:

```powershell
.\.venv\Scripts\Activate.ps1
```

CLI wrapper path:

```bash
goatcitadel npu
```

## Optional: Screenshot Refresh

```bash
pnpm screenshots:capture
```

Windows wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture-mission-control-screenshots.ps1
```

This rebuilds the screenshot gallery from a sanitized demo runtime, not your live local data.

## Troubleshooting

### UI loads but API calls fail

1. Confirm the gateway is running.
2. Check `http://127.0.0.1:8787/health`.
3. If auth is enabled, configure credentials in Mission Control Settings.

### Installed launcher exists but a command is missing

Re-run:

```bash
goatcitadel update
```

The installer now delegates directly to the repo CLI, so launcher drift should no longer happen.

### Port 8787 or 5173 is already in use

Stop the conflicting process and restart GoatCitadel.

Windows example for `8787`:

```powershell
$pid = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($pid) { Stop-Process -Id $pid -Force }
```

### Provider configured but chat still fails

1. Verify the base URL is OpenAI-compatible.
2. Verify the configured model exists for that provider.
3. Verify the API key exists in the current shell or env file.

### Shared deployment warning

If Mission Control is reachable on LAN, Tailnet, or the public internet, do not run with `GOATCITADEL_AUTH_MODE=none`.
