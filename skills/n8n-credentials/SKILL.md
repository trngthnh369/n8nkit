---
name: n8n-credentials
description: 'Credential lifecycle for n8n — inventory/audit (usage per workflow, unused, naming), create a new credential schema-first, and guided rotation (new credential, repoint workflows, verify, retire old). Auto-triggers ONLY on explicit credential intent: "tạo credential", "rotate/xoay key", "credential nào đang dùng ở đâu", "audit credentials". NEVER auto-triggers from inside fix/deploy loops — those STOP and hand off here. Secret values are never echoed, never written by Claude, never logged. Also `/n8n-credentials <audit|create|rotate> [args]`.'
argument-hint: '<audit|create|rotate> [type] [name]'
allowed-tools: Bash, Read, Write, Glob
---

# n8n Credentials — Lifecycle (audit / create / rotate)

The explicit, user-consented path for the credential work every other skill refuses. Rotation detail in [`ROTATION.md`](./ROTATION.md).

## When this skill triggers

**Auto-trigger** ONLY on explicit credential intent:
- "tạo credential", "create a credential", "rotate/xoay key/token", "audit credentials"
- "credential nào đang dùng ở đâu", "which workflows use credential X"

**Do NOT auto-trigger**:
- From inside `/n8n-fix` or `/n8n-deploy` — those STOP on credential issues and hand off to here.
- For anything that isn't an n8n credential.

**Manual trigger**: `/n8n-credentials <audit|create|rotate> [type] [name]`

## Arguments
`$ARGUMENTS`

## Hard rules (secret-sensitive — read first)
- **Claude NEVER writes literal secret values** with Write/Edit, never echoes/`cat`s a filled credential
  file, never logs a value. (The secret guard also blocks provider-shaped literals — defense in depth, not
  the mechanism.)
- The user fills secret values out-of-band; Claude only handles schema, names, IDs, and wiring.
- Temp files: created with user-only ACL + a random suffix, never logged, cleanup verified in the report.

## Procedure

### Step 1 — Mode
- `audit` → read-only, NO gate.
- `create` / `rotate` → PRE-INVOCATION CHECK: explicit intent + a credential type and name. If missing → STOP, ask.

### Step 2 — Inventory (all modes)
```bash
n8nctl credential list [--type <t>]                 # names/types only (no GET /credentials — derived)
n8nctl audit --categories credentials               # unused / risky credentials
```
Usage scan — which workflows reference each credential (NAMES only):
```bash
n8nctl workflow list --json --jq '.[].id' | while read id; do
  n8nctl workflow get "$id" --redact --jq '{id, creds: [.nodes[].credentials // {} | to_entries[].value.name]}'
done
```

### Step 3 — audit mode → report + END
Write `.claude/artifacts/n8n-credentials-<date>/report.json` (names/ids/usage only — NO values). Stop.

> ⚠️ `report.json` **cố tình KHÔNG phải approval marker**. Hook `pre-bash-n8n-prod-guard` chỉ nhận
> `context-snippets.json` / `verification.json`. Audit là read-only nên nó **không được** authorize
> bất kỳ lệnh ghi nào — đừng đổi tên file này để "cho tiện". Đường ghi có artifact riêng ở Step 6/9.

### Step 4 — create: fetch the schema
```bash
n8nctl credential schema <type>
```

### Step 5 — create: write a TEMPLATE (placeholders only)
Write a template to a hardened temp path (never under `<workflowRoot>`), with `<FILL-ME>` placeholders for
every secret field — see ROTATION.md for the ACL/random-name recipe. Tell the user to fill the real values
themselves (or point Claude at a file they already prepared). **Claude does not write the values.**

### Step 6 — create: CONFIRM + approval artifact
Show name, type, and target host. Remind the user the values were supplied by them, not Claude.

Sau khi user confirm, **trước** Step 7, ghi `.claude/artifacts/n8n-credentials-<date>/context-snippets.json`:
```json
{ "credential_name": "<name>", "credential_type": "<type>", "target_host": "<host>",
  "approved_at": "<iso — ghi SAU khi user confirm>" }
```
KHÔNG có giá trị secret nào trong file này. Thiếu artifact → hook chặn `n8nctl credential create`.

### Step 7 — create: submit + cleanup
```bash
n8nctl credential create <filled-file>      # schema pre-flight is on by default
```
Instruct the user to delete the filled temp file; verify it's gone and report that. Verify the credential
works by offering `/n8n-test <id>` on one consuming workflow.

### Step 8 — rotate: create the new credential
Do Steps 4–7 for the replacement credential (new name/version).

### Step 9 — rotate: repoint consuming workflows (one at a time)
For each workflow from the Step 2 usage scan: edit only the node `credentials` block to the new credential
(minimal diff) → `n8nctl workflow diff <id> <file>` → confirm THIS workflow (deploy-convention) →
**ghi approval artifact CỦA RIÊNG workflow đó** → `n8nctl workflow update <id> <file>` → verify.
See ROTATION.md for the sequence + matrix.

Artifact per-workflow (một thư mục cho mỗi workflow, ghi sau confirm của chính nó):
```
.claude/artifacts/n8n-credentials-<workflowId>/context-snippets.json
{ "workflow_id": "<id>", "old_credential": "<name>", "new_credential": "<name>",
  "backup_path": "<path>", "rollback_command": "/n8n-rollback <id>", "approved_at": "<iso>" }
```
Hook ràng `workflow_id` này với id đang bị update: artifact của workflow A **không** authorize update
workflow B. Đó là lý do rotation phải đi từng workflow một, đúng như Rules bên dưới đã yêu cầu.

### Step 10 — rotate: retire the old credential
n8n's Public API has no credential-delete flow in the kit → instruct the user to delete it in the n8n UI.
Verify retirement by re-running the Step 2 usage scan and confirming **0 references**. Write the artifact
report (names/ids/workflows only — NO values).

## Rules
- Never print/echo/`cat`/log a filled credential file or any secret value.
- Rotation repoints are minimal-diff, one workflow at a time, each with its own confirm.
- Temp-file cleanup is mandatory and must be reported.
- **Next step**: `/n8n-test` each repointed workflow.
