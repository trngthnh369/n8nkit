<#
  n8nkit liveness verification — run in a FRESH claude session AFTER install, BEFORE discarding backups.
  Checks everything verifiable from disk + actually fires the installed secret-guard. The one thing it
  cannot assert is Claude's auto-trigger-by-description (confirm that yourself: ask "build an n8n workflow"
  and see n8n-build engage). Run: pwsh scripts/verify-liveness.ps1
#>
$ErrorActionPreference = 'Stop'
$Claude = Join-Path $HOME '.claude'
$pass = 0; $fail = 0
function Check($label, $cond, $detail) {
  if ($cond) { $script:pass++; Write-Host "  PASS  $label" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL  $label$(if($detail){' — '+$detail})" -ForegroundColor Red }
}

Write-Host '== skills ==' -ForegroundColor Cyan
$expect = @('n8n-intake','n8n-build','n8n-deploy','n8n-test','n8n-fix','n8n-rollback','n8n-pipeline',
            'n8n-workflow-patterns','n8n-node-configuration','n8n-integrations','n8n-expression-syntax',
            'n8n-code-javascript','n8n-validation-expert','n8nctl')
foreach ($s in $expect) {
  $sk = Join-Path $Claude "skills\$s\SKILL.md"
  $ok = (Test-Path $sk) -and ((Get-Content $sk -TotalCount 6 -Raw) -match '(?m)^name:\s*\S')
  Check "skill present + frontmatter: $s" $ok
}
Check 'merged-away n8n-patterns removed' (-not (Test-Path (Join-Path $Claude 'skills\n8n-patterns')))

Write-Host '== agents (drift fixed) ==' -ForegroundColor Cyan
$dbg = Get-Content (Join-Path $Claude 'agents\n8n-debugger.md') -Raw
Check 'n8n-debugger: no bogus run/PATCH CALL' (($dbg -notmatch '-X PATCH') -and ($dbg -notmatch '/run\?wait'))
Check 'n8n-debugger: uses n8nctl workflow run' ($dbg -match 'n8nctl workflow run')
$bld = Get-Content (Join-Path $Claude 'agents\n8n-builder.md') -Raw
Check 'n8n-builder: no n8n-custom-mcp refs' ($bld -notmatch 'n8n-custom-mcp')

Write-Host '== hooks ==' -ForegroundColor Cyan
foreach ($h in @('pre-write-n8n-secret.cjs','post-n8n-validate.cjs','secret-patterns.json','_lib.cjs','post-bash-n8nctl-diagnose.cjs')) {
  Check "hook present: $h" (Test-Path (Join-Path $Claude "hooks\$h"))
}
$sg = Get-Content (Join-Path $Claude 'hooks\pre-write-n8n-secret.cjs') -Raw
Check 'secret-guard upgraded (reads secret-patterns.json)' ($sg -match 'secret-patterns\.json')

Write-Host '== settings.json ==' -ForegroundColor Cyan
$settings = Join-Path $Claude 'settings.json'
$validJson = $true; try { Get-Content $settings -Raw | ConvertFrom-Json | Out-Null } catch { $validJson = $false }
Check 'settings.json is valid JSON' $validJson
Check 'post-n8n-validate registered' ((Get-Content $settings -Raw) -match 'post-n8n-validate\.cjs')
Check 'settings.json.bak exists' (Test-Path "$settings.bak")

Write-Host '== installed secret-guard fires (live block test) ==' -ForegroundColor Cyan
$payload = '{"tool_input":{"file_path":"X/build-workflow/wf.json","content":"AKIAIOSFODNN7EXAMPLE1"}}'
$out = $payload | & node (Join-Path $Claude 'hooks\pre-write-n8n-secret.cjs') 2>&1
Check 'installed secret-guard BLOCKs AWS key (exit 2)' ($LASTEXITCODE -eq 2 -and ($out -match 'BLOCKED'))

Write-Host "`nRESULT: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
Write-Host 'Manual check remaining: in this fresh session, confirm "/n8n-build" and auto-trigger still work.' -ForegroundColor Yellow
if ($fail -gt 0) { exit 1 }
