$ErrorActionPreference = "Stop"

$root = (Resolve-Path ".").Path
$tmpDir = Join-Path $root ".tmp/screenshots"
$outputDir = Join-Path $root "docs/screenshots/mission-control"
$gatewayOutLog = Join-Path $tmpDir "gateway-dev.out.log"
$gatewayErrLog = Join-Path $tmpDir "gateway-dev.err.log"
$uiOutLog = Join-Path $tmpDir "ui-dev.out.log"
$uiErrLog = Join-Path $tmpDir "ui-dev.err.log"

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$gateway = Start-Process -FilePath "pnpm.cmd" -ArgumentList "dev:gateway" -WorkingDirectory $root -PassThru -RedirectStandardOutput $gatewayOutLog -RedirectStandardError $gatewayErrLog
$ui = Start-Process -FilePath "pnpm.cmd" -ArgumentList "dev:ui" -WorkingDirectory $root -PassThru -RedirectStandardOutput $uiOutLog -RedirectStandardError $uiErrLog

try {
  $deadline = (Get-Date).AddMinutes(3)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    $okGateway = $false
    $okUi = $false

    try {
      $g = Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing -TimeoutSec 3
      if ($g.StatusCode -eq 200) { $okGateway = $true }
    } catch {}

    try {
      $u = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 3
      if ($u.StatusCode -ge 200) { $okUi = $true }
    } catch {}

    if ($okGateway -and $okUi) {
      $ready = $true
      break
    }

    Start-Sleep -Seconds 2
  }

  if (-not $ready) {
    throw "Gateway/UI did not become ready within timeout."
  }

  $targets = @(
    @{ tab = "onboarding"; file = "onboarding.png"; wait = 2500 },
    @{ tab = "dashboard"; file = "dashboard.png"; wait = 2500 },
    @{ tab = "system"; file = "system.png"; wait = 2500 },
    @{ tab = "files"; file = "files.png"; wait = 2500 },
    @{ tab = "memory"; file = "memory.png"; wait = 2500 },
    @{ tab = "agents"; file = "agents.png"; wait = 2500 },
    @{ tab = "office"; file = "office.png"; wait = 5000 },
    @{ tab = "activity"; file = "activity.png"; wait = 2500 },
    @{ tab = "cron"; file = "cron.png"; wait = 2500 },
    @{ tab = "sessions"; file = "sessions.png"; wait = 2500 },
    @{ tab = "skills"; file = "skills.png"; wait = 2500 },
    @{ tab = "costs"; file = "costs.png"; wait = 2500 },
    @{ tab = "settings"; file = "settings.png"; wait = 2500 },
    @{ tab = "tools"; file = "tools.png"; wait = 2500 },
    @{ tab = "approvals"; file = "approvals.png"; wait = 2500 },
    @{ tab = "tasks"; file = "tasks.png"; wait = 2500 },
    @{ tab = "integrations"; file = "integrations.png"; wait = 2500 },
    @{ tab = "mesh"; file = "mesh.png"; wait = 2500 },
    @{ tab = "npu"; file = "npu.png"; wait = 2500 }
  )

  foreach ($target in $targets) {
    $url = "http://localhost:5173/?tab=$($target.tab)"
    $out = Join-Path $outputDir $target.file
    npx playwright screenshot --wait-for-timeout $target.wait --full-page $url $out | Out-Null
  }
}
finally {
  if ($ui -and -not $ui.HasExited) {
    Stop-Process -Id $ui.Id -Force
  }
  if ($gateway -and -not $gateway.HasExited) {
    Stop-Process -Id $gateway.Id -Force
  }
}
