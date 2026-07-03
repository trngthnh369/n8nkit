# n8nkit — follow-ups & recommendations

State after the 0.3.0 upgrade (2026-07-02). The kit is a Claude Code **plugin** (0.1.0 → 0.3.0):
19 skills, 4-hook guard layer, migration tooling. Pre-plugin backup: `~/.claude/backups/n8nkit-premigration-2026-06-30/`.

## Remaining work (user-gated or separate release train)

### P3 — machine migration → DONE (2026-07-03), verified
Plugin installed (0.3.0), migrated, and **empirically verified**: a fresh `claude` process in
`build-workflow` loads exactly the 19 skills (as `n8nkit:n8n-*`); any other project loads NONE.
verify-plugin.ps1 = 33/33. Migration backup: `~/.claude/backups/n8nkit-plugin-migration-2026-07-03`.

**⚠️ enabledPlugins gotcha (cost 1 debug cycle — non-obvious, upstream bug #27247/#25086):**
A user-scope `enabledPlugins: { X: false }` is **STICKY** — a project/local-scope `true` does NOT override
it (despite the documented Local > Project > User precedence). Empirically proven:
- user `false` + project `true` → build-workflow loads **NONE**.
- user key **absent** + project/local `true` → build-workflow loads all 19, other projects load NONE. ✓
**Correct per-project config**: do NOT run `claude plugin disable -s user` (it writes the sticky `false`).
Instead leave the plugin **absent** from `~/.claude/settings.json` enabledPlugins (default = off), and set
`enabledPlugins: { "n8nkit@n8nkit-marketplace": true }` in the project's `.claude/settings.local.json`
(local scope — personal, git-safe; NOT settings.json which git can pick up). R4 answered: skills surface
**namespaced** (`n8nkit:n8n-build`); auto-trigger by description still fires; cross-skill prose using bare
`/n8n-*` still resolves via the Skill tool by name.

### P5 — n8nctl `node` live-catalog verbs (cross-repo: `D:\Projects\personal\n8nctl`, target 1.1.0)
Gated on **A1**: verify the node-catalog endpoint on live n8n 1.122.5 with a session cookie —
`GET $N8N_HOST/types/nodes.json` (editor static asset, full descriptions incl. community nodes) or
`/rest/node-types`. Record which works + its shape **before** writing code. Then add
`n8nctl node list|describe|search` (cache keyed by host **and n8n version**, 24h TTL, `--refresh`). n8nkit
side: a one-line probe (`n8nctl node --help` exit 0 = available) with silent fallback to the offline catalog
(`n8n-node-configuration`) + `n8nctl workflow schema --node`. n8nkit works fully without this — it is an
enhancement, not a dependency. Do NOT adopt n8n-mcp (deliberate — the live instance is the source of truth).

### P6.2 — run the failure→fix E2E
`scripts/e2e-fix-loop.sh` is authored + syntax-clean. Run it (needs `n8nctl auth login --session`) to prove
the fix-loop primitives against prod. Leaves a temp workflow deleted on exit; a few benign execution records remain.

## Personal user-level scripts (NOT bundled by the plugin)

`~/.claude/scripts/n8n_session.py` and `set-n8n-key.ps1` predate n8nkit and are **not referenced by any kit
skill** (verified by grep) — they stay as personal scripts. `n8n-backup-manifest.js` **is** now bundled at
`shared/n8n-backup-manifest.js`.

## Token lever (honest)

Per-project plugin enable removes the always-on cost (skills load only in enabled projects). A further lever
is **fat-skill consolidation** (collapse ~19 atomic skills into ~5 capability skills) — a larger, riskier
refactor, deferred.

## Recommendations OUTSIDE this repo (separate change)

- **`@trngthnh369/n8n-workflow-validator` doc drift** (n8nctl repo): README says "6-layer / 21-node"; the
  code is **7-layer / 36-node** / **18** secret patterns. Update that repo's docs.
- **User global-config doc-accuracy** (personal instruction files, left untouched): `~/.claude/CLAUDE.md`
  says "3 PreToolUse hooks" (there are more); `n8n-trigger-autonomy.md` still asserts webhook/cron stay dead
  after API update — disproven (2026-06-09 POC). Durable truth: "Public API has no execute endpoint → use
  `workflow run` (session `/rest`)."
- **GitHub publish**: `plugin.json`/`marketplace.json` point at `github.com/trngthnh369/n8nkit` which has no
  remote yet. Push before any public `/plugin marketplace add trngthnh369/n8nkit`.

## Resolved in 0.1.1–0.3.0 (was deferred/known-issue)

- Guard path-coupling → **fixed**: guards are config-driven (`resolveWorkflowRoot`), legacy `build-workflow`
  kept only as a fallback.
- `n8n-review` → **shipped** (0.3.0). Plugin publish → **done** (0.2.0). Secret patterns triplication,
  phantom hook refs, n8n-mcp legacy content, self-containment → all fixed. Production write gate → enforced
  deterministically by `pre-bash-n8n-prod-guard`.
- Still open: `n8n-intake` spec-uplift (validate/decompose), marketing chain templates — only if a real need appears.
