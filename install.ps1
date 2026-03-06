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

function Invoke-NativeOrThrow {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$FailureMessage = ""
  )

  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    $renderedArgs = if ($Arguments.Count -gt 0) { " $($Arguments -join ' ')" } else { "" }
    $message = if ([string]::IsNullOrWhiteSpace($FailureMessage)) {
      "Command failed with exit code ${exitCode}: ${FilePath}${renderedArgs}"
    } else {
      "$FailureMessage (exit code $exitCode)"
    }
    throw $message
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
$corepackExecutable = (Get-Command "corepack").Source

New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

if (Test-Path (Join-Path $AppDir ".git")) {
  Write-Host "Updating existing GoatCitadel install in $AppDir..."
  Invoke-NativeOrThrow -FilePath "git" -Arguments @("-C", $AppDir, "fetch", "--all", "--prune") -FailureMessage "Failed to fetch latest GoatCitadel changes"
  Invoke-NativeOrThrow -FilePath "git" -Arguments @("-C", $AppDir, "pull", "--ff-only") -FailureMessage "Failed to fast-forward GoatCitadel install"
} else {
  if (Test-Path $AppDir) {
    Write-Host "Removing non-git directory at $AppDir..."
    Remove-Item -Path $AppDir -Recurse -Force
  }
  Write-Host "Cloning GoatCitadel from $RepoUrl..."
  Invoke-NativeOrThrow -FilePath "git" -Arguments @("clone", $RepoUrl, $AppDir) -FailureMessage "Failed to clone GoatCitadel repository"
}

Write-Host "Preparing pnpm ($PnpmVersion)..."
Invoke-NativeOrThrow -FilePath "corepack" -Arguments @("enable") -FailureMessage "Failed to enable Corepack"
Invoke-NativeOrThrow -FilePath "corepack" -Arguments @("prepare", "pnpm@$PnpmVersion", "--activate") -FailureMessage "Failed to activate pnpm $PnpmVersion"

Write-Host "Installing workspace dependencies..."
$lockfilePath = Join-Path $AppDir "pnpm-lock.yaml"
if (-not (Test-Path $lockfilePath)) {
  throw "Install source is missing pnpm-lock.yaml; this build cannot be installed with --frozen-lockfile."
}
Invoke-NativeOrThrow -FilePath "pnpm" -Arguments @("--dir", $AppDir, "install", "--frozen-lockfile") -FailureMessage "Failed to install GoatCitadel workspace dependencies"

$launcherCmd = @"
@echo off
setlocal
set "GOATCITADEL_HOME=$($BaseDir)"
set "PATH=$($BinDir);%PATH%"
node "$($AppDir)\bin\goatcitadel.mjs" %*
exit /b %ERRORLEVEL%
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

$pnpmCmd = @"
@echo off
setlocal
"$($corepackExecutable)" pnpm %*
exit /b %ERRORLEVEL%
"@

$pnpmPs1 = @"
param(
  [Parameter(ValueFromRemainingArguments = `$true)]
  [string[]]`$Args
)
& "$($corepackExecutable)" "pnpm" @Args
"@

$launcherCmdPath = Join-Path $BinDir "goatcitadel.cmd"
$launcherPs1Path = Join-Path $BinDir "goatcitadel.ps1"
$launcherGoatCmdPath = Join-Path $BinDir "goat.cmd"
$launcherGoatPs1Path = Join-Path $BinDir "goat.ps1"
$pnpmCmdPath = Join-Path $BinDir "pnpm.cmd"
$pnpmPs1Path = Join-Path $BinDir "pnpm.ps1"
$launcherGcCmdPath = Join-Path $BinDir "gc.cmd"
$launcherGcPs1Path = Join-Path $BinDir "gc.ps1"

Set-Content -Path $launcherCmdPath -Value $launcherCmd -Encoding Ascii
Set-Content -Path $launcherPs1Path -Value $launcherPs1 -Encoding Ascii
Set-Content -Path $launcherGoatCmdPath -Value $launcherCmd -Encoding Ascii
Set-Content -Path $launcherGoatPs1Path -Value $launcherPs1 -Encoding Ascii
Set-Content -Path $pnpmCmdPath -Value $pnpmCmd -Encoding Ascii
Set-Content -Path $pnpmPs1Path -Value $pnpmPs1 -Encoding Ascii
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
Write-Host "  goatcitadel doctor --deep"
Write-Host "  goat onboard"
Write-Host "  goat up"
Write-Host ""
Write-Host "PowerShell notes:"
Write-Host "  - Open a new PowerShell window if 'goatcitadel' is not found yet."
Write-Host "  - The installer updates your user PATH for new shells, not the already-running parent shell."
Write-Host "  - Use 'goatcitadel' or 'goat' in PowerShell. Do not use 'gc' there because it maps to Get-Content."
Write-Host "  - Immediate fallback: & `"$launcherCmdPath`" onboard"
