# CLAUDE.md — n8nkit

> n8n workflow engineering toolkit cho Claude Code, đóng gói dạng plugin. Thông tin chung (profile/security/conventions) ở global `~/.claude/CLAUDE.md`.

## Docs (cohesion layer)
Trước task multi-file: Read `docs/codebase-summary.md`.
Theo phase: plan→`docs/system-architecture.md` · implement/review→`docs/code-standards.md` · brainstorm→`docs/project-overview.md`.
Docs stale so với code → nói rõ, đề xuất `/docs-update`.

## Project-specific
- KHÔNG npm project — Claude Code plugin (`.claude-plugin/`), phân phối `/plugin install`.
- Execution thật đi qua `n8nctl` CLI (dự án chị em `D:\Projects\personal\n8nctl`), không gọi n8n REST trực tiếp.
- Guard hooks fail-closed cho production-mutating ops (bypassPermissions compensating control). KHÔNG MCP.
