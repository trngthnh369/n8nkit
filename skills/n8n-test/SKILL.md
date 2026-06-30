---
name: n8n-test
description: Execute an n8n workflow on production ($N8N_HOST) and check the Cần + Đủ test gate via n8nctl. Auto-triggers when user asks to test/run/verify/chạy thử/kiểm tra/execute a specific n8n workflow with workflow ID. Read-only — never modifies workflow state. Also invokable manually as `/n8n-test <workflowId>`. Use after /n8n-deploy or /n8n-fix to verify success, or anytime user wants to validate workflow execution against fixture payload.
argument-hint: <workflowId> [--payload=<json-file>] [--expect-fields=a,b,c] [--max-duration-ms=60000]
allowed-tools: Bash, Read, Glob
---

# n8n Test — Execute & Gate Check

Execute the given workflow and evaluate results against the test gate.

**Primary tool: `n8nctl` CLI**.

## When this skill triggers

**Auto-trigger** when user phrasing matches:
- "test workflow <id>", "chạy thử workflow <id>", "kiểm tra wf <id>"
- "verify workflow <id>", "execute workflow <id>"
- After `/n8n-deploy` success → suggest test
- After `/n8n-fix` success → suggest test

**Do NOT auto-trigger** if:
- User mentions "test" in unrelated context (e.g., "test code", "unit test")
- No workflow ID provided
- Phrasing implies modification (deploy/build/fix → use those skills instead)

**Manual trigger**: `/n8n-test <workflowId> [args]`

## Arguments
`$ARGUMENTS`

## Procedure

### Step 1 — Fetch workflow metadata
```bash
n8nctl workflow status <workflowId>
```
Output shows active state, tags, webhook URLs (with live/inactive marker), last execution, node count. Identify trigger type from this. **If `(not registered — workflow inactive)`** xuất hiện cạnh webhook URL → chạy `n8nctl workflow activate <workflowId>` trước khi tiếp tục, hoặc nói user activate trong UI.

For deeper inspection (node types, connections):
```bash
n8nctl workflow get <workflowId> --jq '[.nodes[] | {name, type, typeVersion}]'
```

### Step 2 — Build execution payload
- If `--payload=<file>` provided, use that JSON file
- Otherwise: look for `D:/Projects/work/build-workflow/_fixtures/<workflow-name>.json`
- If no fixture exists, ASK the user for sample input data or offer to build a fixture on-demand

### Step 3 — Trigger + wait
**Webhook-triggered (most common)**:
```bash
n8nctl workflow trigger-webhook <workflowId> --file <payload.json> --wait --timeout 120000
```
This fires the webhook URL and polls `/executions` for completion. Exit 0 = success, non-zero = failed execution.

**Webhook returns 404 even though workflow is active?** n8n caches webhook handlers tied to the workflow version at activation time — updating in place does NOT refresh the cache. Workaround:
```bash
n8nctl workflow refresh <workflowId>     # deactivate → wait → activate
n8nctl workflow trigger-webhook <workflowId> --file <payload.json> --wait
```

**Schedule-only or manual-only** (n8nctl ≥ 0.7.0 — one-shot run+gate):
```bash
n8nctl workflow verify <workflowId> --run --trigger "<trigger-node-name>" [--timeout 120000] [--expect-fields ...]
# (--run executes headless via /rest session mode, waits, then gates the new execution)
```
Requires `n8nctl auth login --session` once. For quick check of last execution: `n8nctl execution list --workflow <id> --limit 1`

### Step 4 — Capture execution ID
From `trigger-webhook --wait` output, grab the returned execution ID.

Or query directly:
```bash
n8nctl execution list --workflow <workflowId> --limit 1 --jq '.[0].id'
```

### Step 5 — Run test gate (n8nctl ≥ 0.7.0 — built-in)
```bash
n8nctl workflow verify <workflowId> --execution <executionId> [--expect-fields a,b,c] [--max-duration-ms 60000]
```
Prints the CẦN/ĐỦ/TỐT tier report. **Exit 6 = gate failed** (assertion), exit
1-5 = infra error — distinguish them when scripting. Richer assertions
(per-node ran/minItems, failOnSlow) go in a versioned expectation file:
`--expect gate.yml` (`version: v1`). The old external
`_pipeline/test-gate.js` is retired — this command replaces it 1:1.

### Step 6 — If failed, pull error details
```bash
n8nctl execution last-error --workflow <workflowId> --summary
```
Shows failing node + error message.

### Step 7 — Report
- Execution ID, duration, status
- Gate tier results (CẦN / ĐỦ / TỐT)
- If failed: failing node name + error message
- Next action: `/n8n-fix <workflowId>` if CẦN or ĐỦ failed

## Rules
- Never activate/deactivate the workflow as part of testing
- Never modify the workflow here — this is a read-only evaluation command
- If auto-triggered without explicit workflow ID, STOP and ask user for the ID
