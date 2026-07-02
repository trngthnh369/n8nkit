# n8nkit — follow-ups & recommendations

State after MVP (Consolidate + Uplift), 2026-06-30. The kit is installed user-level at `~/.claude/`
(backup: `~/.claude/backups/n8nkit-premigration-2026-06-30/`).

## Personal user-level scripts (NOT bundled by the plugin)

`~/.claude/scripts/n8n_session.py` and `set-n8n-key.ps1` predate n8nkit and are **not referenced by any
kit skill** (verified by grep) — they stay as the user's personal scripts, not shipped by the plugin.
The `n8n-backup-manifest.js` helper (called by n8n-fix) **is** now bundled at `shared/n8n-backup-manifest.js`.

## Deferred (fast-follow — intentionally out of MVP per plan-review)

- **`n8n-review`** — 6-lens workflow review (correctness · security/credentials · cost · performance ·
  error-handling/retry · maintainability). **Superseded** — shipping as `skills/n8n-review/` in 0.3.0
  (per-project plugin enable removes the always-on token concern that motivated the /command form). See
  CHANGELOG. Static lint folds in as the correctness lens's entry check.
- **`n8n-intake` spec-uplift** — add a problem-first **validate** step (completeness/clarity/over-engineering/
  feasibility scoring) + **decompose** into MVP→Enhanced→Polish phases (≙ tier). Mirrors ClaudeKit
  `spec:create→validate→decompose`. Do after the consolidation has burned in.
- **Marketing workflow-chain templates** (content/campaign/growth/AI-content) — only if a real chaining
  need appears; the user's prod workflows are already marketing, so avoid inventing duplicates.
- **Publish as Claude Code plugin** — repo is already plugin-ready (`.claude-plugin/plugin.json`,
  `marketplace.json`). Switch install to `/plugin install` when portability/sharing is actually needed.
  Note the costs that made MVP user-level: command namespacing (`/n8nkit:n8n-build`), plugin hooks must use
  `${CLAUDE_PLUGIN_ROOT}`, agent-name override, and `build-workflow/` path coupling.

## Token note (honest)

Consolidating 15→14 skills did **not** reduce per-session token load — the skill descriptions still load.
The real token lever is **fat-skill consolidation** (collapse 14 atomic skills into ~4-5 capability skills:
intake / build+review / deploy / debug+admin). That is a larger, riskier refactor — a future option, not MVP.

## Recommendations OUTSIDE this repo (not bundled — separate change)

- **`@trngthnh369/n8n-workflow-validator` doc drift** (in the `n8nctl` repo, not here): README/package say
  "6-layer / 21-node"; the code is **7-layer / 36-node** with **18** secret patterns. Update that repo's docs.
- **User global-config doc-accuracy** (only if desired — these are personal instruction files, left untouched):
  - `~/.claude/CLAUDE.md` says "3 PreToolUse hooks" — there are 5.
  - `~/.claude/rules/conditional/n8n-trigger-autonomy.md` still asserts "after `n8nctl workflow update`,
    webhook stays 404 / cron won't fire" — **disproven** (2026-06-09 POC: webhook + cron DO register via API
    activate on single-main n8n 1.122.5). The durable truth is just "Public API has no execute endpoint →
    use `workflow run` (session `/rest`)."

## Guard scope limitation (known)

The secret-guard + validate-on-write hooks scope by the literal path segment `build-workflow`. If
`workflowRoot` in `.n8nkit/config.json` is changed to a path NOT containing `build-workflow`, the guards
won't fire there. Acceptable for this machine; revisit if the workflow home moves.
