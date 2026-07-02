<#
  n8nkit — migrate from the copy-install (project/user-level) layout to the Claude Code PLUGIN.
  PRECONDITION: install the plugin first, in a Claude session:
    /plugin marketplace add D:\Projects\personal\n8nkit
    /plugin install n8nkit@n8nkit-marketplace
  Then run this. Steps:
    1. PREFLIGHT — assert the plugin is installed AND the 14 project-level skill dirs are present
       (abort BEFORE deleting anything on mismatch).
    2. BACKUP the 14 project skills + 2 user agents + settings.json → ~/.claude/backups/n8nkit-plugin-migration-<date>/
    3. DELETE the 14 project-level skill copies + the 2 user-level agent files (the plugin provides them).
    4. DEREGISTER post-n8n-validate + post-bash-n8nctl-diagnose from user settings.json (the plugin fires them).
       KEEP the PreToolUse pre-write-n8n-secret.cjs registration (negative-tested compensating control for
       bypassPermissions — intentionally duplicated with the plugin guard; block is idempotent).
    5. COPY .n8nkit config → <workflowRoot>\.n8nkit\ if absent (the config-driven guards read it at runtime).
  Run:  pwsh scripts/migrate-to-plugin.ps1        (add -WhatIf to preview)
  Reverse: pwsh scripts/rollback-plugin-migration.ps1
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()
$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$Claude    = Join-Path $HOME '.claude'
$Date      = Get-Date -Format 'yyyy-MM-dd'
$Backup    = Join-Path $Claude "backups\n8nkit-plugin-migration-$Date"
$PluginKey = 'n8nkit@n8nkit-marketplace'
$N8nSkills = @('n8n-intake','n8n-build','n8n-deploy','n8n-test','n8n-fix','n8n-rollback','n8n-pipeline',
               'n8n-workflow-patterns','n8n-node-configuration','n8n-integrations','n8n-expression-syntax',
               'n8n-code-javascript','n8n-validation-expert','n8nctl')
$Agents = @('n8n-builder.md','n8n-debugger.md')

$cfg = Get-Content (Join-Path $RepoRoot '.n8nkit\config.json') -Raw | ConvertFrom-Json
$ProjectRoot   = $cfg.workflowRoot
$ProjectSkills = Join-Path $ProjectRoot '.claude\skills'

Write-Host "n8nkit → plugin migration" -ForegroundColor Cyan
Write-Host "  repo:          $RepoRoot"
Write-Host "  project skills: $ProjectSkills"
Write-Host "  backup:        $Backup"

# ---- 1. PREFLIGHT ----
Write-Host "`n[1/5] Preflight ..." -ForegroundColor Yellow
$ip = Join-Path $Claude 'plugins\installed_plugins.json'
$installed = $false
if (Test-Path $ip) {
  $j = Get-Content $ip -Raw | ConvertFrom-Json
  $installed = @($j.plugins.PSObject.Properties.Name) -contains $PluginKey
}
if (-not $installed) {
  throw "Plugin '$PluginKey' is NOT installed. In a Claude session run: /plugin marketplace add $RepoRoot  then  /plugin install $PluginKey  — then re-run this script."
}
$missing = @($N8nSkills | Where-Object { -not (Test-Path (Join-Path $ProjectSkills $_)) })
if ($missing.Count -gt 0) {
  throw "Expected 14 project-level skill dirs under $ProjectSkills but these are missing: $($missing -join ', '). Aborting BEFORE any deletion (layout mismatch)."
}
Write-Host "  plugin installed + 14 project skills present."

# ---- 2. BACKUP ----
Write-Host "`n[2/5] Backup ..." -ForegroundColor Yellow
$null = New-Item -ItemType Directory -Force -Path (Join-Path $Backup 'skills'), (Join-Path $Backup 'agents')
foreach ($s in $N8nSkills) {
  $src = Join-Path $ProjectSkills $s
  if (Test-Path $src) { Copy-Item $src (Join-Path $Backup "skills\$s") -Recurse -Force }
}
foreach ($a in $Agents) {
  $src = Join-Path $Claude "agents\$a"
  if (Test-Path $src) { Copy-Item $src (Join-Path $Backup "agents\$a") -Force }
}
$settings = Join-Path $Claude 'settings.json'
if (Test-Path $settings) { Copy-Item $settings (Join-Path $Backup 'settings.json') -Force }
Write-Host "  backed up to $Backup"

