# HANDOFF — n8nkit next: /n8n-cook → catalog-sync integration → publish

> Prompt handoff cho session mới (2026-07-03). Đọc file này TRƯỚC khi làm gì. Thứ tự: W1 → W2 → W3.

## Bối cảnh 30 giây

- **n8nkit** (`D:\Projects\personal\n8nkit`) = Claude Code plugin **0.4.1**, runtime chính thức, enable
  CHỈ ở `D:\Projects\work\build-workflow` (qua `.claude/settings.local.json`). 19 skills full-cycle
  (intake→build→review→deploy→test→fix→rollback + monitor/promote/credentials/docs), 4 guard hooks,
  62/62 hook tests, 2 E2E prod PASS. Lịch sử: `CHANGELOG.md` + `docs/NOTES-followups.md`.
- **n8nctl** (`D:\Projects\personal\n8nctl`) = **1.4.0** (global đã cài). ⚠️ Repo này đang được các
  session song song phát triển nhanh — `git log` trước khi đụng. Mới có (1.2→1.4): `workflow deploy`
  (one-shot sequencer: normalize→validate→create-or-update→activate→`--run`+verify gate,
  `--rollback-on-fail`, `--out-dir`), `catalog sync|show|reset`, `execution delete`, `credential
  delete/transfer`, `tag update/delete`, `workflow transfer`, docs-as-code (`docs/COMMANDS.md` generated).
- Guard `pre-bash-n8n-prod-guard` vừa vá (0.4.1) để cover các verb mutating 1.4 kể trên.
- Đã có xác nhận thực chiến: session ở build-workflow bị guard chặn `n8nctl` write → tự load
  `n8nkit:n8n-deploy` gate. Hệ thống hoạt động đúng thiết kế.

## W1 — `/n8n-cook`: orchestrator tự động cả cycle (làm TRƯỚC)

**Mục tiêu**: 1 command nhận request mơ hồ → chạy trọn: intake → build → review → deploy → test →
(fix-loop ≤3 nếu fail) → docs. Đây là mảnh cuối của mục tiêu gốc "agent thực hiện đầy đủ cycle n8n".

Thiết kế đề xuất (được phép chỉnh khi plan):
1. Skill mới `skills/n8n-cook/SKILL.md` (≤150 dòng + refs). KHÔNG dup logic — mỗi phase GỌI skill sẵn có
   (`n8n-intake`, `n8n-build`, `n8n-review`, `n8n-docs`) như sub-procedure; phần deploy+test dùng
   **`n8nctl workflow deploy <file> --run --rollback-on-fail --out-dir <artifact>`** (sequencer 1.4 làm
   hết normalize→validate→create-or-update→activate→run→verify, đừng hand-chain update/activate/run).
2. **Autonomy model** (ClaudeKit): default = confirm gate ở 2 điểm (trước deploy, trước activate);
   `--auto` = 1 confirm tổng duy nhất sau plan (show spec + node list + host); KHÔNG BAO GIỜ auto
   không-flag. Fail ở test → chuyển `/n8n-fix` loop (có gate riêng của nó).
3. **Artifact gate**: `.claude/artifacts/n8n-cook-<slug>/` (spec, build path, review.json, deploy log).
   ⚠️ **BẮT BUỘC**: prod-guard `ARTIFACT_DIR_RE` hiện chỉ nhận `^n8n-(deploy|fix|promote|credentials|rollback)-`
   — phải THÊM `cook` vào regex (`hooks/pre-bash-n8n-prod-guard.cjs`) + case trong `scripts/test-hooks.cjs`,
   nếu không mọi lệnh mutating của cook sẽ bị chính guard của mình chặn.
4. Routing: thêm vào `n8n-pipeline` map + Default routing + Cross-skill handoffs; auto-trigger EN+VN
   ("làm workflow từ A đến Z", "tự động toàn bộ", "cook workflow"...).
5. Plan trước khi code — plan non-trivial → chạy `/plan-review` (bus 3-reviewer) trước khi implement.

