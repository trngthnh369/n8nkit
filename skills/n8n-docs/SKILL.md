---
name: n8n-docs
description: 'Generate human-readable documentation for an n8n workflow — a Vietnamese runbook for the requester, a mermaid flow diagram, and a node/credential table — from a local JSON file or a live workflow ID. Auto-triggers on "viết docs/runbook cho workflow", "document this workflow", "vẽ sơ đồ workflow", "generate workflow docs". Read-only on n8n; writes only a markdown file under the project docs/ folder. Also invokable as `/n8n-docs <file-or-id>`.'
argument-hint: <file-or-workflowId> [--out=<path>]
allowed-tools: Bash, Read, Write, Glob
---

# n8n Docs — Runbook + Diagram Generator

> `<workflowRoot>` = the n8n projects root, read from `.n8nkit/config.json` (`workflowRoot` key); default `D:/Projects/work/build-workflow`.

Turn a workflow into a runbook a non-technical requester can read. Template in [`RUNBOOK-TEMPLATE.md`](./RUNBOOK-TEMPLATE.md).

## When this skill triggers

**Auto-trigger** when user phrasing matches:
- "viết docs/runbook cho workflow", "document this workflow", "vẽ sơ đồ workflow"
- After `/n8n-deploy` succeeds → offer to generate the runbook for handover

**Do NOT auto-trigger** if:
- User wants API/CLI reference (that's the `n8nctl` skill)
- User wants a code review (that's `/n8n-review`)

**Manual trigger**: `/n8n-docs <file-or-id> [--out=<path>]`

## Arguments
`$ARGUMENTS`

## Procedure

### Step 1 — Resolve input (read-only)
- A `.json` path → read it.
- A workflow ID → `n8nctl workflow get <id> --redact -o <tmp>/wf.json` (redacted — no secrets in docs).

### Step 2 — Parse the graph
Extract nodes (name, type, purpose-from-name), the trigger, the connection edges, and credential
**names** (never values).

### Step 3 — Mermaid flow diagram
Build a `graph TD` from the connection graph, one node per box, edges following `connections`:
```
graph TD
  Trigger["⏰ Schedule Trigger"] --> A["Get Orders (HTTP)"]
  A --> B["Transform (Code)"]
  B --> C["Upsert (Postgres)"]
```

### Step 4 — Node / credential table
| Node | Type | What it does | Credential |
|---|---|---|---|
| … | … | (from the descriptive name) | (name only) |

### Step 5 — Business summary
If `<project>/docs/spec-<name>.md` exists (from `/n8n-intake`), pull the problem statement + success
criteria from it to write the "what this does / why" section — this closes the intake→docs loop. Otherwise
infer a one-paragraph summary from the workflow name + node purposes.

### Step 6 — Trigger + schedule facts
State the trigger type and, for schedules, the human-readable cadence ("every day at 07:00 ICT"); for
webhooks, the path and auth method (not the secret).

### Step 7 — Write + report
Fill RUNBOOK-TEMPLATE.md → `<project>/docs/runbook-<workflow-name>.md` (or `--out`). Report the path.

## Rules
- Read-only on n8n — never deploy/execute/modify. Only writes the markdown runbook.
- Always use the **redacted** workflow (`--redact`) as the source — no secrets or credential values in docs.
- **Next step**: hand the runbook to the requester; re-run after significant workflow changes.
