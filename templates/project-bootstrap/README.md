# Project Bootstrap Template

Template files cho khởi tạo n8n project mới trong `D:/Projects/work/build-workflow/`.

## Cách dùng

### Option 1: Manual copy
```bash
cd D:/Projects/work/build-workflow/<new-project>/
cp ../_templates/project-bootstrap/CLAUDE.md.template ./CLAUDE.md
cp ../_templates/project-bootstrap/.claudeignore.template ./.claudeignore
# Edit CLAUDE.md → replace {{PLACEHOLDERS}} with real values
```

### Option 2: Via Claude Code
Ask Claude: *"Bootstrap project claude config cho `<project-name>`"* — Claude sẽ:
1. Copy templates
2. Rename file
3. Fill placeholders từ context
4. Stage for review

## Files

| File | Purpose |
|------|---------|
| `CLAUDE.md.template` | Project-specific Claude context (tier, workflows, dependencies, conventions) |
| `.claudeignore.template` | Scope Claude tool access — skip `_backups/`, `.env`, large dumps |

## Placeholders in CLAUDE.md.template

| Placeholder | Example value |
|-------------|---------------|
| `{{PROJECT_NAME}}` | `AI KPI Manager` |
| `{{PROJECT_PURPOSE}}` | `Sync KPI data from Google Sheets to Meta Ads` |
| `{{OWNER}}` | `Trường Thịnh (it01@emallvietnam.vn)` |
| `{{WORKFLOW_NAME}}` | `kpi-daily-sync-v2` |
| `{{PURPOSE}}` | `Daily sync at 8am` |
| `{{LIST}}` | `Meta Graph v19.0, Google Sheets API v4` |
| `{{ERROR_WORKFLOW_ID}}` | `abc123-workflow-id` |

## When to bootstrap

**Do**: When creating new n8n project folder under `build-workflow/`

**Skip**:
- Existing projects (already have CLAUDE.md? don't overwrite)
- Archive projects (`_archive_*/`)
- Shared utilities (`_pipeline/`, `_templates/`, `_fixtures/`)

## Related

- Global ECC profile: `~/.claude/CLAUDE.md`
- Global ignore: `~/.claude/.claudeignore`
- Project conventions: see `D:/Projects/work/build-workflow/CLAUDE.md` (if exists at monorepo root)