# ---- 3. DELETE project skills + user agents ----
Write-Host "`n[3/5] Remove project skill copies + user agents (plugin provides them) ..." -ForegroundColor Yellow
foreach ($s in $N8nSkills) {
  $dst = Join-Path $ProjectSkills $s
  if ((Test-Path $dst) -and $PSCmdlet.ShouldProcess($dst, 'remove project skill copy')) { Remove-Item $dst -Recurse -Force }
}
foreach ($a in $Agents) {
  $dst = Join-Path $Claude "agents\$a"
  if ((Test-Path $dst) -and $PSCmdlet.ShouldProcess($dst, 'remove user-level agent')) { Remove-Item $dst -Force }
}

# ---- 4. DEREGISTER 2 PostToolUse hooks (keep PreToolUse secret guard) ----
Write-Host "`n[4/5] Deregister post-n8n-validate + post-bash-n8nctl-diagnose from settings.json ..." -ForegroundColor Yellow
if ($PSCmdlet.ShouldProcess($settings, 'remove 2 PostToolUse n8n hook registrations')) {
  $node = @'
const fs = require('fs');
const p = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
const RM = /post-n8n-validate\.cjs|post-bash-n8nctl-diagnose\.cjs/;
let removed = 0;
for (const ev of ['PostToolUse']) {
  if (!Array.isArray(cfg.hooks && cfg.hooks[ev])) continue;
  const kept = [];
  for (const e of cfg.hooks[ev]) {
    const before = (e.hooks || []).length;
    e.hooks = (e.hooks || []).filter((h) => !RM.test(h.command || ''));
    removed += before - e.hooks.length;
    if (e.hooks.length > 0) kept.push(e);   // drop entries that became empty
  }
  cfg.hooks[ev] = kept;
}
if (removed === 0) { console.log('SKIP: no user-level n8n PostToolUse hooks found'); process.exit(0); }
fs.copyFileSync(p, p + '.bak');
const out = JSON.stringify(cfg, null, 2);
JSON.parse(out);
fs.writeFileSync(p, out);
console.log('REMOVED ' + removed + ' PostToolUse hook(s); kept PreToolUse pre-write-n8n-secret; backup at ' + p + '.bak');
'@
  $tmp = Join-Path $env:TEMP 'n8nkit-migrate-settings.cjs'
  Set-Content -Path $tmp -Value $node -Encoding UTF8
  & node $tmp $settings
  if ($LASTEXITCODE -ne 0) { throw "settings.json edit failed (exit $LASTEXITCODE)" }
  Remove-Item $tmp -Force
}

# ---- 5. COPY .n8nkit config into the project (config-driven guards read it) ----
Write-Host "`n[5/5] Ensure <workflowRoot>\.n8nkit\config.json ..." -ForegroundColor Yellow
$projCfgDir = Join-Path $ProjectRoot '.n8nkit'
if (-not (Test-Path (Join-Path $projCfgDir 'config.json'))) {
  if ($PSCmdlet.ShouldProcess($projCfgDir, 'copy .n8nkit config')) {
    $null = New-Item -ItemType Directory -Force -Path $projCfgDir
    Copy-Item (Join-Path $RepoRoot '.n8nkit\config.json')        (Join-Path $projCfgDir 'config.json') -Force
    Copy-Item (Join-Path $RepoRoot '.n8nkit\config.schema.json') (Join-Path $projCfgDir 'config.schema.json') -Force
  }
} else { Write-Host "  already present." }

Write-Host "`nDONE." -ForegroundColor Green
Write-Host "Note: post-n8n-validate + post-bash-n8nctl-diagnose are now PROJECT-SCOPED (fire only in plugin-enabled projects)." -ForegroundColor Green
Write-Host "Next: open a FRESH claude session in $ProjectRoot and run  pwsh scripts/verify-plugin.ps1" -ForegroundColor Green
Write-Host "Rollback: pwsh scripts/rollback-plugin-migration.ps1" -ForegroundColor Green
