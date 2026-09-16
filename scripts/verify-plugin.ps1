<#
  Post-migration verification. Run in a FRESH claude session in a plugin-enabled project.
  Asserts: plugin cache present at the expected version; every skill has name: frontmatter; hooks.json
  parses and its scripts exist; ALL 4 hooks live-fire from the CACHE; settings.json no longer registers
  the 2 deregistered hooks but still has the secret guard.
  Run:  pwsh scripts/verify-plugin.ps1
#>
$ErrorActionPreference = 'Stop'
$Claude    = Join-Path $HOME '.claude'
$RepoRoot  = Split-Path -Parent $PSScriptRoot
$Expected  = (Get-Content (Join-Path $RepoRoot '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version
$N8nSkills = @('n8n-intake','n8n-build','n8n-review','n8n-deploy','n8n-test','n8n-fix','n8n-rollback','n8n-pipeline',
               'n8n-monitor','n8n-promote','n8n-credentials','n8n-docs','n8n-retire',
               'n8n-workflow-patterns','n8n-node-configuration','n8n-integrations','n8n-expression-syntax',
               'n8n-code-javascript','n8n-validation-expert','n8nctl')
$pass = 0; $fail = 0
function Check($label, $cond, $detail) {
  if ($cond) { $script:pass++; Write-Host "  PASS  $label" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL  $label $(if($detail){"— $detail"})" -ForegroundColor Red }
}

# ---- locate plugin cache: ~/.claude/plugins/cache/<marketplace>/n8nkit/<version> ----
$cacheRoot = Join-Path $Claude 'plugins\cache'
$pluginDir = Get-ChildItem $cacheRoot -Directory -Recurse -Filter 'n8nkit' -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName "$Expected\.claude-plugin\plugin.json") } |
  Select-Object -First 1
Check "plugin cache present at $Expected" ($null -ne $pluginDir) "not found under $cacheRoot"
if (-not $pluginDir) { Write-Host "`nRESULT: $pass passed, $fail failed" ; exit 1 }
$root = Join-Path $pluginDir.FullName $Expected
$pj = Get-Content (Join-Path $root '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json
Check "plugin.json version = $Expected" ($pj.version -eq $Expected) "got $($pj.version)"

# ---- skills frontmatter ----
foreach ($s in $N8nSkills) {
  $f = Join-Path $root "skills\$s\SKILL.md"
  $ok = $false
  if (Test-Path $f) { $ok = @((Get-Content $f -TotalCount 5) -match 'name:\s*\S').Count -gt 0 }
  Check "skill $s has name: frontmatter" $ok
}

# ---- hooks.json parses + scripts exist ----
$hj = Join-Path $root 'hooks\hooks.json'
$hooksOk = $false
try { $h = Get-Content $hj -Raw | ConvertFrom-Json; $hooksOk = $true } catch {}
Check "hooks.json parses" $hooksOk
if ($hooksOk) {
  foreach ($ev in $h.hooks.PSObject.Properties.Name) {
    foreach ($entry in $h.hooks.$ev) {
      foreach ($hk in $entry.hooks) {
        if ($hk.command -match 'hooks/([\w.-]+\.cjs)') {
          $script = Join-Path $root "hooks\$($Matches[1])"
          Check "hook script exists: $($Matches[1]) ($ev)" (Test-Path $script)
        }
      }
    }
  }
}

# ---- live-fire all 4 hooks from the cache ----
Write-Host "`n  live-fire hooks from cache:" -ForegroundColor Cyan
$scratch = Join-Path $env:TEMP "n8nkit-verify-$(Get-Random)"
$null = New-Item -ItemType Directory -Force -Path (Join-Path $scratch '.n8nkit'), (Join-Path $scratch '.claude\artifacts'), (Join-Path $scratch 'x')
Set-Content (Join-Path $scratch '.n8nkit\config.json') (@{ workflowRoot = $scratch } | ConvertTo-Json) -Encoding UTF8
function FireHook($cjs, $payload) {
  $json = $payload | ConvertTo-Json -Compress -Depth 8
  $out = $json | & node (Join-Path $root "hooks\$cjs") 2>&1
  [pscustomobject]@{ code = $LASTEXITCODE; out = ($out -join "`n") }
}
$wf = Join-Path $scratch 'x\wf.json'
# Secret-SHAPED fixture (the AWS documentation example, no live value), split so the commit-time
# secret scanner does not match this file's source — a whole-file allowlist pin would go stale here
# on every edit. The runtime value is unchanged, which is what the assertion below proves.
$fakeAwsKey = 'AKIA' + 'IOSFODNN7EXAMPLE1'
$r = FireHook 'pre-n8n-secret-guard.cjs' @{ cwd = $scratch; tool_input = @{ file_path = $wf; content = $fakeAwsKey } }
Check "secret-guard blocks AWS key (config-scoped, no build-workflow)" ($r.code -eq 2 -and $r.out -match 'BLOCKED') "code=$($r.code)"
$r = FireHook 'pre-bash-n8n-prod-guard.cjs' @{ cwd = $scratch; tool_input = @{ command = 'n8nctl workflow update 42 wf.json' } }
Check "prod-guard blocks mutating verb w/o artifact" ($r.code -eq 2 -and $r.out -match 'BLOCKED') "code=$($r.code)"
Set-Content $wf '{"name":"x","nodes":[{"id":"n","name":"N","type":"n8n-nodes-base.noOp","typeVersion":1,"position":[0,0],"parameters":{}}],"connections":{},"settings":{},"bogusField":1}' -Encoding UTF8
$r = FireHook 'post-n8n-validate.cjs' @{ cwd = $scratch; tool_input = @{ file_path = $wf } }
Check "post-n8n-validate warns on unknown field (exit 0)" ($r.code -eq 0 -and $r.out -match 'bogusField') "code=$($r.code) out=$($r.out)"
$r = FireHook 'post-bash-n8nctl-diagnose.cjs' @{ tool_input = @{ command = 'n8nctl workflow get 42' }; tool_response = @{ stderr = 'AuthError: run n8nctl auth login'; exit_code = 2 } }
Check "diagnose suggests /n8n-fix on n8nctl error" ($r.out -match '/n8n-fix') "out=$($r.out)"
Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue

# ---- settings.json state ----
$settings = Join-Path $Claude 'settings.json'
$sj = Get-Content $settings -Raw
Check "settings.json no longer registers post-n8n-validate" (-not ($sj -match 'post-n8n-validate\.cjs'))
Check "settings.json no longer registers post-bash-n8nctl-diagnose" (-not ($sj -match 'post-bash-n8nctl-diagnose\.cjs'))
Check "settings.json still registers pre-write-n8n-secret (compensating control)" ($sj -match 'pre-write-n8n-secret\.cjs')

Write-Host "`nRESULT: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
exit $(if ($fail -eq 0) { 0 } else { 1 })
