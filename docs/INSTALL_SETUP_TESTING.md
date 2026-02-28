# GoatCitadel Step-By-Step Install, Setup, and Testing (Windows)

This is the easiest path from zero to running system.

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

## 3) Create Local Env File

```powershell
Copy-Item .env.example .env -Force
```

Open `.env` and set at least one API key if you plan to use cloud models:

```env
OPENAI_API_KEY=your_key_here
```

You can skip this if using local OpenAI-compatible endpoints only.

## 4) Start GoatCitadel

Use two terminals.

Terminal A (gateway):

```powershell
cd F:\code\personal-ai
pnpm dev:gateway
```

Terminal B (web UI):

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

## 7) Optional: Terminal Mission Control (TUI)

```powershell
cd F:\code\personal-ai
pnpm tui
```

or:

```powershell
goatcitadel tui
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

### UI opens but API calls fail

1. Confirm gateway is running.
2. Check `http://127.0.0.1:8787/health`.
3. If auth is enabled, configure credentials in `Forge`.

### Provider works in config but chat fails

1. Verify base URL is OpenAI-compatible.
2. Verify endpoint supports `/v1/chat/completions`.
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
