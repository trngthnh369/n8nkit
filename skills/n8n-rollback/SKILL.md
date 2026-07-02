---
name: n8n-rollback
description: Rollback an n8n workflow on PRODUCTION ($N8N_HOST) to the latest backup file in project _backups folder. Auto-triggers ONLY when user explicitly says rollback/revert/restore/khôi phục/quay về with a specific workflow ID. Production-touching, destructive (replaces current state) — has MANDATORY user confirmation with diff preview AND mandatory safety-backup of current state before applying. Never auto-executes on ambiguous undo/cancel/back phrasing. Also invokable manually as `/n8n-rollback <workflowId>`. Re-activation after rollback requires separate explicit consent.
argument-hint: <workflowId> [--project=<project-name>]
allowed-tools: Read, Bash, Glob
---

# n8n Rollback — Restore Workflow to Latest Backup

> `<workflowRoot>` = the n8n projects root, read from `.n8nkit/config.json` (`workflowRoot` key); default `D:/Projects/work/build-workflow`.

> Since n8nctl 0.7.0 the whole mechanical sequence (safety snapshot → select
> target → diff preview → restore → verify) is ONE first-class CLI command:
> `n8nctl workflow rollback`. This skill is now just the judgment layer:
> intent check → preview → user confirmation → one CLI call.

## ⚠️ MANDATORY PRE-INVOCATION CHECK (read before any procedure step)

Before doing ANYTHING in this skill, verify ALL of the following:

1. **Explicit rollback intent**: User used a clear rollback verb — `rollback`/`revert`/`restore`/`khôi phục`/`quay về`/`đảo về`. Words like `undo`/`cancel`/`back`/`hủy` ALONE are AMBIGUOUS. If only ambiguous phrasing was used, STOP and ask:
   > "Bạn muốn rollback workflow `<id>` về backup gần nhất trên production `$N8N_HOST` đúng không?"

2. **Specific workflow ID provided**: A workflow ID must be present. If missing, STOP and ask user.

3. **Production destructive awareness**: Rollback REPLACES the current production state. The CLI snapshots the current state first (recoverable), but webhook routing changes immediately.

4. **Re-activation must be separate**: Never pass `--reactivate` unless the user EXPLICITLY asked for it after being told the workflow will stay inactive otherwise.

**If ANY check fails → STOP, ask user, do not proceed.**

---

## Procedure

### Step 1 — Locate the backup directory
- If `--project` provided: `<workflowRoot>/<project>/_backups/`
- Otherwise find it from the workflow name:
  ```bash
  n8nctl workflow get <id> --jq '.name'
  ```
  then Glob `<workflowRoot>/*/_backups/*_<id>_*.json` to find which project holds backups for this workflow.

### Step 2 — Preview (read-only)
```bash
n8nctl workflow rollback <id> --backup-dir <projectDir>/_backups --dry-run
```
Prints the chosen target file (+ how many candidates), and the full diff
current → target. Nothing is written — not even the safety snapshot.

If the target backup is older than 7 days, WARN the user — the workflow may
have evolved significantly. To pick a different restore point: `--to <file>`.

### Step 3 — Confirm with user (MANDATORY — never skip)
Show the user: target file + timestamp, the diff summary, and that
re-activation will NOT happen unless they ask. Require a clear "yes/có".

### Step 4 — Apply (one command)
```bash
n8nctl workflow rollback <id> --backup-dir <projectDir>/_backups --yes
```
The CLI does, in order: safety snapshot of the CURRENT state (`*-pre-rollback.json`,
excluded from target selection) → restore via the 4-field whitelist → re-reads
and reports any residual diff. Add `--reactivate` ONLY with explicit consent.

### Step 5 — Verify the rolled-back state
```bash
n8nctl workflow verify <id> [--expect-fields a,b,c]
```
(or `verify --run --trigger "<trigger-node>"` to execute first via session
mode). Exit 6 = gate failed → investigate before considering the rollback done.

### Step 6 — Report
- Rolled back: current → <target file timestamp>
- Safety snapshot path (printed by the CLI) — roll-forward point if user changes mind
- Active state (INACTIVE unless --reactivate was consented)
- Verify gate result
- Recommendation: investigate what broke since the backup before re-deploying forward

## Rules
- Never run Step 4 without explicit user confirmation in Step 3
- Never pass `--reactivate` by default — separate user decision
- The CLI refuses non-TTY runs without `--yes` by design; the `--yes` is YOUR
  attestation that the user confirmed in Step 3
- If auto-triggered with ANY ambiguity, STOP at PRE-INVOCATION CHECK
