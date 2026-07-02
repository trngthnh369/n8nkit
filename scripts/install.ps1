<#
  n8nkit installer (MVP — user-level). Prove-then-archive friendly:
    1. BACKUP live n8n skills/agents/hooks + settings.json (file-copy) to ~/.claude/backups/n8nkit-premigration-<date>/
    2. COPY repo skills/agents into ~/.claude (overwrite same-named originals; backup is the rollback)
    3. UPGRADE hooks in place (secret-guard overwrites the registered pre-write-n8n-secret.cjs; add post-n8n-validate)
    4. ADD one PostToolUse entry to settings.json via Node JSON-parse (never regex), keeping settings.json.bak
  Aborts on any error BEFORE touching live files where possible. Re-runnable (idempotent).
  Run:  pwsh scripts/install.ps1   (add -WhatIf to preview without changing anything)
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()
$ErrorActionPreference = 'Stop'

Write-Host "NOTE: this is the LEGACY user-level copy-install path. The primary distribution is now the" -ForegroundColor DarkYellow
Write-Host "      Claude Code plugin (see INSTALL.md: /plugin marketplace add + /plugin install). Keep using" -ForegroundColor DarkYellow
Write-Host "      this only as a fallback / for the pre-plugin layout.`n" -ForegroundColor DarkYellow

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Claude   = Join-Path $HOME '.claude'
$Date     = Get-Date -Format 'yyyy-MM-dd'
$Backup   = Join-Path $Claude "backups\n8nkit-premigration-$Date"
$N8nSkills = @('n8n-intake','n8n-build','n8n-deploy','n8n-test','n8n-fix','n8n-rollback','n8n-pipeline',
               'n8n-workflow-patterns','n8n-node-configuration','n8n-integrations','n8n-expression-syntax',
               'n8n-code-javascript','n8n-validation-expert','n8nctl')
$MergedAway = @('n8n-patterns')  # merged into n8n-workflow-patterns; remove from live after backup
$Agents = @('n8n-builder.md','n8n-debugger.md')

Write-Host "n8nkit install" -ForegroundColor Cyan
Write-Host "  repo:   $RepoRoot"
Write-Host "  target: $Claude"
Write-Host "  backup: $Backup"

# ---- 1. BACKUP (file-copy) ----
Write-Host "`n[1/4] Backup live assets ..." -ForegroundColor Yellow
$null = New-Item -ItemType Directory -Force -Path (Join-Path $Backup 'skills'), (Join-Path $Backup 'agents'), (Join-Path $Backup 'hooks')
foreach ($s in ($N8nSkills + $MergedAway)) {
  $src = Join-Path $Claude "skills\$s"
  if (Test-Path $src) { Copy-Item $src (Join-Path $Backup "skills\$s") -Recurse -Force }
}
foreach ($a in $Agents) {
  $src = Join-Path $Claude "agents\$a"
  if (Test-Path $src) { Copy-Item $src (Join-Path $Backup "agents\$a") -Force }
}
foreach ($h in @('pre-write-n8n-secret.cjs','post-bash-n8nctl-diagnose.cjs')) {
  $src = Join-Path $Claude "hooks\$h"
  if (Test-Path $src) { Copy-Item $src (Join-Path $Backup "hooks\$h") -Force }
}
$settings = Join-Path $Claude 'settings.json'
if (Test-Path $settings) { Copy-Item $settings (Join-Path $Backup 'settings.json') -Force }
Write-Host "  backed up to $Backup"

# ---- 2. COPY skills + agents ----
Write-Host "`n[2/4] Copy skills + agents ..." -ForegroundColor Yellow
foreach ($s in $N8nSkills) {
  $src = Join-Path $RepoRoot "skills\$s"
  $dst = Join-Path $Claude   "skills\$s"
  if (-not (Test-Path $src)) { throw "repo skill missing: $src" }
  if ($PSCmdlet.ShouldProcess($dst, 'overwrite skill')) {
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    Copy-Item $src $dst -Recurse -Force
  }
}
foreach ($s in $MergedAway) {
  $dst = Join-Path $Claude "skills\$s"
  if ((Test-Path $dst) -and $PSCmdlet.ShouldProcess($dst, 'remove merged-away skill')) { Remove-Item $dst -Recurse -Force }
}
foreach ($a in $Agents) {
  $src = Join-Path $RepoRoot "agents\$a"
  if (-not (Test-Path $src)) { throw "repo agent missing: $src" }
  if ($PSCmdlet.ShouldProcess((Join-Path $Claude "agents\$a"), 'overwrite agent')) {
    Copy-Item $src (Join-Path $Claude "agents\$a") -Force
  }
}

