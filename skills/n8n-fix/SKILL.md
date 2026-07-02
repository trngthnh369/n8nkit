---
name: n8n-fix
description: 'Self-healing loop for a broken n8n workflow on production — fetches latest execution error, patches JSON, retries up to 3 times, escalates to architect if all fail. Auto-triggers when user reports an n8n workflow error/failure with workflow ID, or after a /n8n-test or /n8n-deploy gate fails. Has built-in safety: backup before patch, mandatory user confirmation + artifact gate before the FIRST production write of the loop, validate before deploy, never touches credentials, max 3 retries with auto-journaling. Also invokable manually as `/n8n-fix <workflowId>`. NOT for fixing generic code bugs — only n8n workflow execution errors.'
argument-hint: <workflowId> [--max-retries=3]
allowed-tools: Read, Write, Edit, Bash, Glob
---

# n8n Fix — Self-Healing Loop

> `<workflowRoot>` = the n8n projects root, read from `.n8nkit/config.json` (`workflowRoot` key); default `D:/Projects/work/build-workflow`.

Self-healing loop for a broken n8n workflow. Use `n8nctl` CLI + `n8n-debugger` agent for patch logic.

## When this skill triggers

**Auto-trigger** when user phrasing matches:
- "fix workflow <id>", "sửa wf <id>", "debug workflow <id>"
- "wf <id> bị lỗi", "workflow <id> failed/crashed"
- After `/n8n-test` reports CẦN/ĐỦ failure → suggest fix
- After `/n8n-deploy` test gate fails → suggest fix

**Do NOT auto-trigger** if:
- Generic "fix bug", "fix code", "fix this function" (no workflow ID)
- User asking about how n8n errors work (use ask/explain instead)
- Error is credential-related — STOP and ask user (never auto-fix credentials)
- No specific workflow ID provided

**Manual trigger**: `/n8n-fix <workflowId>`

## Arguments
`$ARGUMENTS`

## Procedure

### Step 1 — Fetch latest failed execution
```bash
n8nctl execution last-error --workflow <workflowId>
```
Extract: failing node name, error message, error type, input data to that node.

For summary only: `n8nctl execution last-error --workflow <workflowId> --summary`.

### Step 2 — Backup current workflow
```bash
n8nctl workflow backup <workflowId> -o <projectDir>/_backups/
```
Record the backup path. Find `projectDir` by searching `<workflowRoot>/*/workflow/` for the workflow JSON.

### Step 3.0 — PRODUCTION WRITE GATE (MANDATORY, once per fix session)

The retry loop writes to PRODUCTION (`n8nctl workflow update`). Before the FIRST update of the loop:

1. **Create the approval artifact** `.claude/artifacts/n8n-fix-<workflowId>/context-snippets.json`:
   ```json
   {
     "workflow_id": "<id>", "workflow_name": "<name>",
     "failing_node": "<node>", "error_summary": "<1-line>",
     "backup_path": "<from Step 2>",
     "rollback_command": "/n8n-rollback <workflowId>",
     "approved_at": "<iso timestamp — written AFTER user confirms>"
   }
   ```
2. **Show the user**: root-cause hypothesis, the attempt-1 patch diff (`n8nctl workflow diff <workflowId> <file>`), backup path, and target host (`n8nctl auth status`).
3. **Ask explicit confirmation** — user must reply a clear "yes"/"có" (same wording rule as `/n8n-deploy` Step 5) to authorize the fix loop (max retries as configured). The first `n8nctl workflow update` MUST NOT run before this gate passes.
4. Retries inside the approved loop deploy without re-asking, BUT append `{attempt, diff_summary, verify_exit}` to `attempts.json` in the artifact dir after each attempt. If the root-cause hypothesis changes to a DIFFERENT node mid-loop → re-confirm with the user before deploying that patch.

> Enforcement: the `pre-bash-n8n-prod-guard` hook blocks `n8nctl workflow update` when no fresh approval artifact exists — this gate is deterministic, not just procedure.

### Step 3 — Retry loop (max 3 by default)
For each attempt:
1. **Diagnose** — delegate to `n8n-debugger` agent with execution error context. Agent should identify root cause (node config, expression, missing field, credential, etc.)
2. **Patch** — modify the workflow JSON file locally. Minimal diff only.
3. **Validate** — `n8nctl workflow validate <file> --strict`. Must pass.
4. **Preview diff** — `n8nctl workflow diff <workflowId> <file>` to confirm change is minimal
5. **Deploy** — `n8nctl workflow update <workflowId> <file>`.
   - If pre-fix `n8nctl workflow status <workflowId> --exit` exited 0 (was active) AND workflow has webhook nodes → run `n8nctl workflow refresh <workflowId>` after update. n8n caches webhook handlers tied to the workflow version at activation time; in-place updates leave stale handlers that route the OLD logic. Refresh cycles deactivate→activate.
