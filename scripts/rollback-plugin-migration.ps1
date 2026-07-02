<#
  Reverse migrate-to-plugin.ps1: restore the copy-install layout from a plugin-migration backup.
  Restores: the 14 project-level skill dirs, the 2 user-level agents, and settings.json (which re-adds
  the 2 deregistered PostToolUse hooks). Does NOT uninstall the plugin — do that separately with
  /plugin uninstall n8nkit@n8nkit-marketplace if you want to fully revert.
  Run:  pwsh scripts/rollback-plugin-migration.ps1                 (uses newest backup)
        pwsh scripts/rollback-plugin-migration.ps1 -BackupDir <p>  (explicit)   -WhatIf to preview
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$BackupDir)
$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$Claude    = Join-Path $HOME '.claude'
$N8nSkills = @('n8n-intake','n8n-build','n8n-deploy','n8n-test','n8n-fix','n8n-rollback','n8n-pipeline',
               'n8n-workflow-patterns','n8n-node-configuration','n8n-integrations','n8n-expression-syntax',
               'n8n-code-javascript','n8n-validation-expert','n8nctl')
$Agents = @('n8n-builder.md','n8n-debugger.md')

$cfg = Get-Content (Join-Path $RepoRoot '.n8nkit\config.json') -Raw | ConvertFrom-Json
$ProjectSkills = Join-Path $cfg.workflowRoot '.claude\skills'

if (-not $BackupDir) {
  $BackupDir = Get-ChildItem (Join-Path $Claude 'backups') -Directory -Filter 'n8nkit-plugin-migration-*' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $BackupDir -or -not (Test-Path $BackupDir)) { throw "No plugin-migration backup found. Pass -BackupDir explicitly." }
Write-Host "Restoring from: $BackupDir" -ForegroundColor Cyan

# ---- restore project skills ----
foreach ($s in $N8nSkills) {
  $src = Join-Path $BackupDir "skills\$s"
  $dst = Join-Path $ProjectSkills $s
  if ((Test-Path $src) -and $PSCmdlet.ShouldProcess($dst, 'restore project skill')) {
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst)
    Copy-Item $src $dst -Recurse -Force
  }
}
# ---- restore user agents ----
foreach ($a in $Agents) {
  $src = Join-Path $BackupDir "agents\$a"
  if ((Test-Path $src) -and $PSCmdlet.ShouldProcess((Join-Path $Claude "agents\$a"), 'restore agent')) {
    Copy-Item $src (Join-Path $Claude "agents\$a") -Force
  }
}
# ---- restore settings.json (re-adds the 2 deregistered hooks) ----
$sb = Join-Path $BackupDir 'settings.json'
if ((Test-Path $sb) -and $PSCmdlet.ShouldProcess((Join-Path $Claude 'settings.json'), 'restore settings.json')) {
  Copy-Item $sb (Join-Path $Claude 'settings.json') -Force
}

Write-Host "`nDONE. Copy-install layout restored." -ForegroundColor Green
Write-Host "To fully revert, also run in a Claude session: /plugin uninstall n8nkit@n8nkit-marketplace" -ForegroundColor Green
