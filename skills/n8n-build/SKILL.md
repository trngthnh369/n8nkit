---
name: n8n-build
description: Build a NEW n8n workflow JSON from template + research, with strict format validation. Auto-triggers when user asks to build/create/tạo/làm/viết a new n8n workflow with a description of what it does, optionally specifying tier (orchestrator/hub/utility) or target project folder under <workflowRoot>/. Local-only — creates file on disk, does NOT deploy to production. Also invokable manually as `/n8n-build <workflow-description>`. Always starts from template skeleton (never blank file), runs n8nctl validate as mandatory gate before reporting success.
argument-hint: <workflow-description> [--tier=orchestrator|hub|utility] [--project=<project-name>]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# n8n Build — Template-First Workflow Construction

> `<workflowRoot>` = the n8n projects root, read from `.n8nkit/config.json` (`workflowRoot` key); default `D:/Projects/work/build-workflow`.

You are building a new n8n workflow JSON. Follow this procedure **exactly**. Do not deviate.

## When this skill triggers

**Auto-trigger** when user phrasing matches:
- "build/tạo/create/làm/viết workflow X làm Y"
- "tạo wf mới cho <use case>" with description
- "build n8n flow để <task>"
- User describes desired workflow logic + mentions n8n/workflow

**Do NOT auto-trigger** if:
- "build the project" without n8n context (might be code build)
- "create a file" generic file creation
- "build documentation" / "build report"
- No workflow logic described — just "build something for me"

**Manual trigger**: `/n8n-build <description> [--tier=...] [--project=...]`

## Arguments
`$ARGUMENTS`

## Procedure

### Step 1 — Parse intent
Extract from arguments:
- **Description**: what the workflow should do
- **Tier**: `orchestrator` | `hub` | `utility` (default: infer from description; utility for single-purpose, hub for domain logic, orchestrator for routing)
- **Project**: target folder name under `<workflowRoot>/<project>/`. If missing, ASK the user before continuing.

### Step 2 — Research (mandatory, do not skip)
Use these skills/agents in parallel:
1. **n8n-workflow-patterns** skill → find matching workflow pattern (+ node cheat-sheet, ecommerce recipes)
2. **n8n-node-configuration** skill → confirm correct node types and typeVersion for the required operations
3. **n8n-integrations** skill → verify credential/auth patterns for any external API
4. **n8n-expression-syntax** skill → validate expression syntax you plan to use
5. If the task touches an existing domain (ai-ads-manager, ai-kpi-manager, etc.), Read 1-2 existing workflow JSONs from that project for conventions

If the user has `n8n-wiki` at `<workflowRoot>/n8n-wiki/`, query it via `wiki-query` skill.

### Step 3 — Start from template (mandatory)
Copy the tier template as the base skeleton:
- orchestrator → `<workflowRoot>/_templates/orchestrator.template.json`
- hub → `<workflowRoot>/_templates/hub.template.json`
- utility → `<workflowRoot>/_templates/utility.template.json`

**Never build workflow JSON from a blank file.** Always start from template and modify nodes.

### Step 4 — Modify template
- Replace `TEMPLATE_<TIER>` name with a meaningful workflow name: `<tier>-<domain>-<purpose>` (kebab-case)
- Regenerate all node `id` fields as new UUIDs (keep the `uuid-like` format)
- Add/remove/rewire nodes for the actual task
- Use `Asia/Ho_Chi_Minh` timezone, Luxon for date handling in Code nodes
- Use `$input.all()` for batch, `$input.first()` for single
- Set `neverError: true` on HTTP and parse error handling where appropriate
- Never hardcode secrets, tokens, API keys, or passwords. Use n8n credentials references.

**Node selection priority (MANDATORY order):**
1. **Native HTTP Request node first** (`n8n-nodes-base.httpRequest`, typeVersion 4.2) — use for ANY REST/Graph API integration (Meta, Shopee, Lazada, OpenAI custom endpoints, internal APIs, generic REST). Most flexible, well-documented, always available.
2. **Specialized native node** — only when ALL of these are true:
   - Native node exists for the specific service (`n8n-nodes-base.googleSheets`, `n8n-nodes-base.gmail`, `n8n-nodes-base.slack`, `n8n-nodes-base.telegram`, LangChain AI nodes, etc.)
   - Service requires complex OAuth2 flow that's easier via native credential UI
   - Native node provides features not trivial to replicate (batch upload, pagination handling, file streaming)
3. **Code node** — for data transformation, validation, dedup logic, NOT for HTTP calls (use HTTP Request node + downstream Code node for response processing)
4. **Custom/community nodes** — AVOID unless absolutely required. Most community node functionality can be replicated with HTTP Request + Code nodes.

**Rationale:** HTTP Request is the most stable, transferable, debuggable choice. Specialized nodes can silently break across n8n versions; community nodes may not exist in user's instance.

### Step 5 — Save to project folder
Write to `<workflowRoot>/<project>/workflow/<workflow-name>.json`
(create `<project>/workflow/` directory if missing)

### Step 6 — Normalize + local validation (mandatory)

First **normalize** (fixes node ids → UUID + injects execution-log settings,
deterministically):
```bash
n8nctl workflow normalize <path> -w        # -w = write back in place
```
This clears E070 (settings-no-logs) and E071 (node-id-not-uuid) automatically.

Then validate:
```bash
n8nctl workflow validate <path> --strict
```
(Fallback if CLI not installed: `node <workflowRoot>/_pipeline/validate.js <path>`)

If validation fails:
- Read every error, fix the JSON, re-run normalize + validate.
- **E072 (typeVersion outdated)** → bump each flagged node to the latest
  typeVersion from the offline catalog (`n8nctl workflow schema --node <type>`
  or `node-catalog.json`). normalize does NOT auto-bump (param structure can
  differ across versions) — fix it at the source so params match the version.
- Do NOT proceed until the validator passes (CRITICAL/HIGH). E070/E071/E072 are
  warnings; E070+E071 should be gone after normalize.
- Max 3 fix attempts. If still failing, stop and report to user.

> **At generation time, always emit the LATEST typeVersion** for each node
> (httpRequest 4.2, set 3.4, code 2, …) — check the catalog, don't guess an old
> version. This prevents E072 entirely.

### Step 7 — Report
Output a summary including:
- Workflow name, tier, node count, file path
- Key design decisions (why these nodes, why this tier)
- Next recommended action: `/n8n-deploy <path>` to deploy to n8n

## Rules
- **Never bypass Step 6**. Format correctness is the #1 priority — deploying invalid JSON wastes everyone's time.
- If tier is unclear, ASK the user before generating.
- If the workflow needs credentials that don't exist, note this in the report.
- Do NOT activate the workflow in this command — that is `/n8n-deploy`'s job.
- If auto-triggered without enough context (no workflow description, no project), STOP and ask user for missing info.
