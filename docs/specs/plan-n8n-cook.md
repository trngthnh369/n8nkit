# Plan — W1: skill `/n8n-cook` (full-cycle orchestrator)

> Nguồn yêu cầu: `docs/HANDOFF-next.md` §W1. Plugin n8nkit 0.4.1 → 0.5.0.
> Engine deploy+test: `n8nctl workflow deploy` sequencer (1.4.0 — contract verified against
> `packages/n8nctl/src/commands/workflow/deploy.ts`, cited below as `deploy.ts`).

## Goal

1 command nhận request mơ hồ → chạy trọn cycle: **intake → build → review → [gate 1] →
deploy+test (sequencer) → [gate 2] activate → (fix-loop ≤3 nếu fail) → docs + git commit**.
Không dup logic — mỗi phase GỌI skill sẵn có như sub-procedure.

## Design

### 1. File mới: `skills/n8n-cook/SKILL.md` (≤150 dòng)

**Frontmatter**:
- `name: n8n-cook`
- `description:` (single-quoted — chứa `: `) — auto-trigger EN+VN: "cook workflow", "làm workflow
  từ A đến Z", "tự động toàn bộ cycle", "full cycle n8n", "build và deploy luôn". Nêu rõ:
  production-touching, có 2 confirm gate mặc định, `--auto` = 1 confirm tổng, KHÔNG BAO GIỜ
  zero-confirm. Không auto-trigger khi user chỉ muốn 1 phase riêng lẻ (build-only, deploy-only…).
- `argument-hint: <request|spec-path> [--auto] [--project=<name>] [--activate] [--tier=...]`
- `allowed-tools: Read, Write, Edit, Bash, Glob, Grep` (siêu tập tools của các phase con)

**Pipeline (7 phases)**:

| Phase | Làm gì | Cơ chế |
|---|---|---|
| 0. Preflight | `n8nctl doctor` + `n8nctl auth status` — **PHẢI có `session` trong authMethods**. Thiếu session → **STOP mặc định** (fail-closed, xem "Session-auth rule" dưới) | Bail nếu fail |
| 1. Intake | Load skill `n8n-intake` → spec.md (hỏi clarify tiếng Việt nếu thiếu info) | Sub-procedure |
| 2. Build | Load skill `n8n-build` → JSON từ template + `n8nctl workflow validate --strict` | Sub-procedure |
| 3. Review | Load skill `n8n-review` (six-lens, scored). **Gate: dừng khi có CRITICAL hoặc HIGH security/data-loss**; HIGH khác muốn đi tiếp cần override tường minh của user, ghi vào artifact | Sub-procedure |
| 4. **Gate 1 (confirm trước deploy)** | Show: spec summary, node list, host (`n8nctl auth status`), create/update, review score, **side-effect inventory** (liệt kê node external-write + credential chúng dùng — `--run` sẽ BẮN THẬT các node này trên production; offer: chạy `--run` / skip `--run` (deploy inactive, verify tay) / fixture no-op payload), **hành động git commit cuối cycle (repo + files)**, và nếu là update: cảnh báo ⚠ update lên workflow đang ACTIVE thì thay đổi live NGAY ở Phase 5. User confirm → viết artifact markers (§3) | Confirm |
| 5. Deploy+Test | Build-new: `n8nctl workflow deploy <file> --create-only --run --rollback-on-fail --validate-policy strict --timeout 180000 --out-dir <artifactDir> [--trigger <node>] [--expect-fields ...]`. Fix-rerun/update: thay `--create-only` bằng `--id <id>` (từ deploy-report.json / xác nhận user) **và backup trước**: `n8nctl workflow backup <id> -o <projectDir>/_backups/` (sequencer KHÔNG ghi backup file — snapshot chỉ in-memory trong `--rollback-on-fail`, chỉ restore ở nhánh catch; deploy.ts:143-147). **TUYỆT ĐỐI KHÔNG truyền `--activate` ở phase này** — sequencer activate TRƯỚC verify gate (deploy.ts:177-181 chạy trước :199-218), fold vào là live-trước-khi-test | 1 lệnh n8nctl |
| 6. **Gate 2 (confirm trước activate)** | Chỉ khi user muốn active (arg `--activate` hoặc hỏi). Gate pass + confirm riêng → **re-emit `verification.json` (marker tươi, ghi desired active state + trigger plan) NGAY TRƯỚC** `n8nctl workflow activate <id>` (guard đòi marker <30'; deploy → human latency → activate dễ vượt cửa sổ). Webhook/cron: cảnh báo trigger-registration (#21614); `--verify-triggers` = **opt-in riêng, BẮN webhook thật 1 lần, KHÔNG BAO GIỜ auto-chọn kể cả trong `--auto`** — cần confirm riêng của chính nó; hoặc dùng n8n-deploy Step 8b | Confirm riêng |
| 7. Docs + Finalize | Load skill `n8n-docs` → runbook; git commit vào project repo (đúng scope đã nêu ở Gate 1, KHÔNG push); report tổng: id, state, execution id, gate result, backup path, rollback info, commit hash | Sub-procedure |

**Exit-code routing (Phase 5) — bảng này là single source of truth khi implement SKILL.md**:

| Exit | Nghĩa | Hành động |
|---|---|---|
| 0 | Deploy + run + gate PASS | → Gate 2 (nếu muốn activate) hoặc Phase 7 |
| 3 | Validation / ambiguity (trùng tên nhiều workflow; `--create-only` đụng tên đã tồn tại) | Tên-đã-tồn-tại = **tín hiệu orphan từ run trước**: check deploy-report cũ → offer `--id` resume hoặc `workflow delete` orphan (re-emit marker trước delete). Ambiguity khác → quay Phase 2 / dùng `--id` |
| 6 | Gate FAIL / run fail / trigger unregistered | `--rollback-on-fail` đã tự restore (update) / deactivate (create). Failed-create để lại workflow INACTIVE orphan — **report PHẢI in id + lệnh cleanup** (`n8nctl workflow delete <id>`); user chọn: `/n8n-fix <id>` loop (max 3, gate riêng) → pass → quay Gate 2, hoặc abort + cleanup |
| 1/2/4/5 | Infra (API/auth/network/internal) | STOP, surface error, không retry mù |

**Session-auth rule (fail-closed)**: không có session auth → mặc định cook DỪNG sau Phase 3
(build + review local xong, 0 prod write). Override tường minh duy nhất: user yêu cầu "deploy
inactive không test" → Phase 5 chạy KHÔNG `--run` (lưu ý: lúc này `--rollback-on-fail` vô nghĩa —
không còn bước post-write nào có thể throw; deploy.ts rollback nằm trong catch), **Gate 2 bị KHÓA**
(không bao giờ activate workflow chưa test), report + commit message đánh dấu **UNVERIFIED**,
và phải có session + chạy lại test gate trước mọi activate sau này.

