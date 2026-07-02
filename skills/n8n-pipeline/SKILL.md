---
name: n8n-pipeline
description: 'Fallback router and reference documentation for the n8n workflow pipeline. Trigger ONLY when user intent is ambiguous about which n8n operation to perform, or asks meta questions about the pipeline ("what should I do with this workflow", "list n8n commands", "explain n8n pipeline", "show me the n8n safety rules"). For specific operations, the dedicated skills handle directly: n8n-build (create), n8n-deploy (deploy to prod), n8n-test (verify), n8n-fix (self-heal), n8n-rollback (revert). Do NOT trigger when user has already specified a clear intent — let the specific skill take over.'
---

# n8n Pipeline Orchestrator

You are the entry point for n8n workflow automation. When triggered, you route the user's request to the right slash command and enforce safety rules across the whole pipeline.

## When to trigger
- User says "build/tạo workflow", "deploy wf", "test wf", "fix wf", "rollback wf"
- User references a workflow file under `<workflowRoot>/`
- User asks to push a workflow to n8n production
- User reports an n8n execution error and wants it fixed

## Pipeline map

| Intent | Slash command | Notes |
|---|---|---|
| Parse a request into a spec | `/n8n-intake <request>` | Vietnamese clarifying questions |
| Create new workflow JSON | `/n8n-build <desc> [--tier=...] [--project=...]` | Template-first, local validate |
| Review before deploy | `/n8n-review <file-or-id>` | Read-only, six-lens, scored artifact |
| Update existing + push to n8n | `/n8n-deploy <file> [--activate]` | Backup + confirm + test gate |
| Run workflow once to verify | `/n8n-test <workflowId> [--payload=...]` | Read-only, gate check |
| Fix broken workflow (auto loop) | `/n8n-fix <workflowId>` | 3 retries → escalate |
| Revert to last backup | `/n8n-rollback <workflowId>` | Confirmed rollback |
| Health + failure analytics | `/n8n-monitor [workflowId] [--since=...]` | Read-only, routes to fix/credentials |
| Promote between instances / drift | `/n8n-promote <id> --to <profile>` or `--check <A> <B>` | Target-touching, mapping + confirm |
| Credential audit/create/rotate | `/n8n-credentials <audit\|create\|rotate>` | The only skill that touches credentials |
| Generate a runbook | `/n8n-docs <file-or-id>` | Read-only, writes docs/runbook-*.md |

## Safety rules (non-negotiable)

0. **Preflight** — run `n8nctl doctor` at start of every pipeline run. Bail if any check fails.
1. **Production only** — `$N8N_HOST` is production. No staging exists. Treat every call as production-touching.
2. **Template-first build** — never generate workflow JSON from blank. Always copy from `_templates/`.
3. **Local validator before any deploy** — `n8nctl workflow validate <file> --strict`. Must pass.
4. **Diff preview before any update** — `n8nctl workflow diff <id> <file>` to confirm minimal changes.
5. **Backup before any update** — `n8nctl workflow backup <id> -o <projectDir>/_backups/` before `workflow update`.
6. **Confirm before activate** — always ask the user before flipping `active: true`.
7. **Test gate before activate** — execution must pass `n8nctl workflow verify <id>` (CẦN tier at minimum; exit 6 = failed).
8. **Git commit after successful deploy** — commit the JSON to the project repo, do NOT push unless asked.
9. **Self-healing loop caps at 3** — after 3 failed fix attempts, escalate with max thinking budget, then STOP and report.
10. **Never touch credentials** — credential issues require user intervention.
11. **Never skip hooks** — no `--no-verify`, no `--force` except when user explicitly requests.

## Primary tool: n8nctl CLI

**Preferred for ALL API interactions**. Package `@trngthnh369/n8nctl` (installed globally). Wraps REST API with:
- Layered auth (env > keyring > config file)
- Retry + exponential backoff + Retry-After handling
- `--dry-run` preview for destructive ops
- `--json` / `--jq` / `--template` output formats
- Typed exit codes (0 OK, 1 API, 2 auth, 3 validation, 4 network, 5 internal)

Full command reference: run `n8nctl --help` or see `n8nctl (skill)` skill.

## Supporting skills to delegate into

- **n8n-review** — six-lens read-only review before deploy (correctness/security/cost/perf/error/maintainability)
- **n8n-monitor** — instance health + execution analytics (read-only)
- **n8n-promote** — cross-instance promotion + drift check
- **n8n-credentials** — the only skill that touches credentials (audit/create/rotate)
- **n8n-docs** — generate a runbook + mermaid diagram from a workflow
- **n8nctl (skill)** — CLI command reference + raw API fallback (has `n8nctl` quick reference)
- **n8n-node-configuration** — correct node types + typeVersion (offline catalog)
- **n8n-expression-syntax** — expression syntax correctness
- **n8n-validation-expert** — interpret n8n validation errors
- **n8n-integrations** — Meta/Sheets/TikTok/Claude API patterns
- **n8n-code-javascript** — Code node content
- **n8n-workflow-patterns** — proven architectural patterns + node cheat-sheet + ecommerce recipes
- **wiki-query** — if the user maintains `n8n-wiki` at `<workflowRoot>/n8n-wiki/`

