# n8nkit

> n8n workflow engineering toolkit for Claude Code — full-cycle lifecycle skills, real-time guards, and n8n specialist agents, shipped as a plugin.

`n8nkit` packages a battle-tested set of n8n skills, real-time guards, and n8n specialist agents into a
single coherent kit, mirroring [ClaudeKit](https://github.com/carlrannaberg/claudekit)'s design philosophy
(problem-first, YAGNI, specialist routing, artifact-gated phases, real-time guardrails) for the **n8n
domain**. It sits on top of [`@trngthnh369/n8nctl`](https://www.npmjs.com/package/@trngthnh369/n8nctl)
(the CLI backbone, v1.0) and `@trngthnh369/n8n-workflow-validator`.

## What's inside

- **Lifecycle skills** (`skills/`): `n8n-intake` → `n8n-build` → `n8n-review` → `n8n-deploy` → `n8n-test`
  → `n8n-fix` → `n8n-rollback`, plus ops skills `n8n-monitor`, `n8n-promote`, `n8n-credentials`,
  `n8n-docs` — all routed by `n8n-pipeline`. *(review/monitor/promote/credentials/docs ship in 0.3.0 —
  see CHANGELOG.)*
- **Knowledge skills**: `n8n-workflow-patterns`, `n8n-node-configuration`, `n8n-integrations`,
  `n8n-expression-syntax`, `n8n-code-javascript`, `n8n-validation-expert`, `n8nctl`.
- **Specialist agents** (`agents/`): `n8n-builder` (greenfield JSON), `n8n-debugger` (runtime forensics + self-heal).
- **Guard layer** (`hooks/` + `hooks.json`), four deterministic hooks:
  - `pre-n8n-secret-guard` — block hardcoded provider secrets on Write/Edit/MultiEdit/NotebookEdit.
  - `pre-bash-n8n-prod-guard` — fail-closed gate: mutating `n8nctl` verbs need a fresh skill-produced approval artifact.
  - `post-n8n-validate` — warn-only `n8nctl workflow validate` after writing a workflow JSON.
  - `post-bash-n8nctl-diagnose` — suggest `/n8n-fix` when an `n8nctl` command errors.
- **Shared** (`shared/`): `n8n-backup-manifest.js` (structured backups). **Config** (`.n8nkit/config.json`)
  with a JSON schema; guards + skills read `workflowRoot` from it instead of hardcoding paths.

## Distribution — Claude Code plugin

Shipped as a plugin so the ~19 skills load **only in projects where you enable it** (solves the
per-session token cost, and makes the repo the single source of truth — no copy-install drift). See
[`INSTALL.md`](./INSTALL.md).

```
/plugin marketplace add D:\Projects\personal\n8nkit
/plugin install n8nkit@n8nkit-marketplace
```

Enable per-project via `enabledPlugins` in the project's `.claude/settings.json`. Skills work by
auto-trigger (`/n8n-build`) and via the namespaced form (`/n8nkit:n8n-build`).

Migrating from the pre-0.2 copy-install: `pwsh scripts/migrate-to-plugin.ps1` (see INSTALL.md).

## Invocation

| Phase | Command |
|---|---|
| Requirements → spec | `/n8n-intake <request>` |
| Build workflow JSON | `/n8n-build <description>` |
| Review before deploy | `/n8n-review <file-or-id>` |
| Deploy to production | `/n8n-deploy <file>` |
| Run + verify | `/n8n-test <workflowId>` |
| Self-heal a failure | `/n8n-fix <workflowId>` |
| Revert | `/n8n-rollback <workflowId>` |
| Health + analytics | `/n8n-monitor [workflowId]` |
| Promote / drift-check | `/n8n-promote <id> --to <profile>` |
| Credential lifecycle | `/n8n-credentials <audit\|create\|rotate>` |
| Generate runbook | `/n8n-docs <file-or-id>` |

## License

MIT
