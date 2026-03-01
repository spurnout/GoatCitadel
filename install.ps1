param(
  [string]$RepoUrl = "https://github.com/spurnout/GoatCitadel.git",
  [string]$InstallDir = "",
  [ValidateSet("git")]
  [string]$InstallMethod = "git",
  [switch]$NoPathUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $BaseDir = Join-Path $HOME ".GoatCitadel"
} else {
  $BaseDir = [System.IO.Path]::GetFullPath($InstallDir)
}

$AppDir = Join-Path $BaseDir "app"
$BinDir = Join-Path $BaseDir "bin"
$PnpmVersion = "10.29.3"

if ($InstallMethod -ne "git") {
  throw "Unsupported install method '$InstallMethod'. Only 'git' is supported."
}

Require-Command "git"
Require-Command "node"
Require-Command "corepack"

New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

if (Test-Path (Join-Path $AppDir ".git")) {
  Write-Host "Updating existing GoatCitadel install in $AppDir..."
  & git -C $AppDir fetch --all --prune | Out-Null
  & git -C $AppDir pull --ff-only
} else {
  if (Test-Path $AppDir) {
    Write-Host "Removing non-git directory at $AppDir..."
    Remove-Item -Path $AppDir -Recurse -Force
  }
  Write-Host "Cloning GoatCitadel from $RepoUrl..."
  & git clone $RepoUrl $AppDir
}

Write-Host "Preparing pnpm ($PnpmVersion)..."
& corepack enable | Out-Null
& corepack prepare "pnpm@$PnpmVersion" --activate

Write-Host "Installing workspace dependencies..."
& pnpm --dir $AppDir install --frozen-lockfile

$launcherCmd = @"
@echo off
setlocal
set "APP_DIR=$($AppDir)"
set "CMD=%~1"
if "%CMD%"=="" set "CMD=help"
if not "%~1"=="" shift

if /I "%CMD%"=="up" (
  pnpm --dir "%APP_DIR%" dev %*
  exit /b %ERRORLEVEL%
)
if /I "%CMD%"=="gateway" (
  pnpm --dir "%APP_DIR%" dev:gateway %*
  exit /b %ERRORLEVEL%
)
if /I "%CMD%"=="ui" (
  pnpm --dir "%APP_DIR%" dev:ui %*
  exit /b %ERRORLEVEL%
)
if /I "%CMD%"=="onboard" (
  pnpm --dir "%APP_DIR%" onboarding:tui %*
  exit /b %ERRORLEVEL%
)
if /I "%CMD%"=="smoke" (
  pnpm --dir "%APP_DIR%" smoke %*
  exit /b %ERRORLEVEL%
)
if /I "%CMD%"=="update" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "$($AppDir)\install.ps1" -InstallDir "$($BaseDir)"
  exit /b %ERRORLEVEL%
)
if /I "%CMD%"=="doctor" (
  echo GoatCitadel doctor
  echo   app dir: %APP_DIR%
  node --version
  pnpm --version
  exit /b 0
)
if /I "%CMD%"=="help" goto :help
if /I "%CMD%"=="-h" goto :help
if /I "%CMD%"=="--help" goto :help

echo Unknown command: %CMD%
echo.

:help
echo GoatCitadel CLI
echo.
echo Usage:
echo   goatcitadel ^<command^>
echo.
echo Commands:
echo   up         Start gateway + mission control
echo   gateway    Start gateway only
echo   ui         Start mission control UI only
echo   onboard    Run TUI onboarding wizard
echo   smoke      Run smoke tests
echo   update     Re-run installer/update
echo   doctor     Show environment diagnostics
exit /b 0
"@

$launcherPs1 = @"
param(
  [Parameter(ValueFromRemainingArguments = `$true)]
  [string[]]`$Args
)
`$cmd = "help"
if (`$Args.Count -gt 0) {
  `$cmd = `$Args[0]
  if (`$Args.Count -gt 1) {
    `$Args = `$Args[1..(`$Args.Count - 1)]
  } else {
    `$Args = @()
  }
}
& "$($BinDir)\goatcitadel.cmd" `$cmd @Args
"@

$launcherCmdPath = Join-Path $BinDir "goatcitadel.cmd"
$launcherPs1Path = Join-Path $BinDir "goatcitadel.ps1"
$launcherGcCmdPath = Join-Path $BinDir "gc.cmd"
$launcherGcPs1Path = Join-Path $BinDir "gc.ps1"

Set-Content -Path $launcherCmdPath -Value $launcherCmd -Encoding Ascii
Set-Content -Path $launcherPs1Path -Value $launcherPs1 -Encoding Ascii
Set-Content -Path $launcherGcCmdPath -Value $launcherCmd -Encoding Ascii
Set-Content -Path $launcherGcPs1Path -Value $launcherPs1 -Encoding Ascii

if (-not $NoPathUpdate) {
  $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if (-not [string]::IsNullOrWhiteSpace($currentPath)) {
    $parts = $currentPath -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
  }
  if (-not ($parts -contains $BinDir)) {
    $next = if ($parts.Count -eq 0) { $BinDir } else { ($parts + $BinDir) -join ";" }
    [Environment]::SetEnvironmentVariable("Path", $next, "User")
  }
  if (-not (($env:Path -split ";") -contains $BinDir)) {
    $env:Path = "$BinDir;$env:Path"
  }
}

Write-Host ""
Write-Host "GoatCitadel install complete."
Write-Host "Install directory: $AppDir"
Write-Host "Launcher: $launcherCmdPath"
Write-Host ""
Write-Host "Run:"
Write-Host "  goatcitadel onboard"
Write-Host "  goatcitadel up"
Write-Host "  gc onboard"
Write-Host "  gc up"