**Autonomy model** (theo handoff):
- **Default**: 2 confirm gates (Phase 4 trước deploy, Phase 6 trước activate).
- **`--auto`**: 1 confirm tổng duy nhất sau Phase 3 (show đủ nội dung Gate 1: spec + node list +
  host + review score + side-effect inventory + git-commit scope + có activate hay không) → chạy
  thẳng Phase 5-7 không hỏi thêm. Activate chỉ nằm trong auto-run nếu `--activate` truyền TƯỜNG MINH.
  **Ngoại lệ không gộp được vào confirm tổng**: `--verify-triggers` (bắn webhook prod thật) luôn cần
  confirm riêng — không bao giờ auto.
- KHÔNG BAO GIỜ zero-confirm. `--auto` không có confirm = vẫn dừng chờ 1 confirm tổng.
- Cook KHÔNG đụng credentials — thiếu/hỏng credential → STOP, hand off `/n8n-credentials` (như
  n8n-deploy/n8n-fix). Nhiều session song song cùng host: cảnh báo như task-system, không lock.

### 2. Sửa guard: `hooks/pre-bash-n8n-prod-guard.cjs`

1. `ARTIFACT_DIR_RE`: thêm `cook` → `^n8n-(?:deploy|fix|promote|credentials|rollback|cook)-`.
2. `MUTATING_RE`: thêm `n8nctl execution delete` + `n8nctl tag (?:update|delete)` — hiện KHÔNG
   được guard (kiểm chứng line 26), trái rule gotcha #5 của handoff ("verb mutating mới → update
   MUTATING_RE + test"). Lưu ý coordination W2: e2e-fix-loop cleanup bằng `execution delete` sẽ
   cần artifact tươi khi gọi trực tiếp qua tool Bash (script nội bộ không bị ảnh hưởng — hook chỉ
   match command string).
3. Đồng bộ comment + message "Run the matching skill gate first (…)" thêm `/n8n-cook`.

### 3. Artifact gate: `.claude/artifacts/n8n-cook-<slug>/`

`<slug>` = tên workflow kebab-case, **ASCII transliteration** (bỏ dấu tiếng Việt) để match
`ARTIFACT_DIR_RE` + an toàn path.