# ---- 3. UPGRADE hooks in place ----
Write-Host "`n[3/4] Upgrade hooks ..." -ForegroundColor Yellow
# secret-guard: in-place upgrade — install under the EXISTING registered name so settings.json stays unchanged for it
if ($PSCmdlet.ShouldProcess('hooks/pre-write-n8n-secret.cjs', 'in-place upgrade')) {
  Copy-Item (Join-Path $RepoRoot 'hooks\pre-n8n-secret-guard.cjs') (Join-Path $Claude 'hooks\pre-write-n8n-secret.cjs') -Force
  Copy-Item (Join-Path $RepoRoot 'hooks\secret-patterns.json')     (Join-Path $Claude 'hooks\secret-patterns.json') -Force
}
# post-n8n-validate: new hook file
if ($PSCmdlet.ShouldProcess('hooks/post-n8n-validate.cjs', 'install new hook')) {
  Copy-Item (Join-Path $RepoRoot 'hooks\post-n8n-validate.cjs') (Join-Path $Claude 'hooks\post-n8n-validate.cjs') -Force
}
# _lib.cjs: ensure present (identical to existing — copy only if missing to avoid churn)
if (-not (Test-Path (Join-Path $Claude 'hooks\_lib.cjs'))) {
  Copy-Item (Join-Path $RepoRoot 'hooks\_lib.cjs') (Join-Path $Claude 'hooks\_lib.cjs') -Force
}

# ---- 4. ADD post-n8n-validate registration to settings.json (Node JSON, idempotent, .bak) ----
Write-Host "`n[4/4] Register post-n8n-validate in settings.json (safe JSON edit) ..." -ForegroundColor Yellow
if ($PSCmdlet.ShouldProcess($settings, 'add PostToolUse entry')) {
  $node = @'
const fs = require('fs');
const p = process.argv[2];                         // argv: [node, script, settingsPath]
const raw = fs.readFileSync(p, 'utf8');
const cfg = JSON.parse(raw);                       // throws if invalid → aborts (good)
cfg.hooks = cfg.hooks || {};
cfg.hooks.PostToolUse = cfg.hooks.PostToolUse || [];
const cmd = 'node ~/.claude/hooks/post-n8n-validate.cjs';
const already = JSON.stringify(cfg.hooks.PostToolUse).includes('post-n8n-validate.cjs');
if (already) { console.log('SKIP: post-n8n-validate already registered'); process.exit(0); }
fs.copyFileSync(p, p + '.bak');                     // backup before write
cfg.hooks.PostToolUse.push({ matcher: 'Write|Edit', hooks: [{ type: 'command', command: cmd, timeout: 20 }] });
const out = JSON.stringify(cfg, null, 2);
JSON.parse(out);                                   // validate serialization round-trips
fs.writeFileSync(p, out);
console.log('ADDED: post-n8n-validate (Write|Edit); backup at ' + p + '.bak');
'@
  $tmp = Join-Path $env:TEMP 'n8nkit-settings-edit.cjs'
  Set-Content -Path $tmp -Value $node -Encoding UTF8
  & node $tmp $settings
  if ($LASTEXITCODE -ne 0) { throw "settings.json edit failed (exit $LASTEXITCODE) — original untouched unless .bak written" }
  Remove-Item $tmp -Force
}

Write-Host "`nDONE. Next: open a FRESH claude session and run scripts/verify-liveness.ps1." -ForegroundColor Green
Write-Host "Rollback anytime: pwsh scripts/rollback.ps1" -ForegroundColor Green
Write-Host "Keep the backup until you've confirmed the kit works in a clean session." -ForegroundColor Green
