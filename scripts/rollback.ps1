<#
  n8nkit rollback — restore live ~/.claude n8n assets + settings.json from a premigration backup.
  Run:  pwsh scripts/rollback.ps1                 (uses latest backups/n8nkit-premigration-*)
        pwsh scripts/rollback.ps1 -BackupDir <p>  (explicit)
        pwsh scripts/rollback.ps1 -WhatIf         (preview)
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$BackupDir)
$ErrorActionPreference = 'Stop'

$Claude = Join-Path $HOME '.claude'
if (-not $BackupDir) {
  $cand = Get-ChildItem (Join-Path $Claude 'backups') -Directory -Filter 'n8nkit-premigration-*' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $cand) { throw "No backup found under $Claude\backups\n8nkit-premigration-*" }
  $BackupDir = $cand.FullName
}
Write-Host "Rolling back from: $BackupDir" -ForegroundColor Cyan
if (-not (Test-Path $BackupDir)) { throw "backup not found: $BackupDir" }

# Restore skills (restoring the backup also brings back n8n-patterns, undoing the merge)
$bSkills = Join-Path $BackupDir 'skills'
if (Test-Path $bSkills) {
  Get-ChildItem $bSkills -Directory | ForEach-Object {
    $dst = Join-Path $Claude "skills\$($_.Name)"
    if ($PSCmdlet.ShouldProcess($dst, 'restore skill')) {
      if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
      Copy-Item $_.FullName $dst -Recurse -Force
    }
  }
}
# Restore agents + hooks
foreach ($sub in @('agents','hooks')) {
  $b = Join-Path $BackupDir $sub
  if (Test-Path $b) {
    Get-ChildItem $b -File | ForEach-Object {
      $dst = Join-Path $Claude "$sub\$($_.Name)"
      if ($PSCmdlet.ShouldProcess($dst, "restore $sub")) { Copy-Item $_.FullName $dst -Force }
    }
  }
}
# Restore settings.json + remove the hooks the upgrade added (post-n8n-validate); secret-guard file is restored above
$bSettings = Join-Path $BackupDir 'settings.json'
if ((Test-Path $bSettings) -and $PSCmdlet.ShouldProcess((Join-Path $Claude 'settings.json'), 'restore settings.json')) {
  Copy-Item $bSettings (Join-Path $Claude 'settings.json') -Force
}
# Remove kit-added files not present in backup (post-n8n-validate, secret-patterns.json) — they are repo-sourced
foreach ($f in @('post-n8n-validate.cjs','secret-patterns.json')) {
  $p = Join-Path $Claude "hooks\$f"
  if ((Test-Path $p) -and -not (Test-Path (Join-Path $BackupDir "hooks\$f"))) {
    if ($PSCmdlet.ShouldProcess($p, 'remove kit-added hook file')) { Remove-Item $p -Force }
  }
}
Write-Host "Rollback complete. Open a fresh claude session to confirm originals are active." -ForegroundColor Green
