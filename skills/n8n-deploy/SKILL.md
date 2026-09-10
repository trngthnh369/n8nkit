---
name: n8n-deploy
description: Deploy an n8n workflow JSON to PRODUCTION ($N8N_HOST) with backup, validation, test gate, and git commit. Auto-triggers ONLY when user explicitly says deploy/push/update/đẩy lên/triển khai with a specific workflow file path AND clear deploy intent. Production-touching — has MANDATORY user confirmation before any activate. Never auto-executes on ambiguous "ship"/"send it"/"đẩy" without explicit file path. Also invokable manually as `/n8n-deploy <workflow-file.json>`. ALWAYS runs preflight + local validate + diff preview + backup + confirm gate before deploying. Activation requires separate explicit user consent.
argument-hint: <workflow-file.json> [--activate] [--project=<project-name>]
allowed-tools: Read, Edit, Bash, Glob
---

# n8n Deploy — Production Workflow Deploy

> `<workflowRoot>` = the n8n projects root, read from `.n8nkit/config.json` (`workflowRoot` key); default `D:/Projects/work/build-workflow`.

## ⚠️ MANDATORY PRE-INVOCATION CHECK (read before any procedure step)

Before doing ANYTHING in this skill, verify ALL of the following:

1. **Explicit deploy intent**: User used a clear deploy verb — `deploy`/`push`/`update`/`đẩy lên`/`triển khai`/`upload`. Words like `ship`/`send it`/`đưa lên`/`finalize` ALONE are AMBIGUOUS. If only ambiguous phrasing was used, STOP and ask:
   > "Bạn có chắc muốn deploy workflow này lên production `$N8N_HOST` không? File path là gì?"

2. **Specific file path provided**: A `.json` file path under `<workflowRoot>/<project>/workflow/` must be present in the request. If missing, STOP and ask user for the file path.

3. **Auto-trigger context check**: If this skill was auto-invoked (not via `/n8n-deploy`), DOUBLE-confirm with user before any `n8nctl workflow update/create` call:
   > "Mình đang định deploy `<file>` lên production. File đã pass local validate chưa? Bạn xác nhận tiếp tục? (y/n)"

4. **Never infer `--activate`**: The `--activate` flag must come from explicit user input only. If user said "deploy and turn on" or "deploy + activate", treat as 2 separate confirmations:
   > Step A: Deploy as INACTIVE → confirm
   > Step B: After test gate passes → ask separately about activation

5. **One-way action awareness**: Webhook activation cache changes routing for production traffic. Confirm user understands this is live production impact.

**If ANY of the 5 checks fail → STOP, ask user, do not proceed.**

---

## ⚠️ ARTIFACT GATE (mandatory before Step 6 — the FIRST production write)

Artifact phải tồn tại trước **lệnh ghi production đầu tiên**, tức Step 6 (`workflow create`/`update`/
`deploy`), KHÔNG phải trước Step 7/8. Hook `pre-bash-n8n-prod-guard` gác cả `create` lẫn `update` —
viết artifact sau Step 6 thì Step 6 bị chặn, không bao giờ tới được Step 7.

Ghi artifact **2 lần** (xem Step 5b và Step 8):
- **Lần 1 — sau Step 5 confirm, trước Step 6.** Update: đã có id → `n8n-deploy-<workflowId>/`, khai
  `workflow_id`. Create: **chưa có id** → `n8n-deploy-<name-slug>/`, **bỏ trống `workflow_id`**
  (không có gì để ràng; artifact khi đó chỉ ràng theo skill, đúng như `/n8n-cook`).