Viết NGAY SAU confirm (Gate 1, hoặc confirm tổng ở `--auto`) và TRƯỚC lệnh `workflow deploy`:
- `context-snippets.json` (marker guard): spec summary, node list, host, create/update, review
  score, side-effect inventory đã ack
- `verification.json` (marker guard): test plan (`--run` + trigger node + expect-fields),
  rollback plan (`--rollback-on-fail` semantics + backup path nếu update + `/n8n-rollback <id>`)
- `spec.md` (copy/path từ intake), `review.json` (từ n8n-review), `deploy-report.json`
  (sequencer tự viết qua `--out-dir`)

**Per-action freshness**: marker chỉ authorize hành động trong 30' — **re-emit `verification.json`**
tại Gate 2 (trước `activate`), và trước mọi lệnh cleanup (`workflow delete`, `execution delete`)
trong E2E. Cửa sổ 30' hết giữa chừng → guard chặn → re-confirm (đúng thiết kế, không workaround).

### 4. Routing: `skills/n8n-pipeline/SKILL.md`

- Pipeline map: thêm row `Full cycle tự động | /n8n-cook <request> [--auto] | 2 gates; --auto = 1 confirm tổng`
- Default routing: `if intent = "full cycle/từ A đến Z/cook/tự động toàn bộ" → /n8n-cook` (đặt TRÊN
  các intent đơn lẻ — cook thắng khi user muốn trọn gói)
- Cross-skill handoffs: cook gọi intake/build/review/docs; fail test → `/n8n-fix`; credential issue
  → `/n8n-credentials`; cook dùng sequencer thay chuỗi deploy Step 6-9

### 5. Đồng bộ phụ

- `plugin.json` 0.4.1 → **0.5.0** + `CHANGELOG.md` entry
- README/codebase-summary: "19 skills" → "20 skills" (grep xác nhận chỗ nào claim số lượng)
- `scripts/test-hooks.cjs`: case **cook-artifact fresh → mutating verb allowed** + case
  **cook artifact absent → blocked** + case **`execution delete` / `tag update` bị chặn khi không
  artifact, qua khi artifact tươi** (MUTATING_RE mới)
- `pwsh scripts/verify-plugin.ps1` — chạy lại; nếu có hardcoded skill count → update

## Thứ tự implement

