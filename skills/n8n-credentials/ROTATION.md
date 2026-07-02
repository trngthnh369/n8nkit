# n8n Credentials — Rotation + Temp-File Handling

## Hardened temp-file recipe (create mode)

Never place a credential file under `<workflowRoot>` (the write guards + git live there). Use the OS temp
dir with a random name and user-only ACL, and write only PLACEHOLDERS:

```powershell
# PowerShell — random name, current-user-only ACL
$tmp = Join-Path $env:TEMP ("n8nkit-cred-" + [guid]::NewGuid().ToString('N').Substring(0,8) + ".json")
'{ "name": "<name>", "type": "<type>", "data": { "<field>": "<FILL-ME>" } }' | Set-Content $tmp -Encoding UTF8
icacls $tmp /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Host "Fill the <FILL-ME> values in: $tmp  (do not share it; it will be deleted after create)"
```

- Claude writes only `<FILL-ME>` placeholders. The **user** fills the real values.
- After `n8nctl credential create <tmp>`, delete it and verify:
  ```powershell
  Remove-Item $tmp -Force; if (Test-Path $tmp) { Write-Warning "temp file still present!" } else { "cleaned" }
  ```
- Never `cat`/echo/log the filled file.

## Rotation sequence

1. **Map consumers** — from the usage scan (SKILL Step 2), list every workflow + node using the old credential.
2. **Create the new credential** (Steps 4–7) with a new name (e.g. `Haravan API v2`).
3. **Repoint, one workflow at a time**:
   - Edit only the node's `credentials` block → new credential id/name. Minimal diff — touch nothing else.
   - `n8nctl workflow diff <id> <file>` — confirm the ONLY change is the credential reference.
   - Confirm THIS workflow with the user (deploy convention), then `n8nctl workflow update <id> <file>`.
   - Verify: `/n8n-test <id>` (or `n8nctl workflow verify`).
4. **Retire the old credential** — delete in the n8n UI (no CLI delete), then re-run the usage scan to
   confirm 0 references remain.

## Verification matrix

| Check | Command | Pass |
|---|---|---|
| New credential exists | `n8nctl credential list --type <t>` | new name present |
| Each workflow repointed | `n8nctl workflow get <id> --redact --jq '[.nodes[].credentials]'` | new name, not old |
| Each workflow still runs | `/n8n-test <id>` | gate PASS |
| Old credential unused | usage scan (SKILL Step 2) | 0 references |
| Old credential deleted | `n8nctl credential list` | old name absent (after UI delete) |

## Rules

- One workflow repointed + verified before moving to the next — never bulk-update all consumers blind.
- If any repointed workflow fails verification, STOP and surface it before continuing the rotation.
- The report records names/ids/workflows only — never secret values.