## Supporting agents to delegate into

- **n8n-builder** — structured workflow JSON construction
- **n8n-debugger** — execution error → root cause → patch loop
- **architect** — escalation step when self-healing fails

## Directory layout

```
<workflowRoot>/
├── _pipeline/
│   ├── validate.js      # Local schema validator (legacy; prefer `n8nctl workflow validate`)
│   └── backup.js        # Workflow export/restore helper
│   # test-gate.js retired → `n8nctl workflow verify` (exit 6 on gate fail)
├── _templates/
│   ├── orchestrator.template.json
│   ├── hub.template.json
│   ├── utility.template.json
│   └── project-bootstrap/     # Claude Code context templates
│       ├── CLAUDE.md.template
│       ├── .claudeignore.template
│       └── README.md
├── _fixtures/           # Per-workflow test payloads (build on-demand)
└── <project-name>/      # Each = its own git repo
    ├── CLAUDE.md        # Project context (from project-bootstrap template)
    ├── .claudeignore    # Project-scoped ignore (from project-bootstrap template)
    ├── workflow/
    │   └── <name>.json
    └── _backups/
        └── <name>_<timestamp>.json
```

## Project bootstrap (new project)

When creating a new n8n project folder, bootstrap Claude Code context:
```bash
PROJECT="new-project-name"
cp _templates/project-bootstrap/CLAUDE.md.template <project>/CLAUDE.md
cp _templates/project-bootstrap/.claudeignore.template <project>/.claudeignore
# Then edit CLAUDE.md → fill {{PLACEHOLDERS}}
```

See `_templates/project-bootstrap/README.md` for placeholder table.

## Safety hooks (auto-enforced — plugin `hooks/hooks.json`, or user-level `settings.json` on legacy installs)

- **`pre-n8n-secret-guard`** (PreToolUse Write|Edit|MultiEdit|NotebookEdit) — blocks hardcoded JWT / API key / token in workflow JSON and Claude config. Registered user-level under the filename `pre-write-n8n-secret.cjs`.
- **`pre-bash-n8n-prod-guard`** (PreToolUse Bash|PowerShell) — blocks mutating `n8nctl workflow update|promote|activate|delete|import|rollback` and `credential create` unless a fresh approval artifact exists (produced by the deploy/fix/promote/credentials gates). Fail-closed production write control.
- **`post-n8n-validate`** (PostToolUse Write|Edit) — warn-only `n8nctl workflow validate` after writing a workflow JSON.
- **`post-bash-n8nctl-diagnose`** (PostToolUse Bash|PowerShell) — if an n8nctl command errors → suggests `/n8n-fix`.

Hooks in files: plugin `hooks/*.cjs` (or `~/.claude/hooks/*.cjs` legacy). Errors logged to `~/.claude/hooks/logs/errors.log`.

## Default routing logic

```
if intent = "intake/yêu cầu/spec"                → /n8n-intake
if intent = "build/tạo mới"                      → /n8n-build
if intent = "review/đánh giá" + file or id       → /n8n-review
if intent = "deploy/push/update" + file given    → /n8n-deploy
if intent = "test/chạy thử/verify" + id given    → /n8n-test
if intent = "fix/sửa/debug" + id given           → /n8n-fix
if intent = "rollback/revert" + id given         → /n8n-rollback
if intent = "monitor/health/thống kê lỗi"        → /n8n-monitor
if intent = "promote/migrate" + target profile   → /n8n-promote
if intent = "credential/rotate/xoay key"         → /n8n-credentials
if intent = "docs/runbook/sơ đồ"                 → /n8n-docs
if intent unclear → ask user + show the pipeline map above
```

## Cross-skill handoffs

- `/n8n-build` success → suggest `/n8n-review` before `/n8n-deploy`.
- `/n8n-deploy` may run `/n8n-review` as an optional preflight (Step 2.5).
- `/n8n-fix` and `/n8n-deploy` STOP on credential issues → hand off to `/n8n-credentials` (they never touch credentials).
- `/n8n-monitor` routes: deterministic failure → `/n8n-fix`; credential → `/n8n-credentials`; drift → `/n8n-promote --check`.
- `/n8n-deploy` success → offer `/n8n-docs` to hand a runbook to the requester.

## Tier selection heuristic (for /n8n-build)

- **utility**: single external API call, single transform, reused by multiple workflows, max 10-15 nodes
- **hub**: domain logic combining multiple utilities, has validation + error handling, orchestrates 2-5 utilities
- **orchestrator**: routes incoming requests (webhook/schedule) to the right hub, has switching logic, thin

If the user's description fits 2 tiers, prefer the smaller one (utility > hub > orchestrator). Smaller is easier to test and reuse.