1. Guard (ARTIFACT_DIR_RE + MUTATING_RE) + test-hooks cases → `node scripts/test-hooks.cjs` pass
2. `skills/n8n-cook/SKILL.md` (bảng exit-code = nguồn routing duy nhất, prose tối thiểu)
3. n8n-pipeline routing + README/docs count
4. `claude plugin validate .` + `pwsh scripts/verify-plugin.ps1`
5. Bump 0.5.0 + CHANGELOG + commit (commit repo n8nkit — xin confirm user như mọi commit)
6. Reinstall dance (gotcha #1-2): `claude plugin marketplace update n8nkit-marketplace` →
   uninstall → install → **xóa key `n8nkit` khỏi user-scope enabledPlugins** → verify
   build-workflow load skill (headless `claude -p` — bước này headless ĐƯỢC vì chỉ list skills)
7. E2E prod ping-level (**interactive** — Gate 1 cần confirm thật, không chạy headless): cook 1
   workflow đơn giản (schedule-trigger + no-op, KHÔNG external-write node), `--create-only`,
   create INACTIVE, **KHÔNG activate** (handoff pre-authorize mức này; nhánh webhook-activate +
   `--verify-triggers` NGOÀI scope E2E) → verify deploy-report.json + execution pass + workflow
   `active:false` → cleanup: re-emit marker → `n8nctl workflow delete <id>` + `n8nctl execution
   delete <execId>` → báo cáo đầy đủ

## Risks / mitigations

- **Guard chặn chính cook**: fixed §2 + test case — làm ĐẦU TIÊN
- **Name-collision với workflow prod**: `--create-only` NẰM TRONG lệnh Phase 5 canonical (không chỉ
  prose); không có nó sequencer match-by-name và **update thầm** workflow trùng tên
  (deploy.ts:116-134); ambiguity nhiều tên trùng → CLI tự refuse (exit 3, đòi `--id`)
- **Update path mất backup**: sequencer không ghi backup file → cook bắt buộc `workflow backup`
  trước mọi deploy `--id` (xem Phase 5)
- **`--run` timeout**: default 120000ms — cook set `--timeout 180000` mặc định, tăng khi workflow
  chậm hợp lệ (timeout → rollback oan)
- **YAML frontmatter `description` chứa `: `** → single-quote (gotcha #3)
- **enabledPlugins sticky-false** → bước 6 xóa key sau install (gotcha #1)
- **Skill >150 dòng**: ép ngắn bằng reference skill con + bảng exit-code thay prose

## Acceptance (từ handoff + revised)

- `claude plugin validate .` pass
- `node scripts/test-hooks.cjs` pass kèm case cook-artifact + case MUTATING_RE mới (execution/tag)
- 1 lần chạy thật trên prod ping-level (create INACTIVE qua `--create-only`, **assert
  `active:false` sau Phase 5**, không activate, cleanup có re-emit marker)
- bump → reinstall → verify build-workflow load skill

## Review Log

### Round 1 — debate (2026-07-11; bus 3-reviewer: plan-reviewer + architect + codex gpt-5.5 xhigh)

| ID | Sev | Finding | Route | Decision | Action |
|---|---|---|---|---|---|
| agent-r1-f01 | HIGH | `--create-only` chỉ ở prose + update path mất backup | auto_accept (dup codex-r1-f04) | accepted_fixed | `--create-only`/`--id` vào lệnh Phase 5 canonical; `workflow backup` bắt buộc trước deploy `--id` |
| codex-r1-f03 | HIGH | Gate 2 không có artifact tươi riêng (30' window tự chặn activate/cleanup) | auto_accept (dup agent-r1-f02) | accepted_fixed | Per-action freshness: re-emit `verification.json` tại Gate 2 + trước cleanup |
| codex-r1-f05 | HIGH | Degrade no-session mâu thuẫn + mất cả gate lẫn rollback | auto_accept (dup agent-r1-f03, arch-r1-f03) | accepted_fixed | Session-auth rule fail-closed; override = inactive-only, Gate 2 KHÓA, label UNVERIFIED |
| arch-r1-f01 | HIGH | `--auto` có thể auto-bắn `--verify-triggers` (webhook prod thật) | auto_accept (dup agent-r1-f05) | accepted_fixed | `--verify-triggers` opt-in riêng, không bao giờ auto; ngoài scope E2E |
| codex-r1-f01 | CRIT→HIGH | `execution delete` không nằm trong MUTATING_RE + plan misstatement | debate dt-r1-01 (1x, merged) | accepted_fixed | Extend MUTATING_RE (execution delete + tag update/delete) + tests + sửa câu sai + note W2 |
| codex-r1-f06 | HIGH→MED | `--run` side effects không bound | debate dt-r1-02 (1x, merged) | accepted_fixed | Side-effect inventory + ack tại Gate 1; option skip `--run`/fixture; không sandbox |
| agent-r1-f04 | MED | Không bao giờ fold `--activate` vào Phase 5 (sequencer activate TRƯỚC gate) | auto_accept (dup codex-r1-f02, premise codex đã sửa: deploy.ts:178 không auto-activate) | accepted_fixed | Rule tường minh + acceptance assert `active:false` + cảnh báo update-on-ACTIVE |
| arch-r1-f02 | MED | Orphan workflow khi chết giữa create và deploy-report | auto_accept (dup agent-r1-f06; judge sửa cơ chế: `--create-only` fail loudly = tín hiệu orphan) | accepted_fixed | Exit-3 branch: check deploy-report cũ, offer `--id` resume / delete orphan; report in id + cleanup |
| codex-r1-f07 | MED | Git commit thiếu confirm tường minh | v1_evaluate | accepted_fixed | Commit scope (repo + files) nêu trong Gate 1 / confirm tổng |
| codex-r1-f08 | MED | Review gate chỉ chặn CRITICAL | v1_evaluate | accepted_fixed | Chặn CRIT + HIGH security/data-loss; HIGH khác cần override ghi artifact |
| agent-r1-f07 | LOW | E2E step 7 không chạy headless được | v1_evaluate | accepted_fixed | Note: step 7 interactive, chỉ step 6 headless |
| arch-r1-f04 | LOW | 150-dòng cap vs routing fidelity | v1_evaluate | accepted_fixed | Bảng exit-code = nguồn routing duy nhất |

**Approach-challenge**: architect KEEP + codex KEEP → ✅ **approach validated** (0 escalation). Alternative script-orchestrator tự bác (switch_cost high, mất giá trị vì cook cần interactive gates).
**Extras adopted**: `--timeout 180000` note · credential handoff → `/n8n-credentials` · concurrency note · ASCII slug transliteration.
**Verdict Round 1**: 12 accepted (19 findings gộp 12 cluster) / 0 rejected / 0 escalated. Exit: **converged**.

Bus-verify: xem `~/.claude/artifacts/plan-review/20260710-050624-n8n-cook-39fz/verify.json`.