- **Lần 2 — sau Step 6, trước Step 7/8.** Điền `workflow_id` thật (create vừa trả về) và re-emit để
  marker còn tươi (<30') cho `activate`. Từ lúc này artifact ràng đúng workflow đang bị đụng.

Nội dung `.claude/artifacts/n8n-deploy-<workflowId|name-slug>/`:

**1. `context-snippets.json`** — workflow state evidence:
```json
{
  "workflow_id": "<id>",
  "workflow_name": "<name>",
  "current_state": "<remote JSON from Step 3 diff>",
  "diff_vs_previous": "<output từ n8nctl workflow diff>",
  "credentials_referenced": ["<credential names only — KHÔNG values>"]
}
```

**2. `verification.json`** — test + rollback:
```json
{
  "workflow_id": "<id>",
  "test_execution": {
    "fixture_payload": "<test data>",
    "expected_output_schema": "<expected>",
    "test_gate_command": "n8nctl workflow verify <workflowId> --execution <execId>"
  },
  "rollback_plan": {
    "backup_file": "<path từ Step 4>",
    "rollback_command": "/n8n-rollback <workflowId>"
  }
}
```

**Deploy (Step 6) và Activate (Step 8) đều FAIL** nếu artifact missing hoặc
`verification.json.rollback_plan` thiếu. Mục đích: ép evidence "rollback plan đã chuẩn bị" trước khi
ghi production, chứ không phải sau khi đã ghi rồi.

---

You are deploying an n8n workflow to production. Follow this procedure **exactly**. This is a production system.

**Primary tool: `n8nctl` CLI** (`@trngthnh369/n8nctl`). Fallback: curl via `n8nctl` (skill) docs.

## When this skill triggers

**Auto-trigger** ONLY when user phrasing matches BOTH:
- A clear deploy verb: deploy/push/update/đẩy lên/triển khai/upload
- AND a specific workflow file path (`.json` under `build-workflow/`)

**Do NOT auto-trigger** if:
- Only "ship"/"send"/"finalize" verb used (ambiguous — confirm first)
- No file path provided (ask user instead of guessing)
- User mentions "deploy" in unrelated context (deploy code, deploy app)
- Build verbs only (build/create/tạo) — that's `/n8n-build` instead

**Manual trigger**: `/n8n-deploy <file.json> [args]` — slash command bypasses ambiguity check (user already explicit).

## Arguments
`$ARGUMENTS`

## Procedure

### Step 0 — Preflight
Run: `n8nctl doctor`

If any check fails → STOP. Fix the env/auth/connectivity issue first.

### Step 1 — Parse and sanity check
- File path must exist and be valid JSON
- Determine project folder (parent of `workflow/` subfolder, or `--project` arg)
- Print deploy plan to the user BEFORE any API calls

### Step 2 — Local validation (mandatory gate)
Run: `n8nctl workflow validate <file> --strict`

(Fallback if CLI not installed: `node <workflowRoot>/_pipeline/validate.js <file>`)

If errors → STOP, do not proceed. Tell user to fix and re-run.

### Step 3 — Detect existing workflow + show diff
Determine if this is create or update:
- If JSON has `id` field → run: `n8nctl workflow get <id> -o /tmp/remote.json` to confirm existence
- If exists → show diff: `n8nctl workflow diff <id> <file>` — user sees exactly what will change
- If not exists or no id → it's a create

### Step 4 — Backup (mandatory if update)
If update:
```bash
n8nctl workflow backup <id> -o <projectDir>/_backups/
```
Record the printed backup file path for possible rollback.

If create: skip backup.

### Step 5 — Confirm with user (MANDATORY — never skip)
Show the user:
- Create or update
- Workflow name + node count
- Diff summary (from Step 3)
- Backup file path (if update)
- Whether `--activate` flag was passed
- Target host (from `n8nctl auth status`)

**Ask for explicit confirmation before proceeding.** Do not proceed on ambiguous answers like "yeah", "ok" alone — require clear "yes/có/proceed".

Optional preview: `n8nctl workflow update <id> <file> --dry-run` or `n8nctl workflow create <file> --dry-run`.

### Step 5b — Write the approval artifact (MANDATORY, ngay sau confirm, TRƯỚC Step 6)

Xem "ARTIFACT GATE" ở đầu file cho schema đầy đủ. Tóm tắt:

```
update  → .claude/artifacts/n8n-deploy-<workflowId>/   + "workflow_id": "<id>"
create  → .claude/artifacts/n8n-deploy-<name-slug>/    + KHÔNG có "workflow_id" (chưa tồn tại)
```
Cả hai file `context-snippets.json` + `verification.json` (kèm `rollback_plan`) phải có mặt trước khi
chạy bất kỳ lệnh nào ở Step 6. Bỏ qua bước này → hook chặn Step 6, đúng thiết kế.

### Step 6 — Deploy as INACTIVE

> **Sequencer alternative (n8nctl ≥ 1.4)**: `n8nctl workflow deploy <file> --create-only|--id <id>
> --run --rollback-on-fail --validate-policy strict --out-dir <artifactDir>` collapses Steps 6-7
> (normalize → validate → create-or-update → run + verify gate) into one command with automatic
> rollback-on-fail. The gates of THIS skill still apply unchanged: Step 4 backup first (the
> sequencer's rollback snapshot is in-memory only, failure-path only), Step 5 confirm before running
> it, and **never pass `--activate` to the sequencer** — it activates BEFORE the run gate; Step 8's
> separate activation confirm stays. Exit 3 = validation/name-ambiguity, 6 = gate fail (→ Step 7
> interpretation), 1-5 = infra.

```bash
# Create
n8nctl workflow create <file>

# Update
n8nctl workflow update <id> <file>
```

If the CLI returns exit code ≠ 0 → the workflow was NOT deployed. Read the error, show it to the user, ask whether to attempt a fix or abort.

**Ngay sau khi Step 6 thành công (create path): re-emit artifact với `workflow_id` thật vừa nhận
được** — rename thư mục `n8n-deploy-<name-slug>/` → `n8n-deploy-<workflowId>/` và ghi `workflow_id`
vào cả 2 file. Không làm bước này thì `activate` ở Step 8 không được ràng vào workflow nào.

### Step 7 — Run test gate

> **Verification primitive choice (POC-verified on n8n 1.122.5, 2026-06-09):**
> - **Non-webhook** (manual / scheduled / sub-workflow) → `n8nctl workflow run`
>   (session mode). The Public API has NO execute endpoint; `workflow run` hits
>   the internal `/rest/.../run` (UI "Execute Workflow") and bypasses the
>   webhook router entirely — works even when the router is stuck.
> - **Webhook** → `n8nctl workflow trigger-webhook` (hits the real inbound path).
>   On 1.122.5 single-main, webhook registers fine via API activate (the old
>   "API activate never registers" claim was disproven — see corrected memory
>   `feedback_n8n_webhook_no_register_via_api`). The stale-router bug (#21614)
>   only bites on **queue mode + heavily re-pushed** workflows.

**Preflight:** session-capable profile required for `workflow run`.
```bash
n8nctl auth status        # must list "session" in authMethods
# else: n8nctl auth login --session   (automation user, member role)
```

**A. Non-webhook workflows (manual / scheduled / sub-workflow) — PREFERRED:**
```bash
n8nctl workflow run <id> --wait --timeout 120000
#   → executes headless via /rest, polls execution, exit 0 success / 1 fail
#   → use --trigger <node name> if the workflow has multiple triggers
```

**B. Webhook-triggered workflows:**
```bash
n8nctl workflow activate <id>          # registers webhook (works on single-main)
n8nctl workflow status <id>            # confirm "...(live)"
n8nctl workflow trigger-webhook <id> --data <test-payload> --wait --timeout 120000
```

**Webhook 404 fallback** (only if trigger-webhook 404s — queue-mode / #21614):
1. `n8nctl workflow run <id> --trigger <non-webhook trigger> --wait` — bypasses
   the router; verifies workflow logic even when the webhook path is stuck.
2. If the test MUST exercise the real webhook inbound path: `n8nctl workflow
   refresh <id>`, retry; still 404 → user does a UI "Save" once.
3. Still failing → `/n8n-fix <id>` (genuine workflow error).
Do NOT loop version bumps to "force" registration (does not work).

**Schedule-only workflows:**
- Verify immediately (don't wait for the cron window): `n8nctl workflow run <id>
  --trigger "<Schedule Trigger node name>" --wait`.
- For fixed-time firing when the cron router is stuck (queue mode), schedule an
  OS-level task that calls `n8nctl workflow run <id>` (see
  `~/.claude/docs/n8n-autonomous-trigger.md`).

Then run the gate (n8nctl ≥ 0.7.0 built-in, replaces the old test-gate.js):
```bash
n8nctl workflow verify <workflowId> --execution <executionId> [--expect-fields a,b,c]
```

Interpretation (`workflow verify` exit codes):
- Exit 0 (PASS, incl. TỐT warnings) → proceed to Step 8
- Exit 6 (gate FAILED — CẦN or ĐỦ) → STOP, report, offer `/n8n-fix <workflowId>` to user
- Exit 1-5 (infra error: API/auth/network) → STOP, surface the error (not an assertion failure)

### Step 8 — Activate (only if --activate flag + gate passed + user confirmed)

**SECONDARY CONFIRMATION before activate**: Even if `--activate` was passed and gate passed, ask user once more:
> "Test gate đã pass. Activate workflow này lên production traffic? (y/n)"

```bash
n8nctl workflow activate <id>
```

For atomic deploy + activate (Step 6 + 8 in one shot, ONLY if user explicitly confirmed both):
```bash
n8nctl workflow update <id> <file> --activate
n8nctl workflow create <file> --activate
```

If `--activate` not provided, leave inactive and tell user how to activate manually.

### Step 8b — OPTIONAL: UI-Save trigger registration via agent-browser (post-activate)

> Root cause: n8n public API activate sets `active=true` in DB only — in-process webhook/cron
> router does NOT refresh (n8n-io/n8n#21614). Only UI "Save" (or n8n restart) registers triggers.
> This step automates that UI Save. **Manual UI Save remains the documented DEFAULT** until this
> helper has passed at least one smoke test on a stable workflow (added 2026-06-10, post plan-review).

Only run when: workflow has webhook/cron trigger AND was just activated AND user opted in.

1. **Smoke-test gate (first use only)**: before ever using this on a NEW deploy, run the full
   sequence below once on an already-working active workflow and verify no state change.
2. Load agent-browser core (`agent-browser skills get core`), open `$N8N_HOST`, login via n8n UI
   credentials (session login — never echo password; see `~/.claude/rules/conditional/n8n-trigger-autonomy.md`
   for the session-cookie alternative via `n8nctl auth login --session`).
3. Navigate to `/workflow/<id>`.
4. **Target assertion (MANDATORY)**: read the visible workflow title in the UI and compare with the
   expected name from Step 1. Mismatch → ABORT, do not Save. Also record active/inactive toggle state.
5. Press Save (Ctrl+S or Save button). Confirm save toast / no error banner.
6. **Post-state assertion**: active toggle unchanged vs step 4. Changed → report immediately.
7. **Side-effect-safe verification** (in order of preference):
   a. `n8nctl workflow get <id>` → confirm `active=true` (no webhook hit at all).
   b. Cron workflows: verify next execution appears at scheduled time (`n8nctl execution list`).
   c. Webhook workflows, ONLY if a live check is required: hit the webhook with a dry-run/test
      payload the workflow no-ops on (e.g. a fixture marker field the workflow filters out).
      **NEVER send a realistic payload — a live webhook hit triggers the real production pipeline.**
      Expect non-404 (404 = trigger still unregistered → UI Save failed, fall back to manual).
8. On ANY failure (selector not found, login fail, title mismatch): fall back to manual UI Save
   instruction in the report. Do not retry blindly against production.

### Step 9 — Tag for tracking (optional)
```bash
n8nctl workflow tag <id> deployed --create
```

### Step 10 — Commit to git
Project folder pattern: each `<workflowRoot>/<project>/` is its own git repo.

1. `cd <projectDir>`
2. If `.git` missing → `git init`, ask user for remote URL, set remote, create initial commit
3. `git add workflow/<name>.json`
4. Commit: `feat(n8n): deploy <workflow-name>` or `fix(n8n): <root-cause>` for fix loop
5. Do NOT push unless user explicitly requested

### Step 11 — Report
Summary:
- Workflow ID, name, final active state
- Backup path (if any)
- Execution ID + gate result
- Git commit hash
- **Trigger registration status** — for webhook/cron workflows, state explicitly
  whether the trigger was verified live (a real execution / 200 webhook) or only
  `active=true` in DB. If not verified live, the report MUST include: "⚠️ Webhook/cron
  registered in DB only — do a UI 'Save' (or restart n8n) to make the trigger fire."
  Offer Step 8b (agent-browser UI-Save helper) if it has passed its smoke test.
- Next steps (activate later, monitor, etc.)

## Rules
- Production host. Never skip Step 0 (doctor), Step 2 (validate), Step 4 (backup), Step 5 (confirm).
- If `n8nctl` returns non-zero, the workflow was NOT deployed. Do not lie about state.
- If a step fails mid-deploy, restore from backup: `n8nctl workflow restore <backup.json> --activate`
- If auto-triggered with ANY ambiguity in user phrasing, STOP at PRE-INVOCATION CHECK and confirm before proceeding.
