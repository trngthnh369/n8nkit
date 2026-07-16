---
name: n8n-cook
description: 'Full-cycle n8n workflow orchestrator — one command runs intake → build → review → deploy+test → (optional) activate → fix-loop → docs against PRODUCTION, chaining the dedicated n8nkit skills and the n8nctl `workflow deploy` sequencer. Auto-triggers on "cook workflow", "làm workflow từ A đến Z", "tự động toàn bộ cycle", "full cycle n8n", "build và deploy luôn". Production-touching: 2 mandatory confirm gates by default (pre-deploy, pre-activate); `--auto` collapses them into ONE blanket confirm after review — NEVER zero-confirm. Do NOT auto-trigger when the user wants a single phase only (build-only → n8n-build, deploy-only → n8n-deploy, etc.). Also invokable as `/n8n-cook <request>`.'
argument-hint: <request|spec-path> [--auto] [--project=<name>] [--activate] [--tier=orchestrator|hub|utility]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# n8n Cook — Full-Cycle Orchestrator

> `<workflowRoot>` từ `.n8nkit/config.json` (default `D:/Projects/work/build-workflow`). Đây là
> PRODUCTION. Cook KHÔNG dup logic — mỗi phase LOAD skill chuyên trách rồi làm theo procedure của nó.

## Arguments
`$ARGUMENTS`

## Autonomy model
- **Default**: 2 confirm gates — Gate 1 (trước deploy), Gate 2 (trước activate).
- **`--auto`**: 1 confirm tổng DUY NHẤT sau Phase 3, show đủ nội dung Gate 1 (bên dưới) + có activate
  hay không → rồi chạy thẳng không hỏi thêm. Activate chỉ nằm trong auto-run nếu user truyền
  `--activate` TƯỜNG MINH. **KHÔNG BAO GIỜ zero-confirm.**
- **`--verify-triggers` KHÔNG BAO GIỜ auto** — bắn webhook production thật 1 lần → luôn cần confirm
  riêng của chính nó, kể cả trong `--auto`.
- Cook KHÔNG đụng credentials: thiếu/hỏng credential → STOP, hand off `/n8n-credentials`.
- Session khác đang chạy cùng host (task-system cảnh báo) → nêu 1 dòng, không lock.

## Pipeline

### Phase 0 — Preflight (fail-closed)
```bash
n8nctl doctor          # bail nếu FAIL
n8nctl auth status     # PHẢI có "session" trong authMethods (cần cho --run test gate)
```
**Session-auth rule**: không có session → mặc định cook DỪNG sau Phase 3 (0 prod write), hướng dẫn
`n8nctl auth login --session --cookie-only`. Override duy nhất (user yêu cầu tường minh "deploy
inactive không test"): Phase 5 chạy KHÔNG `--run` — lúc đó `--rollback-on-fail` vô nghĩa (không còn
post-write step nào throw), **Gate 2 bị KHÓA** (không bao giờ activate workflow chưa test), report
+ commit message đánh dấu **UNVERIFIED**.

### Phase 1 — Intake
Load skill `n8n-intake` → `spec.md` (clarify tiếng Việt nếu thiếu info). Input đã là spec-path → skip.

### Phase 2 — Build
Load skill `n8n-build` → JSON từ template + `n8nctl workflow validate <file> --strict` pass.

### Phase 3 — Review (gate)
Load skill `n8n-review` (six-lens, scored). **Dừng khi có CRITICAL hoặc HIGH security/data-loss.**
HIGH khác muốn đi tiếp → cần override tường minh của user, ghi vào artifact. Sửa build → re-review.

### Phase 4 — Gate 1: confirm trước deploy (MANDATORY)
Show user:
- Spec summary + node list + tier; create hay update; review score
- Host target (`n8nctl auth status`)
- **Side-effect inventory**: liệt kê node external-write (HTTP/Sheets/email/Meta/CRM…) + credential
  chúng reference — `--run` sẽ BẮN THẬT các node này trên production. Offer: (a) chạy `--run` như
  kế hoạch / (b) skip `--run` (deploy inactive, verify tay — report thành UNVERIFIED) / (c) fixture
  no-op payload mà workflow filter bỏ.
