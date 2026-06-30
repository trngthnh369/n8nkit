---
name: n8n-fix
description: Self-healing loop for a broken n8n workflow on production — fetches latest execution error, patches JSON, retries up to 3 times, escalates to architect if all fail. Auto-triggers when user reports an n8n workflow error/failure with workflow ID, or after a /n8n-test or /n8n-deploy gate fails. Has built-in safety: backup before patch, validate before deploy, never touches credentials, max 3 retries with auto-journaling. Also invokable manually as `/n8n-fix <workflowId>`. NOT for fixing generic code bugs — only n8n workflow execution errors.
argument-hint: <workflowId> [--max-retries=3]
allowed-tools: Read, Write, Edit, Bash, Glob
---

# n8n Fix — Self-Healing Loop

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
Record the backup path. Find `projectDir` by searching `D:/Projects/work/build-workflow/*/workflow/` for the workflow JSON.

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
- Increase thinking budget: use Opus 4.7 with maximum extended thinking (31999 tokens)
- Spawn `architect` agent for deep root-cause analysis spanning multiple nodes
- If that also fails → STOP, write detailed report, ask user for manual decision
  - Report must include: all 3 attempted diffs, why each failed, hypothesis for root cause, recommended next steps
- Offer rollback: `n8nctl workflow rollback <workflowId>` (snapshot → diff → confirm → restore → verify, one command)
- **Auto-journal**: Invoke `journal-writer` agent (via Agent tool, subagent_type="journal-writer") to record:
  - Category: `bug` (if clear root cause found) hoặc `dead-end` (if abandoned)
  - Context: workflow name + id, 3 attempted diffs with results, error patterns observed
  - Purpose: feed into continuous-learning-v2 pattern extraction
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
3. **Auto-journal** (if fix took >1 attempt): Invoke `journal-writer` with category `bug` — record which approach worked on which retry, so future iterations learn the signal-to-action mapping.

### Step 6 — Report
Whether success or failure, output:
- Total attempts used
- Root cause identified
- Final status (fixed / escalated / abandoned)
- Backup file path for rollback
- Git commit hash (if committed)

## Rules
- Never activate a workflow as part of the fix — only user activates via `/n8n-deploy --activate`
- Every patch must pass `n8nctl workflow validate --strict` before deploy
- Never modify multiple unrelated nodes in one patch — minimal diff only
- If root cause is credential-related, STOP and ask user — never touch credentials
- Use backup manifest tool: `node ~/.claude/tools/n8n-backup-manifest.js create <file.json> --reason=n8n-fix` cho structured backup (có SHA256, retention, restore verify)
- If auto-triggered, confirm workflow ID with user before starting retry loop (avoid wasting attempts on wrong workflow)

## Backup & Restore

Before patch: tạo backup với manifest
```bash
node ~/.claude/tools/n8n-backup-manifest.js create <projectDir>/workflow/<name>.json --reason=n8n-fix
```

List backups: `node ~/.claude/tools/n8n-backup-manifest.js list <projectDir>`

Restore nếu cần: `node ~/.claude/tools/n8n-backup-manifest.js restore <projectDir> <backup-id>`

Retention: `node ~/.claude/tools/n8n-backup-manifest.js prune <projectDir> --keep=10` (default 10)
