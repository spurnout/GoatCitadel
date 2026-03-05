$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

Write-Host "Capturing sanitized Mission Control screenshots..."
pnpm screenshots:capture
if ($LASTEXITCODE -ne 0) {
  throw "Screenshot capture failed with exit code $LASTEXITCODE."
}

Write-Host "Screenshot capture complete."
