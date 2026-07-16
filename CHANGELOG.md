# Changelog

All notable changes to n8nkit. Format follows [Keep a Changelog](https://keepachangelog.com/);
this project uses semver-ish tags on a local (no-remote) repo.

## [0.5.0] — 2026-07-16 — /n8n-cook full-cycle orchestrator

### Added
- **`n8n-cook`** — one-command orchestrator for the whole cycle: intake → build → review (blocks on
  CRITICAL + HIGH security/data-loss) → Gate 1 (confirm + side-effect inventory + artifact) →
  deploy+test via n8nctl 1.4 `workflow deploy --create-only --run --rollback-on-fail` sequencer →
  Gate 2 (separate activate confirm, marker re-emit) → fix-loop handoff (exit 6 → `/n8n-fix`) →
  docs + git commit. Default = 2 confirm gates; `--auto` = ONE blanket confirm; never zero-confirm;
  `--verify-triggers` never auto (fires a real prod webhook). Session-auth fail-closed: no session →
  stop after review; inactive-only override is labeled UNVERIFIED and locks Gate 2.
  Plan reviewed by the 3-reviewer debate bus (plan-reviewer + architect + codex; 19 findings → 12
  fixes applied, approach validated; `docs/specs/plan-n8n-cook.md`).
- test-hooks: new prod-guard assertions (cook artifact allow/deny, execution/tag/governance verbs,
  alias-bypass regressions) — total in the guard section below.

### Fixed / hardened (guard)
- `ARTIFACT_DIR_RE` accepts `n8n-cook-*` approval artifacts (else the guard would block cook itself).
- `MUTATING_RE` now covers `execution delete` (run-record deletion — was a 1.4 coverage gap that the
  plan-review bus caught) and `tag update|delete`, **plus the CLI's real aliases** `wf`/`exec`/`cred`/
  `sc` and `rm` — the guard matches command text, so an uncovered alias was a full bypass (e.g.
  `n8nctl wf update` sailed through pre-0.5.0). Also covers the n8nctl **1.5 governance verbs**
  (`user invite|delete|role`, `project create|update|delete|add-user|remove-user` — licensed, but
  the guard is instance-agnostic). test-hooks total: 62 → 73.
- `LICENSE` file added (MIT was declared in plugin.json but the file was missing — publish blocker).

### Changed — skills synced to n8nctl 1.3/1.4 (W2)
- `n8nctl` skill: reference updated to v1.4 — `workflow deploy` sequencer (with the activate-before-gate
  warning) + `workflow transfer`, `catalog sync|show|reset`, `execution delete`, `credential
  delete/transfer`, `tag update/delete`.
- `n8n-node-configuration` + `n8n-validation-expert`: document the Layer-6 validator catalog sync
  (`catalog sync` → real ~400+-node set vs bundled 36; re-run after n8n upgrades / community-node
  installs; false E062/E072 vs the snapshot → sync the catalog).
- `scripts/e2e-fix-loop.sh`: cleanup now deletes the test run's execution records too (stale "no
  execution-delete verb" caveat removed) — the instance is left as found.
- `n8n-credentials/ROTATION.md`: retire step uses `n8nctl credential delete` (UI deletion is now the
  fallback, not the requirement).
- `n8n-deploy`: documents the 1.4 sequencer as a Step 6-7 alternative (gates unchanged; never
  `--activate` through it). `n8n-monitor`: routes the "active but webhook 404" trap (#21614) to a
  sequencer redeploy with `--verify-triggers`.

## [0.4.1] — 2026-07-04 — prod-guard 1.4 surface hotfix
- `MUTATING_RE` extended for the n8nctl 1.4 mutating surface (`workflow deploy|transfer`,
  `credential delete|transfer`, `source-control pull`) + test cases (58 → 62). (Entry added
  retroactively in 0.5.0 — the fix shipped as commit `e4dd580`.)

## [0.4.0] — 2026-07-03 — Live node catalog integration

### Added
- Integrate the n8nctl 1.1 **live node catalog** with a graceful-degradation contract: `n8n-build`,
  `n8n-node-configuration`, `n8n-review`, and the `n8nctl` skill now prefer `n8nctl node describe <type>`
  (exact schema for this instance, community nodes included) and **silently fall back** to the offline
  catalog + `n8nctl workflow schema --node` when the verb is missing or session auth is unavailable — a
  build/review never fails because the live catalog is down.
- `scripts/e2e-fix-loop.sh` — failure→fix→redeploy E2E (run-by-user; needs session auth).
- test-hooks harness: `post-bash-n8nctl-diagnose` coverage + `hooks.json` manifest lint (50 → 58 assertions).

### Verified
- **P3 machine migration DONE** (plugin is the active runtime; loads only in build-workflow — see the
  enabledPlugins gotcha in NOTES-followups).
- **P5 DONE**: `GET /types/nodes.json` confirmed (868 node entries, 118 community, behind session auth);
  n8nctl `node` verbs shipped in n8nctl 1.1.0 and **installed globally**; the live catalog is active.
- **`e2e-fix-loop.sh` PASSED on prod** (n8n 1.122.5): full failure→fix→redeploy→verify loop, workflow
  auto-deleted. `e2e-prod-sample.sh` also passing. All P1–P6 work complete.

## [0.3.0] — 2026-07-02 — Full-cycle skills

### Added
- **`n8n-review`** — six-lens read-only review (correctness/security/cost/performance/error-handling/
  maintainability) with a scored artifact; the static lint folds in as the correctness lens.
- **`n8n-monitor`** — read-only instance/workflow health + execution analytics; classifies failures and
  routes to fix/credentials/promote.
- **`n8n-promote`** — cross-instance promotion + drift `--check`; thin gated layer over `n8nctl workflow
  promote` with credential-mapping review.
- **`n8n-credentials`** — the only skill that touches credentials (audit/create/rotate); Claude never
  writes secret values; hardened temp files.
- **`n8n-docs`** — runbook + mermaid + node/credential table from a redacted workflow; reads a
  `docs/spec-*.md` when present (closes the intake→docs loop).
- Bundled tier templates (`templates/`) — `n8n-template` folded to a versioned asset; `n8n-init` folded
  into the n8n-pipeline bootstrap checklist.

### Changed
- `n8n-pipeline` routes all 19 skills with an explicit cross-skill-handoff section
  (build→review→deploy, fix/deploy credential-stop→credentials, monitor→fix/credentials/promote).
- Wave order: read-only skills (review/monitor/docs) before mutating skills (promote/credentials), which
  rely on the `pre-bash-n8n-prod-guard` gate.

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

### Fixed
- **YAML frontmatter in `n8n-fix` + `n8n-pipeline`**: unquoted `description:` values contained `: `
  (colon-space), which YAML reads as a mapping — the skills would load with **empty metadata** (no
  auto-trigger, no allowed-tools). Single-quoted the values. Caught by `claude plugin validate` (latent
  since the kit was never loaded as a plugin before).

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
