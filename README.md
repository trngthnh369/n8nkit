# n8nkit

> n8n workflow engineering toolkit for Claude Code — consolidated, drift-fixed, guard-hardened.

`n8nkit` packages a battle-tested set of n8n skills, real-time guards, and n8n specialist agents into a
single coherent kit, mirroring [ClaudeKit](https://github.com/carlrannaberg/claudekit)'s design philosophy
(problem-first, YAGNI, specialist routing, artifact-gated phases, real-time guardrails) for the **n8n
domain**. It sits on top of [`@trngthnh369/n8nctl`](https://www.npmjs.com/package/@trngthnh369/n8nctl)
(the CLI backbone) and `@trngthnh369/n8n-workflow-validator`.

## What's inside

- **Lifecycle skills** (`skills/`): `n8n-intake` → `n8n-build` → `n8n-deploy` → `n8n-test` →
  `n8n-fix` → `n8n-rollback`, orchestrated/routed by `n8n-pipeline`.
- **Knowledge skills**: `n8n-workflow-patterns`, `n8n-node-configuration`, `n8n-integrations`,
  `n8n-expression-syntax`, `n8n-code-javascript`, `n8n-validation-expert`, `n8nctl`.
- **Specialist agents** (`agents/`): `n8n-builder` (greenfield JSON), `n8n-debugger` (runtime forensics + self-heal).
- **Real-time guards** (`hooks/`): secret-guard (block hardcoded provider secrets on write), validate-on-write
  (warn-only fast feedback).

## Status — MVP (Consolidate + Uplift)

This is the **MVP**: consolidate the existing 15 n8n skills + 2 agents + hooks into this repo as the single
source of truth, fix doc-drift (incl. a live `n8n-debugger` API-endpoint bug), unify the guard layer.
Installed **user-level** (copy into `~/.claude/`) — slash commands keep their familiar `/n8n-*` names.

> **Value:** coherence + doc-drift/bug fixes + unified guards + git-versioned single source.
> Honest scope note: this does **not** reduce per-session token cost (the skill descriptions still load);
> aggressive token reduction (fat-skill consolidation) is a deferred future option.

**Deferred (fast-follow / future):** `n8n-review` 6-lens command, `n8n-intake` spec-validate/decompose
uplift, marketing workflow-chain templates, a standalone CLI, and **publishing as a Claude Code plugin**
(the repo layout is already plugin-ready — see `INSTALL.md`).

## Install

See [`INSTALL.md`](./INSTALL.md). TL;DR: `pwsh scripts/install.ps1` (backs up originals, copies into
`~/.claude/`, upgrades hooks). Rollback: `pwsh scripts/rollback.ps1`.

## License

MIT