6. **Re-execute + gate** — same payload as original failure, in one command:
   ```bash
   n8nctl workflow trigger-webhook <workflowId> --file <payload.json> --wait --timeout 120000
   n8nctl workflow verify <workflowId> [--expect-fields a,b,c]   # exit 6 = gate failed
   ```
   If webhook 404: `n8nctl workflow refresh <workflowId>` then retry.
   (n8nctl ≥ 0.7.0: `workflow verify` replaces the old `_pipeline/test-gate.js`.)
7. If verify exits 0 → break out → go to Step 5
8. If verify exits 6 (gate failed) → increment attempt counter, repeat with updated error context
   (exit 1-5 = infra error, not an assertion failure — stop and surface it)

### Step 4 — Escalation (if all 3 retries fail)
- Raise reasoning depth to the maximum this session supports for the deep-dive.
- Spawn the `architect` agent for deep root-cause analysis spanning multiple nodes. **If `architect` is not available in this installation, do the deep RCA yourself with maximum reasoning depth** — don't hard-fail on the missing agent.
- If that also fails → STOP, write detailed report, ask user for manual decision
  - Report must include: all 3 attempted diffs, why each failed, hypothesis for root cause, recommended next steps
- Offer rollback: `n8nctl workflow rollback <workflowId>` (snapshot → diff → confirm → restore → verify, one command)
- **Auto-journal (optional)**: if the `journal-writer` agent is available (Agent tool, subagent_type="journal-writer"), record — otherwise skip silently:
  - Category: `bug` (if clear root cause found) hoặc `dead-end` (if abandoned)
  - Context: workflow name + id, 3 attempted diffs with results, error patterns observed
  - Save to `~/.claude/projects/<project-slug>/journal/<date>-n8n-fix-<wf-slug>.md`

### Step 5 — Success path
After a successful fix:
1. Commit the patched JSON to the project git repo:
   ```bash
   cd <projectDir>
   git add workflow/<name>.json
   git commit -m "fix(n8n): <workflow-name> - <root-cause-summary>"
   ```
   Include execution ID of the successful run in commit body.
2. Report success with before/after diff summary
3. **Auto-journal** (optional, if fix took >1 attempt AND `journal-writer` is available): record with category `bug` which approach worked on which retry, so future iterations learn the signal-to-action mapping. Skip silently if the agent is not installed.

### Step 6 — Report
Whether success or failure, output:
- Total attempts used
- Root cause identified
- Final status (fixed / escalated / abandoned)
- Backup file path for rollback
- Git commit hash (if committed)

## Rules
- **Fix loop FAILS closed if the artifact dir is missing before the first `workflow update`** — same artifact-gate contract as `/n8n-deploy` (enforced by `pre-bash-n8n-prod-guard` hook)
- Never activate a workflow as part of the fix — only user activates via `/n8n-deploy --activate`
- Every patch must pass `n8nctl workflow validate --strict` before deploy
- Never modify multiple unrelated nodes in one patch — minimal diff only
- If root cause is credential-related, STOP and ask user — never touch credentials
- Use the bundled backup-manifest tool (`$BM` below) for structured backups (SHA256, retention, restore verify)
- If auto-triggered, confirm workflow ID with user before starting retry loop (avoid wasting attempts on wrong workflow)

## Backup & Restore

`$BM` = the backup-manifest helper shipped with this kit: `<pluginRoot>/shared/n8n-backup-manifest.js`, where `<pluginRoot>` is **two directories up from this SKILL.md** (`skills/n8n-fix/` → plugin root). **If it is missing** (e.g. a partial install), degrade to `n8nctl workflow backup <id> -o <projectDir>/_backups/` — do not fail the fix on the helper's absence.

```bash
# Before patch — structured backup:
node "$BM" create <projectDir>/workflow/<name>.json --reason=n8n-fix
# List / restore / prune:
node "$BM" list <projectDir>
node "$BM" restore <projectDir> <backup-id>
node "$BM" prune <projectDir> --keep=10   # default 10
```