- **Git commit cuối cycle**: repo + files sẽ commit (Phase 7) — confirm này bao luôn hành động đó.
- Update path: ⚠ workflow đang ACTIVE thì thay đổi live NGAY khi Phase 5 chạy (update không deactivate).

User confirm rõ ràng (yes/có — không nhận "ừ") → **viết artifact** `.claude/artifacts/n8n-cook-<slug>/`
(`<slug>` = tên workflow kebab-case ASCII, bỏ dấu):
- `context-snippets.json`: spec summary, node list, host, create/update, review score, side-effect ack
- `verification.json`: test plan (`--run`, trigger node, expect-fields), rollback plan (backup path
  nếu update, `--rollback-on-fail` semantics, `/n8n-rollback <id>`)
- copy `spec.md`, `review.json`. (Guard đòi marker <30' — hết cửa sổ giữa chừng → re-confirm, đúng thiết kế.)

### Phase 5 — Deploy + Test (1 lệnh sequencer — KHÔNG hand-chain update/activate/run)
```bash
# Build-new (mặc định):
n8nctl workflow deploy <file> --create-only --run --rollback-on-fail \
  --validate-policy strict --timeout 180000 --out-dir <artifactDir> \
  [--trigger "<non-webhook trigger node>"] [--expect-fields a,b,c]

# Fix-rerun / update có chủ đích: backup TRƯỚC rồi thay --create-only bằng --id
n8nctl workflow backup <id> -o <projectDir>/_backups/     # sequencer KHÔNG ghi backup file
n8nctl workflow deploy <file> --id <id> --run --rollback-on-fail --validate-policy strict --timeout 180000 --out-dir <artifactDir>
```
**TUYỆT ĐỐI KHÔNG truyền `--activate` ở phase này** — sequencer activate TRƯỚC verify gate; fold vào
là workflow live trước khi được test. Sau phase này workflow phải `active:false` (create path).

**Exit-code routing (single source of truth):**

| Exit | Nghĩa | Hành động |
|---|---|---|
| 0 | Deploy + run + gate PASS | → Gate 2 (nếu muốn active) hoặc Phase 7 |
| 3 | Validation / ambiguity. `--create-only` đụng tên đã tồn tại = **tín hiệu orphan run trước** | Check `deploy-report.json` cũ → offer `--id` resume hoặc xóa orphan (re-emit marker trước `workflow delete`). Ambiguity khác → sửa build / dùng `--id` |
| 6 | Gate FAIL / run fail | `--rollback-on-fail` đã restore (update) / deactivate (create). Failed-create để lại orphan INACTIVE — **report PHẢI in id + lệnh cleanup**. User chọn: `/n8n-fix <id>` (max 3, gate riêng) → pass → quay Gate 2; hoặc abort + cleanup |
| 1/2/4/5 | Infra (API/auth/network/internal) | STOP, surface error, KHÔNG retry mù |

### Phase 6 — Gate 2: confirm trước activate (riêng biệt, chỉ khi user muốn active)
1. Confirm riêng: "Test gate pass. Activate lên production traffic? (y/n)"
2. **Re-emit `verification.json`** (marker tươi: desired active state + trigger plan) NGAY TRƯỚC:
3. `n8nctl workflow activate <id>`
4. Webhook/cron: cảnh báo trigger-registration (#21614). `--verify-triggers` = opt-in confirm riêng
   (bắn webhook thật); hoặc side-effect-safe verify theo n8n-deploy Step 8b.

### Phase 7 — Docs + Finalize
1. Load skill `n8n-docs` → runbook vào `<projectDir>/docs/`.
2. Git commit đúng scope đã confirm ở Gate 1 (`feat(n8n): cook <name>` / UNVERIFIED nếu degrade). KHÔNG push.
3. Report: workflow id + name + active state (verified hay DB-only), execution id + gate result,
   backup path, orphan/cleanup nếu có, commit hash, next steps.

## Rules
- Production host — không skip Phase 0/2-validate/Gate 1. Không nhận confirm mơ hồ.
- n8nctl exit ≠ 0 = hành động KHÔNG xảy ra. Không nói dối state.
- Fail giữa chừng: sequencer tự rollback; ngoài sequencer → `n8nctl workflow restore <backup>` / `/n8n-rollback <id>`.
- Auto-trigger mơ hồ (user có thể chỉ muốn 1 phase) → hỏi trước khi bắt đầu cycle.
