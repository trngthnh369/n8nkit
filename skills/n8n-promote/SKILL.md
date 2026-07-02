---
name: n8n-promote
description: 'Promote an n8n workflow between instances/profiles (e.g. dev to prod) with credential remapping, or detect drift between two instances. Auto-triggers ONLY on explicit promote/migrate/"promote lên"/"chuyển instance" wording with a workflow ID and a target profile. Production-touching on the TARGET — mandatory confirmation with a mapping report + diff preview; never activates without separate consent; never creates credentials. Also `/n8n-promote <id> --to <profile> [--from <profile>]` or `/n8n-promote --check <profileA> <profileB>` for a read-only drift report.'
argument-hint: '<workflowId> --to <profile> [--from <profile>] [--map <file>] | --check <profileA> <profileB>'
allowed-tools: Bash, Read, Write, Glob
---

# n8n Promote — Cross-Instance Promotion + Drift Check

Thin judgment layer over `n8nctl workflow promote` (live-validated in n8nctl 1.0). Credential-mapping rules in [`CREDENTIAL-MAPPING.md`](./CREDENTIAL-MAPPING.md).

## When this skill triggers

**Auto-trigger** ONLY when phrasing is explicit:
- "promote workflow <id> to <profile>", "promote lên prod", "migrate wf <id> sang <instance>"
- "check drift between <A> and <B>", "so sánh 2 instance"

**Do NOT auto-trigger** if:
- No target profile named, or intent is deploy-to-same-instance (that's `/n8n-deploy`)
- Credential creation is needed (hand off to `/n8n-credentials`)

**Manual trigger**: `/n8n-promote <id> --to <profile>` or `/n8n-promote --check <A> <B>`

## Arguments
`$ARGUMENTS`

## Procedure

### Step 1 — PRE-INVOCATION CHECK
- Explicit promote verb + workflow ID + a **named target profile** must all be present. If not → STOP, ask.
- Refuse if target == source.
- `n8nctl profile list` and `n8nctl auth status` — confirm both profiles exist and are authenticated.

### Step 2 — Drift mode short-circuit (`--check`, read-only)
```bash
n8nctl --profile <A> workflow export-all -o <tmp>/A/
n8nctl --profile <B> workflow export-all -o <tmp>/B/
```
Structural-diff the two dirs, write a drift report artifact, and **END** (read-only — no gates).

### Step 3 — Backup the target if the workflow already exists there
```bash
n8nctl --profile <target> workflow backup <targetId> -o <projectDir>/_backups/
```

### Step 4 — Dry-run with artifacts (this creates the approval artifact the prod-guard needs)
```bash
n8nctl workflow promote <id> --to <target> --out-dir .claude/artifacts/n8n-promote-<id>/
```
Produces the promoted JSON + a credential mapping report + a target diff.

### Step 5 — Credential-mapping review
Read the mapping report. Any **UNMAPPED** or ambiguous credential → STOP, show the table (see
CREDENTIAL-MAPPING.md), and offer `--map <file>`. Never pass `--allow-unmapped` on your own initiative;
**never create credentials** — route to `/n8n-credentials`.

### Step 6 — Write verification.json (artifact gate)
Into the artifact dir: `{ target_host, target_profile, create_or_update, target_backup_path,
rollback_plan }`. **Promote fails if this is missing** (same artifact-gate contract as deploy; enforced by
`pre-bash-n8n-prod-guard`).

### Step 7 — CONFIRM (mandatory)
Show: source→target hosts, create-vs-update, the diff summary, the credential mapping table. Require a
clear "yes"/"có".

### Step 8 — Promote (no activation)
```bash
n8nctl workflow promote <id> --to <target> [--map <file>]      # NO --activate here
```

### Step 9 — Verify on the target
```bash
n8nctl --profile <target> workflow get <id>
n8nctl workflow validate <artifact>/promoted.json --profile ci
```
If the target profile has session auth, optionally offer a gated `workflow verify --run`.

### Step 10 — Report + optional activation
Report result + artifact path. Activation is a **separate explicit consent**:
`n8nctl --profile <target> workflow activate <id>`.

## Rules
- Production-touching on the TARGET → PRE-INVOCATION CHECK + confirm + artifact gate are mandatory.
- Never `--activate` in the promote step; never `--allow-unmapped` without explicit user say-so; never create credentials.
- **Honest note**: today only the `pcvn-prod` profile exists, so this skill mostly serves `--check` and
  future environments — onboard a second env with one `n8nctl profile add`. The promote verb itself is
  live-validated in n8nctl 1.0.
- **Next step**: `/n8n-test` on the target; `/n8n-rollback` (target backup) if it misbehaves.