**Acceptance**: `claude plugin validate .` pass; `node scripts/test-hooks.cjs` pass (kèm case cook-artifact);
1 lần chạy thật trên prod với workflow ping-level (create INACTIVE, không activate thật nếu user không confirm);
bump plugin → reinstall → verify build-workflow load (xem Gotchas #1-2).

## W2 — Đồng bộ n8nkit skills với n8nctl 1.3/1.4 (bao gồm catalog sync)

Phía CLI của "self-syncing catalog" ĐÃ XONG (`catalog sync` sinh validator catalog từ live instance,
~400+ nodes thay vì snapshot 36). Việc còn lại là n8nkit đuổi kịp:
1. `n8n-node-configuration` + `n8n-validation-expert` + `n8nctl` skill: document `catalog sync|show|reset`
   (cần session auth); khuyến nghị chạy sau mỗi lần upgrade n8n / cài community node.
2. **Quét claim stale** (grep toàn skills/): "no execution-delete verb" (giờ CÓ — sửa
   `scripts/e2e-fix-loop.sh` để cleanup execution records + bỏ caveat "benign records remain");
   "Retire old credential — UI deletion (no CLI delete)" trong `n8n-credentials/ROTATION.md` (giờ có
   `n8nctl credential delete`); n8n-deploy có thể mention sequencer `workflow deploy` như 1-lệnh thay
   thế cho chuỗi Step 6-9 (giữ gate/confirm của skill).
3. Cân nhắc: `n8n-monitor` route drift → giờ `workflow deploy --verify-triggers` bắt được trap
   "active nhưng webhook 404".

## W3 — Publish (n8nctl → npm, n8nkit → GitHub)

1. **n8nctl trước** (n8nkit phụ thuộc nó): `npm publish` `@trngthnh369/n8nctl` (repo có `prepack` build;
   check `npm whoami`, LICENSE file, `files` trong package.json). Coordinate với các session song song —
   publish từ commit đã ổn định, đủ test.
2. **n8nkit**: tạo repo GitHub `trngthnh369/n8nkit` (URLs trong plugin.json/marketplace.json đã trỏ sẵn),
   secret-scan history trước khi push (`git log -p | grep` các pattern hoặc gitleaks), check LICENSE file
   tồn tại (declared MIT), push, rồi test `/plugin marketplace add trngthnh369/n8nkit` từ máy khác/dir khác.
3. ⚠️ **Mọi push/publish = external action → HỎI USER trước khi chạy.**

## Gotchas (xương máu — đọc kỹ, mỗi cái đã tốn 1 vòng debug)

1. **enabledPlugins sticky-false (bug upstream #27247)**: user-scope `false` CHẶN project override.
   Config đúng: key **VẮNG MẶT** ở `~/.claude/settings.json`, chỉ `true` trong
   `build-workflow/.claude/settings.local.json`. **MỌI lần `claude plugin install` tự thêm lại
   user-scope `true` → phải xóa key đó sau MỖI reinstall** (node one-liner delete key).
2. **Local marketplace cache theo version**: sửa repo → bump `plugin.json` version →
   `claude plugin marketplace update n8nkit-marketplace` → `uninstall` + `install` → xóa user-scope key.
3. `claude plugin validate .` TRƯỚC mỗi install — YAML frontmatter `description:` chứa `: ` phải
   single-quote (đã dính 2 lần).
4. Live catalog / `catalog sync` / `workflow run` cần **session auth** (`n8nctl auth login --session
   --cookie-only`); API key bị 401 trên `/types/nodes.json`.
5. **prod-guard**: verb mutating cần artifact tươi <30' trong `.claude/artifacts/n8n-<skill>-*/`
   (theo payload cwd, walk-up 10 cấp). Khi n8nctl thêm verb mutating mới → update `MUTATING_RE` + test.
6. Skills surface **namespaced** `n8nkit:n8n-*`; auto-trigger theo description vẫn chạy. Verify headless:
   `cd build-workflow && claude -p "list Skills containing n8n ..."`.
7. Sau mọi thay đổi hooks/scripts: `node scripts/test-hooks.cjs` (62 assertions) và nếu đụng plugin
   layout: `pwsh scripts/verify-plugin.ps1` (33 checks).
8. n8nctl repo có session khác đang làm — `git log --oneline -5` + `git status` trước khi edit; đừng
   assume CHANGELOG của mình là mới nhất.
