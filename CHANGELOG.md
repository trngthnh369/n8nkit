# Changelog

All notable changes to n8nkit. Format follows [Keep a Changelog](https://keepachangelog.com/);
this project uses semver-ish tags on a local (no-remote) repo.

## [Unreleased]

- P3 machine migration (operational), P4 new skills (n8n-review/monitor/promote/credentials/docs),
  P5 n8nctl `node` live-catalog verbs, P6 failure→fix E2E.

## [0.2.0] — 2026-07-02 — Plugin era

### Added
- **Claude Code plugin distribution.** `hooks/hooks.json` wires all four guards via
  `${CLAUDE_PLUGIN_ROOT}`; `plugin.json` bumped to 0.2.0 with a `hooks` entry. Per-project enable removes
  the always-on token cost and makes the repo the single source of truth.
- **`pre-bash-n8n-prod-guard`** — fail-closed production-write gate (PreToolUse Bash|PowerShell): mutating
  `n8nctl` verbs (`workflow update|promote|activate|delete|import|rollback`, `credential create`) require a
  fresh (<30 min) skill-produced approval artifact, else exit 2. `--dry-run`/read verbs pass. Also blocks
  shell-writes of provider secrets into workflow JSON. Escape hatch `N8NKIT_PROD_GUARD=off`.
- **`shared/n8n-backup-manifest.js`** bundled (n8n-fix called it but the kit never shipped it).
- **`scripts/migrate-to-plugin.ps1`**, **`rollback-plugin-migration.ps1`**, **`verify-plugin.ps1`**.
- **`.n8nkit/config.schema.json`** (fixes the dangling `$schema`).

### Changed
- Guards are **config-driven** (`resolveWorkflowRoot`: env → ancestor `.n8nkit/config.json` → payload cwd)
  instead of keying off the literal `build-workflow` path segment. Changing `workflowRoot` no longer
  silently disables them.
- Secret guard now scans **MultiEdit `edits[]`** and NotebookEdit (previously unscanned) and is registered
  for `Write|Edit|MultiEdit|NotebookEdit`.
- Skills use `<workflowRoot>` (read from config) instead of hardcoded `D:/Projects/work/build-workflow`;
  n8n-fix resolves the backup helper as `<pluginRoot>/shared/…` with graceful degradation; `architect`/
  `journal-writer` agents are optional.
- README/INSTALL rewritten for the plugin era.

### Removed
- Legacy `hooks/pre-write-n8n-secret.cjs` (superseded by `pre-n8n-secret-guard`; install.ps1 already
  copies the v2 guard over that filename).

## [0.1.1] — 2026-07-02 — Defect-fix pass

### Added
- Mandatory production write gate + approval artifact in `n8n-fix` (closes the safety asymmetry vs
  deploy/rollback).
- fallback⊆json sync test + config-driven workflowRoot tests in the guard harness (8 → 41 assertions).

### Fixed
- Single-source secret patterns (mapping test for the combined GitHub/Stripe fallbacks).
- Phantom hook reference (`pre-bash-n8n-deploy-validate`) and `commands/n8n-review.md` doc-drift.
- Validation-profile vocabulary drift (`minimal/runtime/strict/ai-friendly` → real `dev/ci/strict`).
- Purged all n8n-mcp legacy content from the 5 knowledge skills' reference files (0 gate-token hits).
- Documented n8nctl 1.0 verbs + behavioral contracts (redaction default-on, exit codes).

## [0.1.0] — 2026-06-30 — MVP (Consolidate + Uplift)

- Consolidated 15 → 14 n8n skills + 2 agents + unified crash-safe guard layer; install/rollback/verify +
  E2E (passing) tooling. User-level copy-install.
