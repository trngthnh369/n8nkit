# Installing n8nkit

## MVP — user-level install (current)

n8nkit installs into your `~/.claude/` directory. Skills keep their `/n8n-*` names (no namespacing), so
auto-trigger and slash invocation work exactly as before — you just get the consolidated, drift-fixed,
guard-hardened versions.

### Steps (automated)

```powershell
# From the repo root (D:\Projects\personal\n8nkit)
pwsh scripts/install.ps1
```

`install.ps1` performs, in order:

1. **Backup** — file-copies your current `~/.claude/skills/n8n-*`, `~/.claude/agents/n8n-*`, the two n8n
   hooks, and `settings.json` into `~/.claude/backups/n8nkit-premigration-<date>/` (this dir is **outside**
   the skill-scan path, so backups never load as skills).
2. **Copy** — copies `skills/*` and `agents/*` from the repo into `~/.claude/` (overwrites same-named
   originals; the backup is your rollback).
3. **Hooks** — upgrades the secret-guard in place and adds `post-n8n-validate`; registers the new hook in
   `settings.json` via **safe JSON parsing** (never regex), keeping `settings.json.bak`.
4. **Verify** — prompts you to confirm the kit loads and guards fire in a **fresh `claude` session**
   (`scripts/verify-liveness.ps1`) **before** you discard the backup.

### Rollback

```powershell
pwsh scripts/rollback.ps1
```

Restores skills/agents/hooks and `settings.json` from `~/.claude/backups/n8nkit-premigration-<date>/`.

### Dependency

n8nkit's guards use `@trngthnh369/n8n-workflow-validator`. `install.ps1` ensures it is resolvable
(globally installed or vendored); a missing validator makes the validate-on-write guard **warn loudly**,
never silently pass.

## Future — Claude Code plugin (deferred)

The repo is already laid out as a plugin (`.claude-plugin/plugin.json`, `skills/`, `agents/`, `hooks/`,
`marketplace.json`). When portability/sharing is needed:

```
/plugin marketplace add turti369/n8nkit
/plugin install n8nkit
```

Note: plugin install namespaces commands to `/n8nkit:n8n-build` etc. (auto-trigger still works by
description). Plugin hooks must use `${CLAUDE_PLUGIN_ROOT}` in command paths. These costs are why the MVP
ships user-level instead.
