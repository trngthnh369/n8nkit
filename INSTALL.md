# Installing n8nkit

n8nkit is distributed as a **Claude Code plugin**. Enabling it per-project means its ~20 skills load
only where you need them (no always-on token cost), and the repo stays the single source of truth.

## Install (plugin)

In a Claude Code session:

```
/plugin marketplace add D:\Projects\personal\n8nkit
/plugin install n8nkit@n8nkit-marketplace
```

This registers a **local marketplace** pointing at the repo and installs the plugin into
`~/.claude/plugins/cache/…/n8nkit/<version>/`. The plugin's `hooks/hooks.json` wires the four guards via
`${CLAUDE_PLUGIN_ROOT}`.

## Enable per-project

Install-then-enable is deliberate: install once, enable only in n8n projects.

- User-level `~/.claude/settings.json` — keep it installed but **off** everywhere by default:
  ```json
  { "enabledPlugins": { "n8nkit@n8nkit-marketplace": false } }
  ```
- Project `.claude/settings.json` (e.g. your `build-workflow` project) — **on**:
  ```json
  { "enabledPlugins": { "n8nkit@n8nkit-marketplace": true } }
  ```

Also drop a `.n8nkit/config.json` at the project root (copy `.n8nkit/config.json` from this repo and set
`workflowRoot`) so the config-driven guards scope correctly. `migrate-to-plugin.ps1` does this for you.

Skills surface both as auto-trigger `/n8n-build` and namespaced `/n8nkit:n8n-build`.

## Migrating from the pre-0.2 copy-install

Earlier versions copied skills into `~/.claude/skills/` (or a project's `.claude/skills/`). To move to the
plugin:

```powershell
# after /plugin install above:
pwsh scripts/migrate-to-plugin.ps1        # -WhatIf to preview
```

It backs up and removes the 14 project skill copies + the 2 user-level agents, deregisters the
`post-n8n-validate` and `post-bash-n8nctl-diagnose` hooks from `~/.claude/settings.json` (the plugin fires
them), and **keeps** the user-level `pre-write-n8n-secret` registration (a negative-tested compensating
control for permission-bypass mode — the duplicate block with the plugin guard is idempotent).

> After migration, `post-n8n-validate` and `post-bash-n8nctl-diagnose` become **project-scoped** — they
> fire only in plugin-enabled projects (by design). The secret guard stays global.

## Verify

In a **fresh** session in a plugin-enabled project:

```powershell
pwsh scripts/verify-plugin.ps1    # cache version, skill frontmatter, live-fire all 4 hooks, settings state
node scripts/test-hooks.cjs       # guard unit harness
```

## Updating the plugin

Local-path marketplaces cache a copy **per version**, so editing the repo does not update the installed
plugin. Bump `version` in `.claude-plugin/plugin.json`, then:

```
/plugin marketplace update n8nkit-marketplace
/plugin install n8nkit@n8nkit-marketplace     # reinstall the new version
```

`verify-plugin.ps1` asserts the expected version to catch a stale cache.

## Rollback

```powershell
pwsh scripts/rollback-plugin-migration.ps1     # restore the copy-install layout from backup
# to fully revert: /plugin uninstall n8nkit@n8nkit-marketplace
```

## Legacy user-level install (deprecated)

`pwsh scripts/install.ps1` still performs the old copy-into-`~/.claude/` install and remains as a fallback.
Prefer the plugin path above.

## Dependency

n8nkit's guards + skills use `@trngthnh369/n8nctl` (v1.0) and `@trngthnh369/n8n-workflow-validator`. A
missing `n8nctl` makes the validate-on-write guard **warn loudly**, never silently pass.
