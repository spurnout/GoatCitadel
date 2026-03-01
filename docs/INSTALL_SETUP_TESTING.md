# GoatCitadel Step-By-Step Install, Setup, and Testing (Windows)

This is the easiest path from zero to running system.

## Read This First

This file is documentation, not a script.  
Do **not** paste the whole document into PowerShell.

Only run command lines shown inside fenced code blocks.

If you want the shortest working path, run only this:

```powershell
cd F:\code\personal-ai
corepack enable
corepack prepare pnpm@10.29.3 --activate
pnpm install
Copy-Item .env.example .env -Force
pnpm dev
```

Run all commands from:

```powershell
F:\code\personal-ai
```

Default install location for the installer/CLI:

- `~/.GoatCitadel`
- Override with `--install-dir` or env var `GOATCITADEL_HOME`.

## 1) One-Time Prerequisites

Install these if missing:

1. Git
2. Node.js 22+
3. Python 3.10+ (only needed for NPU sidecar)

Quick checks:

```powershell
git --version
node --version
python --version
```

## 2) Install Dependencies

```powershell
cd F:\code\personal-ai
corepack enable
corepack prepare pnpm@10.29.3 --activate
pnpm install
```

Optional but recommended for browser automation tools:

```powershell
pnpm exec playwright install chromium
```

## 3) Create Local Env File

```powershell
Copy-Item .env.example .env -Force
```

Open `.env` and set at least one API key if you plan to use cloud models:

```env
OPENAI_API_KEY=your_key_here
GLM_API_KEY=your_key_here
MOONSHOT_API_KEY=your_key_here
```

GoatCitadel now auto-loads `.env` on gateway startup.  
No manual `Set-Item Env:...` step is required.

You can skip this if using local OpenAI-compatible endpoints only.

## 4) Start GoatCitadel

Single-command start (recommended):

```powershell
cd F:\code\personal-ai
pnpm dev
```

This starts both:

- Gateway (Fastify)
- Mission Control (Vite)

Optional split mode (useful for focused logs/troubleshooting):

Terminal A:

```powershell
cd F:\code\personal-ai
pnpm dev:gateway
```

Terminal B:

```powershell
cd F:\code\personal-ai
pnpm dev:ui
```

Open:

- Mission Control: `http://localhost:5173`
- Gateway health: `http://127.0.0.1:8787/health`

Expected health response:

```json
{"status":"ok"}
```

## 5) Initial Setup (Web)

1. Open `Launch Wizard` tab.
2. Complete onboarding checklist.
3. Open `Forge` tab.
4. Confirm active provider + model.
5. Save runtime settings.

### Quick provider presets (for your blocker)

GLM (Z.AI):

- Provider ID: `glm`
- Base URL: `https://api.z.ai/api/paas/v4`
- Model: `glm-5`
- API key env: `GLM_API_KEY`

Moonshot (Kimi API):

- Provider ID: `moonshot`
- Base URL: `https://api.moonshot.ai/v1`
- Model: `kimi-k2.5` (or `kimi-k2-turbo-preview`)
- API key env: `MOONSHOT_API_KEY`

## 6) Fast Verification Checklist

### A. Automated checks

From a third terminal:

```powershell
cd F:\code\personal-ai
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

All should pass.

### B. Manual checks

1. `Runs (Sessions)` updates after sending a message.
2. `Gatehouse (Approvals)` shows pending items for risky actions.
3. `Feed Ledger (Costs)` shows token/cost data.
4. `Memory Pasture` shows QMD metrics/context packs.
5. `Mesh` tab loads status and nodes.
6. `NPU` tab loads status (even if sidecar is stopped).
7. Browser tools work when enabled:
   - Tool profile includes research (or danger / explicit allow).
   - Network allowlist includes target hosts (for example `*.duckduckgo.com`).

## 7) Optional: Terminal Mission Control (TUI)

```powershell
cd F:\code\personal-ai
pnpm tui
```

or:

```powershell
goatcitadel tui
```

### Tool Access CLI shortcuts

```powershell
goatcitadel tools catalog
goatcitadel tools grant add --tool fs.list --decision allow --scope session --scope-ref demo-session --grant-type ttl --created-by operator
goatcitadel tools invoke --tool fs.list --args "{\"path\":\"./workspace\"}" --agent operator --session demo-session --dry-run
```

## 8) Optional: NPU Sidecar (Snapdragon-ready path)

### Option A: Run directly

```powershell
cd F:\code\personal-ai\apps\npu-sidecar
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py
```

Check health:

```powershell
Invoke-RestMethod http://127.0.0.1:11440/health
```

### Option B: Run via CLI wrapper

```powershell
cd F:\code\personal-ai
goatcitadel npu
```

Then in Mission Control:

1. Open `NPU` tab.
2. Enable NPU + save config.
3. Start runtime.
4. Verify models/status.
5. In `Forge`, choose provider `npu-local`.

## 9) Stop Everything

In each running terminal: `Ctrl + C`

## 10) Common Fixes

### Port already in use (8787 or 5173)

Stop existing process and restart.

For gateway port `8787`:

```powershell
$pid = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($pid) { Stop-Process -Id $pid -Force }
```

Then start gateway again:

```powershell
pnpm dev:gateway
```

### UI opens but API calls fail

1. Confirm gateway is running.
2. Check `http://127.0.0.1:8787/health`.
3. If auth is enabled, configure credentials in `Forge`.

### Provider works in config but chat fails

1. Verify base URL is OpenAI-compatible.
2. Verify endpoint supports `chat/completions` for the base URL you configured.
3. Verify key/env var is set in current shell.

### NPU sidecar starts but no acceleration

This usually means runtime packages or execution provider support is missing.  
Check:

```powershell
Invoke-RestMethod http://127.0.0.1:11440/v1/capabilities
```

Look for:

- `onnxRuntimeAvailable: true`
- `onnxRuntimeGenAiAvailable: true`
- `qnnExecutionProviderAvailable: true` (for QNN/NPU path)
