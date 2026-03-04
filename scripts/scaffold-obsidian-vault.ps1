[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath,
  [string]$SystemName = "GoatCitadel",
  [string]$WorkspaceName = "Default Workspace",
  [string[]]$AgentNames = @(
    "Coordinator",
    "Architect Goat",
    "Coder Goat",
    "QA Goat",
    "Ops Goat",
    "Researcher Goat",
    "Product Goat",
    "Personal Assistant Goat"
  ),
  [switch]$Force,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$templateRoot = Join-Path $repoRoot "templates\obsidian\ai-info-template"
$targetRoot = Resolve-Path -LiteralPath $TargetPath -ErrorAction SilentlyContinue
if (-not $targetRoot) {
  if ($DryRun) {
    Write-Host "[dry-run] create root $TargetPath"
    $targetRoot = [System.IO.Path]::GetFullPath($TargetPath)
  } else {
    New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null
    $targetRoot = Resolve-Path -LiteralPath $TargetPath
  }
}

if (-not (Test-Path -LiteralPath $templateRoot)) {
  throw "Template root not found: $templateRoot"
}

$dateValue = Get-Date -Format "yyyy-MM-dd"

function Replace-Tokens {
  param([string]$Text, [string]$AgentName = "")
  $output = $Text
  $output = $output.Replace("{{SYSTEM_NAME}}", $SystemName)
  $output = $output.Replace("{{WORKSPACE_NAME}}", $WorkspaceName)
  $output = $output.Replace("{{DATE}}", $dateValue)
  if ($AgentName) {
    $output = $output.Replace("{{AGENT_NAME}}", $AgentName)
  }
  return $output
}

function Write-TemplateFile {
  param(
    [string]$TemplateFilePath,
    [string]$RelativePath,
    [string]$AgentName = ""
  )
  $resolvedRelative = Replace-Tokens -Text $RelativePath -AgentName $AgentName
  if ($resolvedRelative.StartsWith("System\")) {
    $resolvedRelative = Join-Path $SystemName $resolvedRelative.Substring("System\".Length)
  }
  $destination = Join-Path $targetRoot $resolvedRelative
  $destinationDir = Split-Path -Parent $destination
  if (-not (Test-Path -LiteralPath $destinationDir)) {
    if ($DryRun) {
      Write-Host "[dry-run] mkdir $destinationDir"
    } else {
      New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }
  }

  $content = Get-Content -LiteralPath $TemplateFilePath -Raw
  $rendered = Replace-Tokens -Text $content -AgentName $AgentName

  if ((Test-Path -LiteralPath $destination) -and -not $Force) {
    Write-Host "skip (exists): $resolvedRelative"
    return
  }

  if ($DryRun) {
    Write-Host "[dry-run] write $resolvedRelative"
    return
  }

  Set-Content -LiteralPath $destination -Value $rendered -Encoding UTF8
  Write-Host "wrote: $resolvedRelative"
}

$templateFiles = Get-ChildItem -Path $templateRoot -Recurse -File
foreach ($file in $templateFiles) {
  $relative = $file.FullName.Substring($templateRoot.Length).TrimStart("\", "/")
  if ($relative.StartsWith("System\Agents\Agent Template\")) {
    continue
  }
  Write-TemplateFile -TemplateFilePath $file.FullName -RelativePath $relative
}

$agentTemplate = Join-Path $templateRoot "System\Agents\Agent Template\GC Agent - {{AGENT_NAME}} - Home.md"
if (-not (Test-Path -LiteralPath $agentTemplate)) {
  throw "Agent template file missing: $agentTemplate"
}

foreach ($agentName in $AgentNames) {
  $agentDir = Join-Path $targetRoot "$SystemName\Agents\$agentName"
  if (-not (Test-Path -LiteralPath $agentDir)) {
    if ($DryRun) {
      Write-Host "[dry-run] mkdir $agentDir"
    } else {
      New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
    }
  }

  $homeRelative = "System\Agents\$agentName\GC Agent - {{AGENT_NAME}} - Home.md"
  Write-TemplateFile -TemplateFilePath $agentTemplate -RelativePath $homeRelative -AgentName $agentName

  $logPath = Join-Path $agentDir "GC Agent - $agentName - Log.md"
  $tasksPath = Join-Path $agentDir "GC Agent - $agentName - Tasks.md"
  $scratchPath = Join-Path $agentDir "GC Agent - $agentName - Scratchpad.md"

  $logBody = @"
# GC Agent - $agentName - Log

## Entry template
- Date:
- Action:
- Result:
- Links:
- Next:
"@

  $tasksBody = @"
# GC Agent - $agentName - Tasks

| Task | State | Depends On | Done When |
|---|---|---|---|
| Example task | backlog | none | validation evidence linked |
"@

  $scratchBody = @"
# GC Agent - $agentName - Scratchpad

## Ideas

## Open questions

## Promote to decision?
- [ ] Yes
- [ ] No
"@

  foreach ($item in @(
    @{ Path = $logPath; Body = $logBody },
    @{ Path = $tasksPath; Body = $tasksBody },
    @{ Path = $scratchPath; Body = $scratchBody }
  )) {
    $exists = Test-Path -LiteralPath $item.Path
    if ($exists -and -not $Force) {
      Write-Host "skip (exists): $($item.Path)"
      continue
    }
    if ($DryRun) {
      Write-Host "[dry-run] write $($item.Path)"
      continue
    }
    Set-Content -LiteralPath $item.Path -Value $item.Body -Encoding UTF8
    Write-Host "wrote: $($item.Path)"
  }
}

Write-Host "Scaffold complete for '$SystemName' at '$targetRoot'."
