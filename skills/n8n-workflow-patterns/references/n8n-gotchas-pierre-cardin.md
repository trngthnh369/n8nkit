# n8n / Google Sheets gotchas - Pierre Cardin VN (field notes)

> Consolidated 2026-09-12 from per-project Claude memory (build-workflow, ai-training-tracker, ai-honeys-fb-poster) - 31 facts that were duplicated across 3 silos (18 on 2026-09-12 pass 1, 13 more on pass 2).
> Each section keeps the original memory body (Vietnamese, with **Why** / **How to apply**). Load on demand when building or debugging n8n + Sheets workflows.
> Source of truth is THIS file now; the old memory files are archived under each silo's memory/archive/2026-09/.

## Index

- [feedback_n8n_run_verb_fires_production](#feedback-n8n-run-verb-fires-production) - `n8nctl workflow run` fire production NGAY, không có --dry-run; đừng dùng để probe auth
- [feedback_n8n_sheets_ratelimit_cascade](#feedback-n8n-sheets-ratelimit-cascade) - Parallel n8n sub-workflows ghi Google Sheets đồng loạt → 60-write/min quota → cascade fail
- [feedback_sheets_vn_timestamp_format](#feedback-sheets-vn-timestamp-format) - Google Sheets ghi timestamp ở format VN HH:mm:ss D/M/YYYY khi auto-fill — string compare với ISO sẽ fail, phải parse với Luxon
- [feedback_n8n_gsheets_header_corruption](#feedback-n8n-gsheets-header-corruption) - n8n Google Sheets node dùng header row làm JSON key. Header corrupt = silent skip toàn bộ data.
- [feedback_n8n_orphan_workflow_dispatches](#feedback-n8n-orphan-workflow-dispatches) - Khi delete một orphan workflow trong n8n, schedule trigger có thể vẫn fire một lần nữa và sub-workflows vẫn nhận execution với parentExecuti
- [feedback_n8npc_instance_save_only](#feedback-n8npc-instance-save-only) - n8npc.khoahrv.id.vn — CHỐT 2026-08-13 (n8nctl v1.5.0): `n8nctl workflow activate <id>` ĐÃ register cron/schedule vào routing layer, cron tự 
- [feedback_n8n_sheets_v45_schema_required](#feedback-n8n-sheets-v45-schema-required) - n8n googleSheets typeVersion 4.5 với operation append/appendOrUpdate BẮT BUỘC có columns.schema[] đầy đủ tất cả field; thiếu schema → execut
- [feedback_n8n_sheet_bool_config_falsy](#feedback-n8n-sheet-bool-config-falsy) - n8n Code node đọc boolean config (\"true\"/\"false\") từ Google Sheets → ra BOOLEAN không phải string; parse `String(v || '')` biến false→''
- [feedback_n8n_executeonce_truncates_input](#feedback-n8n-executeonce-truncates-input) - executeOnce cắt $input còn 1 item — expression đếm $input.all() trong node đó sẽ ghi 1 thay vì N; phải trỏ sang $('Node').all()
- [feedback_n8n_empty_read_skips_chain](#feedback-n8n-empty-read-skips-chain) - n8n node với 0 input item bị SKIP → 1 read trả 0 row (vd sheet rỗng) làm gãy toàn bộ chain downstream; fix alwaysOutputData=true
- [feedback_n8n_chained_read_multiplies](#feedback-n8n-chained-read-multiplies) - n8n chạy node 1 lần/input item → googleSheets read nối sau node nhiều rows chạy N lần → burst Sheets 429
- [feedback_n8n_appendorupdate_wipes_human_status](#feedback-n8n-appendorupdate-wipes-human-status) - n8n appendOrUpdate trên tab human-gated mà Build luôn set status mặc định → re-run GHI ĐÈ trạng thái người duyệt (confirmed→pending); fix bằ
- [feedback_n8n_sheets_sa_mode_list_bug](#feedback-n8n-sheets-sa-mode-list-bug) - n8n Google Sheets node với Service Account auth fail runtime nếu documentId/sheetName dùng mode \"list\" — cần mode \"id\"/\"name\".
- [feedback_n8n_sheets_readallrows_invalid](#feedback-n8n-sheets-readallrows-invalid) - n8n googleSheets v4.5 KHÔNG support operation \"readAllRows\" — dùng \"read\" với options={}.
- [feedback_n8n_execution_log_save](#feedback-n8n-execution-log-save) - Khi tạo workflow n8n mới PHẢI set settings.saveDataSuccessExecution='all' + saveDataErrorExecution='all' + saveExecutionProgress=True/False 
- [feedback_n8n_cron_uses_workflow_timezone](#feedback-n8n-cron-uses-workflow-timezone) - n8n scheduleTrigger cronExpression chạy theo settings.timezone của workflow, KHÔNG phải UTC — set giờ UTC là sai lệch 7h.
- [feedback_n8n_cred_placeholder_silent_fail](#feedback-n8n-cred-placeholder-silent-fail) - n8n chấp nhận credential ID là literal \"REPLACE_WITH_YOUR_CREDENTIAL_ID\" (template placeholder) — workflow active nhưng silent-fail mọi cr
- [feedback_sa_drive_no_quota](#feedback-sa-drive-no-quota) - SA `n8n-bot` 0 Drive quota → mọi upload 403. Workaround đã verify 2026-04-21 - dùng n8n credential OAuth2 user `QTCDjfnubZJpCDoJ` (name "Goo
- [feedback_n8nctl_update_strips_fields](#feedback-n8nctl-update-strips-fields) - n8nctl workflow update gửi extra fields gây 400; bypass bằng curl PUT với chỉ name+nodes+connections+settings
- [feedback_n8n_code_multibranch_bug](#feedback-n8n-code-multibranch-bug) - n8n Code node $() access fails khi node có nhiều input connections từ branches parallel. Phải dùng sequential chain hoặc Merge node.
- [feedback_n8n_cron_manual_race](#feedback-n8n-cron-manual-race) - Khi manual n8nctl workflow run fire trong cùng cron window, anti-concurrency guard 90s không đủ (pipeline ~4 min) → workflow pick next pendi
- [feedback_n8n_googleapi_http_scope](#feedback-n8n-googleapi-http-scope) - Cách gọi raw Google API (Sheets batchUpdate...) từ n8n bằng Service Account credential trong HTTP Request node + scope gotcha
- [feedback_n8n_node_id_must_be_random_uuid](#feedback-n8n-node-id-must-be-random-uuid) - 
- [feedback_n8n_no_require_luxon](#feedback-n8n-no-require-luxon) - n8n self-hosted ở $N8N_HOST không cho `require('luxon')` trong Code node. Dùng global `DateTime` trực tiếp (n8n inject sẵn).
- [feedback_n8n_sheets_trigger_needs_oauth2](#feedback-n8n-sheets-trigger-needs-oauth2) - n8n Google Sheets Trigger node yêu cầu OAuth2, KHÔNG hoạt động với Service Account
- [feedback_google_sheet_formatting_convention](#feedback-google-sheet-formatting-convention) - Standard formatting cho mọi Google Sheet dùng trong n8n workflows — font JetBrains Mono 10, header bold+center, tab name lowercase snake_cas
- [feedback_n8n_ghost_executions](#feedback-n8n-ghost-executions) - n8n queue mode đôi lúc tạo ghost executions (status=running nhưng 0 nodes fire) block worker queue
- [feedback_n8n_webhook_no_register_via_api](#feedback-n8n-webhook-no-register-via-api) - Trên instance $N8N_HOST, workflow tạo hoặc update qua n8nctl/REST API không tự động register webhook URL — request POST /webhook/* trả 404 d
- [reference_n8n_internal_rest_run](#reference-n8n-internal-rest-run) - Autonomous trigger pattern cho n8n self-hosted khi webhook router stuck — login /rest/login cookie → POST /rest/workflows/{id}/run với workf
- [feedback_ifd_mail_gateway_link_rewrite](#feedback-ifd-mail-gateway-link-rewrite) - Mail gateway mail.ifd.vn (SMTP it02@ifd.vn) rewrite mọi <a href> link → subdomain tracking url####.ifd.vn bị NXDOMAIN → link chết. Dùng plai
- [feedback_self_challenge_workflow_design](#feedback-self-challenge-workflow-design) - Khi user yêu cầu build n8n workflow mới, PROACTIVELY tự challenge approach ban đầu với 3 câu hỏi (flaws, edge cases, alternative patterns) t

## feedback_n8n_run_verb_fires_production

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_`n8nctl workflow run` fire production NGAY, không có --dry-run; đừng dùng để probe auth_

`n8nctl workflow run <id> --trigger "<node>"` **thực thi workflow trên production ngay lập tức**. KHÔNG có `--dry-run`. `--timeout` chỉ giới hạn thời gian *poll* của `--wait`, KHÔNG hủy execution. Bỏ `--wait` cũng không ngăn nó chạy — chỉ là không chờ.

**Why:** 2026-07-09 mình chạy `n8nctl workflow run hMOE5pwuaYpSKxl2 --timeout 5000` với ý định "probe xem có session auth chưa", nghĩ nó sẽ fail auth vô hại. Nó fire thật AI Product Manager. Kịp `/stop` sau 2m13s nhưng execution đã qua Sub-4 + Sub-5 (44 SKU × LLM, ~$15-20) và ghi 44 row vào 2 tab Sheet. Cancel còn để lại ghost execution + 3 node cuối dở dang (hooks_matrix, audit_log, email) phải backfill tay.

**How to apply:**
- Kiểm tra session auth bằng `n8nctl auth status` hoặc `n8nctl doctor` — KHÔNG bao giờ bằng `workflow run`.
- Trước khi `run` bất kỳ workflow production nào: backup tab Sheet đích, và soi các nhánh có side-effect (Sheets append, email, API ghi).
- Với workflow tốn tiền (LLM/ảnh): xác nhận với user TRƯỚC, vì cancel giữa chừng KHÔNG hoàn tiền và để lại state nửa vời.
- Prod-guard hook chặn `workflow update`/`deploy` nhưng **KHÔNG chặn `workflow run`** — đừng nhầm "không bị chặn" là "an toàn".

Related: [[feedback_n8n_ghost_executions]] · [[project_ai_product_manager]] · [[feedback_ai_pm_llm_failure_silent]]


## feedback_n8n_sheets_ratelimit_cascade

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Parallel n8n sub-workflows ghi Google Sheets đồng loạt → 60-write/min quota → cascade fail_

Khi nhiều n8n sub-workflows chạy song song và mỗi cái ghi Google Sheets, dễ vượt **Google Sheets API 60 writes/min/user** quota → lỗi "The service is receiving too many requests from you".

**Why:** Mỗi topic trong AI SEO Manager = 3 sheet writes (scorer Log Score + sub-writer Update Topic + Log Success). ~33 sub-writers concurrent → >75 writes/min → quota exceeded. Nếu node ghi sheet KHÔNG có `onError`, lỗi này làm fail cả execution → cascade lên parent workflow → topics stuck PROCESSING.

**How to apply:**
- Audit/logging sheet writes PHẢI có `onError: continueRegularOutput` — logging chỉ là audit, không được block pipeline
- State-critical writes (Update Topic status) giữ blocking nhưng tăng retry: `maxTries: 5, waitBetweenTries: 8000`
- Throttle parallel dispatch: ít concurrent sub-writers hơn = peak write rate thấp hơn (batch delay 30s thay vì 12s)
- Đặt safety cap `max_articles_per_run` (vd 50) để giới hạn concurrent load
- n8n `scheduleTrigger` với `triggerAtHour` + `field: hours` KHÔNG hoạt động đúng — fire mỗi giờ. Dùng `field: cronExpression` với `expression: "0 1,6 * * *"` để fire chính xác.

Verified 2026-05-13 trong AI SEO Manager — xem [[project_pierre_cardin_sea_ecosystem]].


## feedback_sheets_vn_timestamp_format

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Google Sheets ghi timestamp ở format VN HH:mm:ss D/M/YYYY khi auto-fill — string compare với ISO sẽ fail, phải parse với Luxon_

Khi append `new Date()` hoặc `DateTime.now()` qua n8n Google Sheets node mà cột format là Date-time VN locale, value lưu là `HH:mm:ss D/M/YYYY` (ví dụ `13:36:03 12/3/2026`), KHÔNG phải ISO 8601.

**Why:** String comparison như `'13:36:03 12/3/2026' >= '2026-04-20T...'` luôn FALSE vì so theo lexicographic order (giờ `1` < năm `2`). Bug này silent — filter trả 0 mà không error. Verified 2026-05-18 exec 22054 (Pipeline A digital workflow) — past topics filter `p['Timestamp'] >= cutoff` cut hết 3746 rows.

**How to apply:** Khi đọc cột Timestamp từ Sheets trong Code node, ALWAYS parse với Luxon trước khi compare:

```js
const parseVnTs = (s) => {
  if (!s) return 0;
  const str = String(s);
  let dt = DateTime.fromFormat(str, 'HH:mm:ss d/M/yyyy', { zone: 'Asia/Ho_Chi_Minh' });
  if (dt.isValid) return dt.toMillis();
  dt = DateTime.fromFormat(str, 'HH:mm:ss dd/MM/yyyy', { zone: 'Asia/Ho_Chi_Minh' });
  if (dt.isValid) return dt.toMillis();
  dt = DateTime.fromISO(str, { zone: 'Asia/Ho_Chi_Minh' });
  if (dt.isValid) return dt.toMillis();
  return 0;
};

// compare via millis, not string
.filter(p => parseVnTs(p['Timestamp']) >= cutoffMs)
```

Còn liên quan [[n8n-no-require-luxon]] (dùng global DateTime, không require).

Alternative: tại điểm WRITE, dùng `now.toISO()` để cột chứa ISO ngay từ đầu — cleaner nhưng cần migrate dữ liệu cũ.


## feedback_n8n_gsheets_header_corruption

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n Google Sheets node dùng header row làm JSON key. Header corrupt = silent skip toàn bộ data._

n8n `googleSheets` node read operation map mỗi row thành object với key = giá trị của header row. Nếu header bị corrupt (vd typo, single char), code logic dùng `item.json.topic` (hoặc field name khác) sẽ thấy `undefined` cho TẤT CẢ rows mà KHÔNG có error — silent skip.

**Triệu chứng**: Filter/Classify Code node báo `pending_total: 0` mặc dù sheet RÕ RÀNG có nhiều PENDING. Sub-workflow không fire. Không có error, không có log.

**Why**: Lỗi này cực khó debug vì:
- n8n node không validate header values
- Code node nhận được `item.json` với key sai → access trả undefined → field check `!input.topic` = true → skip
- Không có exception, không có warning

**How to apply:**
- Khi Filter/Classify báo 0 items dù sheet có data → CHECK HEADER ROW NGAY (`t.row_values(1)`)
- Đặt header row làm READ-ONLY trong Google Sheets (Data > Protect range) hoặc thường xuyên audit
- Code node defensive: log raw `Object.keys(item.json)` khi pending_total=0 để phát hiện header drift sớm
- Đừng dùng `t.update('A1', ...)` (single cell) khi có thể truyền nhầm value — luôn dùng `t.update('A1:N1', [full_header])` để override toàn header

Phát hiện trong AI SEO Manager 2026-05-15: column A header bị set thành `'s'` thay vì `'topic'`, làm Filter & Classify skip toàn bộ 112 PENDING → trông như workflow đã clear backlog nhưng thực ra không xử lý gì. Xem [[feedback_n8n_sheets_ratelimit_cascade]].


## feedback_n8n_orphan_workflow_dispatches

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Khi delete một orphan workflow trong n8n, schedule trigger có thể vẫn fire một lần nữa và sub-workflows vẫn nhận execution với parentExecution.workflowId trỏ về workflow đã xóa_

Sự kiện: 2026-05-08, AI Content Manager `XwLAIYOnKAr2AAFY` cron Publish AM (10h VN) tạo 7 sub-execs của Publisher Sub `wQyzm1XyqiG5KCjm` thay vì 4 expected. Inspect runData → orchestrator chỉ dispatch 3 calls. Inspect parentExecution của từng Publisher exec → 4 execs trỏ về workflow `nUpvJkp3IOkGKZpI` (workflow KHÔNG còn trong list, đã bị xóa).

**Why**: n8n register cron schedule trong scheduler database tách biệt với workflow body. Khi delete một workflow active có schedule, scheduler có thể vẫn fire 1 cycle nữa nếu chưa unregister → orphan execution với parentExecution trỏ về ID đã xóa. Sub-workflows được gọi như bình thường vì chỉ dùng workflowId trong executeWorkflow node, không check parent còn alive không.

**Hậu quả thực tế**: 2 orchestrator (real + orphan) cùng dispatch parallel → race trên claim mechanism + quá tải Sheets API (60 read/min/user) → Update Claim/Update Queue fail 429 → state inconsistency (FB posted nhưng log không lưu, queue stuck ở processing-*). Claim mechanism vẫn chống được FB duplicate cho hầu hết case (Re-Read after 2s wait), nhưng quota là chỗ break. Posts tạo bởi orphan dùng credentials khác → PAT hiện tại không delete được qua Graph API (error #10), phải xóa tay qua FB Pages Manager.

**How to apply**:
- Khi debug "vì sao có nhiều sub-execs hơn expected": parse `parentExecution.workflowId` qua REST `/executions/:id?includeData=true` → so sánh với active workflows. Nếu trỏ về workflow không tồn tại → orphan.
- Sau khi xóa orphan, verify cron tiếp theo chỉ tạo đúng số sub-execs expected (không có race).
- Khi design claim mechanism, **assume parallel dispatch** có thể xảy ra do orphan: tăng wait sau Update Claim (2s không đủ với Sheets API latency + race), hoặc add idempotency key dựa trên (brand, scheduled_date, slot) thay vì row_number.
- Khi design Sheets-heavy workflows, watch quota 60 read/min — nếu mỗi sub-call dùng 5-7 ops và có thể có 2× dispatch song song, cần cache hoặc reduce call.


## feedback_n8npc_instance_save_only

<!-- source: D--Projects-work-build-workflow mtime 2026-08-13 -->
_n8npc.khoahrv.id.vn — CHỐT 2026-08-13 (n8nctl v1.5.0): `n8nctl workflow activate <id>` ĐÃ register cron/schedule vào routing layer, cron tự fire, KHÔNG cần UI Save. Chỉ còn WEBHOOK INBOUND external có thể cần UI Save/restart khi router stuck (chưa re-test). Lịch sử behavior cũ (v0.x update không register) + race trap UI cache = ở body._

n8n instance `n8npc.khoahrv.id.vn` (queue mode hoặc separate webhook process). Trigger registration behavior:

- `n8nctl workflow update <id>` → ghi DB OK, KHÔNG register webhook/cron vào routing layer → webhook 404, cron không fire
- `n8nctl workflow refresh <id>` (deactivate→activate) → CŨNG không register, dù DB nói active
- **Chỉ UI Save** (Ctrl+S trong n8n UI) hoặc restart n8n process mới register triggers

**Race trap (verified 2026-06-09)**: 
- Sequence "tôi update v2 → user Save UI" → UI Save ghi đè v1 (cache UI) lên instance → mất fix
- Đúng quy trình khi cần re-Save sau API update: user **REFRESH UI page (F5)** trước → UI load latest từ instance → Save → register triggers với version mới

**How to apply**: với mọi workflow trên instance này, sau khi `n8nctl workflow update`:
1. Bảo user F5 page trong UI (rất quan trọng — không skip)
2. Bảo user Click Save  
3. Lúc đó webhook/cron register, version giữ nguyên patch
4. Trigger qua n8nctl webhook hoặc đợi cron

**Bổ sung 2026-06-09**: Khi 1 workflow bị **push nhiều lần liên tiếp** trong ngắn hạn (5-10 lần/ngày), router state của RIÊNG workflow đó bị stuck — UI Save + deactivate/activate + đổi webhook path đều không register. Verified: 18 workflow khác trên cùng instance vẫn fire cron/webhook bình thường, chỉ wf bị "abused" bị câm. Router self-heal sau n8n process restart (overnight). Quy tắc: **không push >3 lần/wf/ngày**; nếu cần debug nhiều, dùng Python E2E harness mirror logic thay vì push n8n liên tục.

## 2026-06-10 — n8nctl v0.5.0 `workflow run` GIẢI QUYẾT (firing, không cần UI Save)

n8nctl **v0.5.0** đã có verb `workflow run` dùng internal `/rest/workflows/{id}/run` (session cookie auth) — **bypass HOÀN TOÀN router/registry**. Đây là port chính thức của `n8n_session.py` vào CLI. Nên **cho việc FIRE/TEST workflow, không còn cần UI Save**:

```bash
# Setup 1 lần (cookie + password vào keyring, gắn active profile)
N8N_EMAIL='<user>' N8N_PASSWORD='<pwd>' n8nctl auth login --session
# Fire (auto-né webhook trigger; chọn Schedule/Manual)
n8nctl workflow run <id> --trigger "Schedule Trigger" --wait --timeout 480000
```
- executionId trả NGAY, `--wait` poll `/rest/executions` tới terminal → pass/fail (exit 1 nếu fail).
- Body schema chuẩn `{workflowData, triggerToStartFrom}` (no runData). Live-verified.

**Ranh giới còn lại** (UI Save vẫn cần cho):
- **Webhook INBOUND thật** từ ngoài (POST `/webhook/<path>` bởi hệ thống khác) khi router stuck → vẫn 404 tới khi UI Save / restart. Nhưng đây là traffic production, KHÔNG phải việc Claude fire/test.
- Cron PRODUCTION tự fire đúng giờ khi router stuck → nếu cần, OS-level scheduler (Task Scheduler) gọi `n8nctl workflow run <id>` thay vì dựa n8n cron.

→ Quy tắc cập nhật: với firing/E2E test, **dùng `n8nctl workflow run`** thay Python harness. Phần "push >3 lần/wf/ngày → router stuck" vẫn đúng cho webhook external, nhưng `workflow run` không bị ảnh hưởng (bypass router).

## 2026-06-19 — CRON registration QUA n8nctl activate ĐÃ WORK (n8nctl v1.0.0)

**Verified empirically 2026-06-19**: tạo workflow Schedule trigger (1-phút interval, typeVersion 1.3) → `n8nctl workflow activate <id>` → **cron TỰ FIRE đúng lịch**, recurring. Bằng chứng: 2 execution liên tiếp `mode=trigger` (không phải manual) cách nhau đúng 60s (03:23:36, 03:24:36), 36s sau activate. → **n8nctl v1.0.0 + activate ĐÃ register schedule trigger vào routing layer trên n8npc**, khác hẳn behavior cũ (v0.x update không register cron).

**Cập nhật quy tắc**:
- **Cron production**: KHÔNG còn cần OS-level scheduler hay UI Save — `n8nctl workflow create/update <file>` rồi `n8nctl workflow activate <id>` là đủ để cron tự fire. (Verified cho scheduleTrigger; dùng cho P9 cutover AI Ads 9-stage.)
- Dòng cũ "(43) Cron PRODUCTION khi router stuck → OS scheduler" giờ chỉ áp dụng nếu activate fail (chưa gặp với v1.0.0).
- **Webhook INBOUND external** vẫn CHƯA re-test với v1.0.0 — giả định vẫn cần UI Save/restart khi router stuck (an toàn giữ nguyên cảnh báo đó). Chỉ cron đã xác nhận work.

## 2026-08-13 — CHỐT: cron register qua n8nctl (v1.5.0), KHÔNG cần UI Save

User xác nhận "n8nctl hiện tại đã giải quyết việc này". n8npc = single-main → `n8nctl workflow activate <id>` register cron/schedule vào routing layer, cron tự fire đúng lịch. `n8nctl workflow refresh <id>` (deactivate→activate, --delay) có sẵn để nudge re-register sau update nếu cần. **Bỏ caveat "UI Save để register cron"** trong report deploy — chỉ còn áp dụng cho **webhook INBOUND external** khi router stuck (chưa re-test, giữ cảnh báo an toàn). Verified trên deploy AI SEO Manager + Research 2026-08-13.

Liên quan [[feedback_n8n_webhook_no_register_via_api]] (gốc của vấn đề, áp dụng cho instance kiểu queue mode). Áp dụng trong [[project_ai_ceo_diary_fanpage]] và mọi workflow tương lai trên instance này.


## feedback_n8n_sheets_v45_schema_required

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n googleSheets typeVersion 4.5 với operation append/appendOrUpdate BẮT BUỘC có columns.schema[] đầy đủ tất cả field; thiếu schema → execution fail \"Could not get parameter\" ngay cả khi value/matchingColumns đúng_

n8n googleSheets `typeVersion: 4.5` với `operation: "append"` hoặc `"appendOrUpdate"`: payload `columns` PHẢI có **`schema: [...]`** array list tất cả field tham gia mapping. Thiếu `schema` → execution fail tại node đó với message **"Could not get parameter"** (không nói rõ tham số nào).

Verified 2026-06-09 trên ai-ceo-diary-fanpage workflow `0Xv3rMXX8XImcHo7`: Read nodes (operation read) thành công với cùng SA/mode/cred, nhưng Claim Row (appendOrUpdate) fail "Could not get parameter" vì JSON ban đầu chỉ có `mappingMode/value/matchingColumns` mà thiếu `schema`. UI tạo node ra luôn kèm schema; khi xây JSON bằng tay thì dễ quên.

**Schema entry shape** (một entry/field, mirror y key trong value):
```json
{"id":"<col_name>","displayName":"<col_name>","required":false,
 "defaultMatch":<bool>,"display":true,"type":"string",
 "canBeUsedToMatch":<bool>}
```
`defaultMatch` + `canBeUsedToMatch` = true CHỈ cho key nằm trong `matchingColumns`.

**How to apply**: khi xây googleSheets v4.5 write node bằng JSON, sau khi định nghĩa `value`+`matchingColumns` thì generate `schema` từ keys của value. Mọi append/appendOrUpdate trong project mới phải có. Validator n8nctl validate không catch lỗi này (workflow PASS validate vẫn runtime-fail). Patch sẵn pattern trong `ai-ceo-diary-fanpage/workflow/...workflow.json` (4 nodes Log No-Pending / Claim Row / Update Content Plan Row / Append Post Log đều đã có schema sau fix).

## `matchingColumns` phải nằm TRONG `columns`, không phải top-level (2026-07-09)
`appendOrUpdate` đọc **`parameters.columns.matchingColumns`**. Đặt ở `parameters.matchingColumns` (top-level) → n8n **silent-ignore**, thấy `columns.matchingColumns=[]` → runtime fail **"The 'Column to Match On' parameter is required"**. `n8nctl validate` KHÔNG bắt được (PASS validate, fail runtime).

Cùng class bug với [[feedback_n8n_emailsend_cc_under_options]] (cc phải trong `options`, không top-level): **n8n bỏ qua param sai chỗ mà không báo lỗi cấu hình**.

Ngoài ra `matchingColumns` phải trỏ cột **có thật trong `columns.value`** — trỏ cột không tồn tại (vd `hook_index` khi node chỉ ghi `hook_id`) cũng fail. Verify: `n8nctl workflow get <id>` → in `parameters.columns.matchingColumns` + `list(columns.value.keys())`.

Case thật: AI Oscar PM `elhLeC59GlqwZNPv` — set top-level `matchingColumns` → mỗi run chạy hết Sub-1→Sub-5 (tốn LLM 49 SKU) rồi chết ở node ghi. Latent 2 tuần vì chỉ nhìn Sheet, không check exec status.

Liên quan [[feedback_n8n_sheets_sa_mode_list_bug]] (mode "list" → cùng error message "Could not get parameter sheetName" nhưng khác nguyên nhân).

## `resource`/`operation` phải khai báo tường minh, nếu không validate.js chặn deploy (2026-07-09)
Hook `pre-bash-checks` chạy `_pipeline/validate.js` trước mọi `n8nctl workflow update`. Nó báo **HIGH E061 "missing required parameter resource/operation"** cho googleSheets node dựa vào default ngầm → **chặn deploy**. Orchestrator AI PM đang chạy production cũng fail validator này (12 issue) → không update được gì cho tới khi sửa file.

**Fix (không đổi hành vi)**: ghi rõ `resource: "sheet"` cho mọi googleSheets node, và `operation: "read"` cho node read đang dựa vào default. Đây đúng là default runtime — Sub-3 (`sub-03-hero-sku-identification.json`) vốn khai báo tường minh y hệt và chạy tốt nhiều tuần. Sau khi thêm: 12 issue → 6 (chỉ còn MEDIUM E060 typeVersion, do catalog validator cũ: webhook 2.1 / executeWorkflow 1.3 là version thật; MEDIUM không chặn).

**KHÔNG** tắt hook bằng override — sửa file cho pass là đường đúng.


## feedback_n8n_sheet_bool_config_falsy

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n Code node đọc boolean config (\"true\"/\"false\") từ Google Sheets → ra BOOLEAN không phải string; parse `String(v || '')` biến false→'' làm guard/flag sai_

Khi lưu "false"/"true" vào Google Sheet bằng gspread `update_cell` (default USER_ENTERED) → cell thành **boolean** FALSE/TRUE, không phải text. n8n googleSheets read trả về **boolean** `false`/`true`.

**Bẫy**: pattern parse config phổ biến `cfg[k] = String(r.value || '').trim()` → với boolean `false`: `false || ''` = `''` (cả hai falsy → trả vế sau) → cfg[k] = `''` (rỗng), KHÔNG phải `'false'`. Mọi guard kiểu `if (cfg.flag === 'false')` hoặc `=== 'true'` sai âm thầm (đọc ra rỗng).

**Why**: JS `||` trả operand falsy đầu tiên bị bỏ, boolean false là falsy nên bị `|| ''` nuốt.

**How to apply**:
- Parse config nullish, KHÔNG dùng `|| ''`: `String(r.value == null ? '' : r.value).trim()` → `false`→`'false'`, `true`→`'true'`.
- Guard boolean robust cả 2 dạng: `v === false || String(v).toLowerCase() === 'false'`.
- Muốn ép text trong sheet: set bằng `value_input_option='RAW'` (nhưng `update_cell` KHÔNG nhận kwarg này — dùng `ws.update(range, [[val]], value_input_option='RAW')`).
- LUÔN test dryrun trước live cho email/notify workflow — bug này lộ ở đếm email (6 vs 1), dryrun gửi hết về test inbox nên 0 hại.

Phát hiện 2026-07-07 khi build HR digest branch trong sub-notify-email (guard `pernv_email_enabled`). Xem [[project_ai_training_tracker]].


## feedback_n8n_executeonce_truncates_input

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_executeOnce cắt $input còn 1 item — expression đếm $input.all() trong node đó sẽ ghi 1 thay vì N; phải trỏ sang $('Node').all()_

Node n8n nhận N item mà chỉ nên ghi 1 row (audit log, respond webhook, notify) → fix đúng là `executeOnce: true`. **Nhưng `executeOnce` cắt luôn `$input` xuống còn 1 item** — mọi expression bên trong node đếm `$input.all()` sẽ trả **1** thay vì N.

**Why:** `executeOnce` = "chạy 1 lần với data của item ĐẦU TIÊN". Nó không chỉ chặn số lần execute, nó thay đổi luôn input set mà expression nhìn thấy. Field dùng `$('OtherNode').first()` / `.all()` thì KHÔNG ảnh hưởng (reference thẳng node khác, không qua $input).

**How to apply:**
- Trước khi bật `executeOnce`, **grep expression của node đó tìm `$input`**. Có → trỏ sang node nguồn: `$input.all()` → `$('<SourceNode>').all()`.
- Ca thật (AI PM orchestrator, 2026-07-16): `Write Hooks Rows` (460 item) → `Write Audit Log` không có executeOnce → ghi **460 row audit/run**, tích luỹ 4673 row. Bật executeOnce fix được số row, nhưng `hooks_total` = `{{ $input.all().filter(i => !i.json._empty).length }}` sẽ tụt 460 → 1. Phải sửa kèm thành `$('Flatten Hooks').all()...`. `Respond Webhook` cùng chuỗi cũng chạy 460 lần → executeOnce (mọi field dùng `.first()` nên an toàn).
- Dấu hiệu nhận biết từ Sheet: nhiều row **cùng nội dung** nhưng `run_id` lệch nhau vài giây (`...070240/070241/070242`) — đó là 1 run thật bị ghi lặp, không phải nhiều run. Đừng dedupe theo tuần (xoá nhầm run thật), dedupe theo `run_id`.

Related: [[project_ai_product_manager]] · [[feedback_n8n_chained_read_multiplies]]


## feedback_n8n_empty_read_skips_chain

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n node với 0 input item bị SKIP → 1 read trả 0 row (vd sheet rỗng) làm gãy toàn bộ chain downstream; fix alwaysOutputData=true_

n8n **skip node nào nhận 0 input item** (trừ trigger/first node). Hệ quả: trong chain tuyến tính các googleSheets read, nếu 1 tab RỖNG (chỉ header → read trả 0 item), node đó output 0 → mọi node downstream bị skip → workflow "success" nhưng KHÔNG làm gì (0 row ghi).

**Why:** Gặp ở AI Ads 9-Stage P3 (`sub-content-generation`): node `Read Promo Master` đọc `promo_master` rỗng (stub) → 0 item → Select + tất cả node sau (gen/score/write) bị skip. Exec status=success, runData rỗng, 0 OpenAI call, 0 row. Mất 1 lần debug tưởng instance lỗi.

**How to apply:** Mọi read node có thể rỗng (stub tab, filter ra 0 row, activation list khi chưa có activation) → set node property **`alwaysOutputData: true`** (sibling của `parameters`) → node emit 1 empty item `[{}]` thay vì 0 → chain tiếp tục, Code node dùng `$('Node').all()` xử lý empty-safe. Khi build JSON tay: thêm `"alwaysOutputData": true` vào read node. Liên quan [[feedback_n8n_gsheets_header_corruption]] (0-item silent skip) và [[project_ai_ads_9stage]].


## feedback_n8n_chained_read_multiplies

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n chạy node 1 lần/input item → googleSheets read nối sau node nhiều rows chạy N lần → burst Sheets 429_

n8n thực thi mỗi node **một lần cho mỗi input item**. Nếu chain một googleSheets **read** ngay sau một node trả nhiều rows (vd read sheet lớn 700+ rows), node read thứ 2 sẽ chạy **N lần** → N API call dồn dập → **HTTP 429 "too many requests"** tức thì & deterministic (read#1 OK, read#2 luôn fail). retryOnFail 3×5s KHÔNG cứu nổi vì burst quá lớn. Verified 2026-06-05 ([[project_ai_store_fanpage_repost]] orchestrator: "Read Emall Publish Log" 719 rows → "Read Repost Queue Cursor" chạy 719×).

**Dấu hiệu**: isolated SA read OK nhưng trong n8n read thứ 2 luôn 429; node read đầu pass, node read sau fail 100%.

**Fix**: set `"executeOnce": true` trên các googleSheets read node lấy data cố định (không phụ thuộc input item). Code node downstream pull data qua `$('Node Name').all()` nên executeOnce KHÔNG làm mất data. Pattern template worldcup-fb-engine cũng có bug này (chưa từng chạy live nên chưa lộ). Liên quan [[feedback_n8n_sheets_ratelimit_cascade]], [[feedback_n8n_sheets_sa_mode_list_bug]].


## feedback_n8n_appendorupdate_wipes_human_status

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n appendOrUpdate trên tab human-gated mà Build luôn set status mặc định → re-run GHI ĐÈ trạng thái người duyệt (confirmed→pending); fix bằng read-existing + skip_

n8n node `googleSheets appendOrUpdate` match theo PK trên tab **human-edited status gate** (vd dept_confirmations, weekly_optimization, campaign_plan) — nếu Code node "Build" LUÔN set `status` về giá trị mặc định (vd `'pending'`) + để trống `confirmed_by/confirmed_at` → mỗi lần workflow **re-run sẽ GHI ĐÈ** trạng thái người duyệt đã nhập tay (confirmed → pending, mất confirmed_by, reset lock).

**Why:** appendOrUpdate idempotent trên ROW KEY nhưng DESTRUCTIVE trên giá trị cột — nó cập nhật mọi cột trong value map về giá trị Build sinh ra, không phân biệt cột nào human-owned. Nguy hiểm gấp bội khi workflow chạy theo cron lặp (vd Activation cron DAILY): mỗi ngày reset confirmation → gate "đủ duyệt" KHÔNG BAO GIỜ tích đủ → **deadlock** toàn bộ human-approval gate. Phát hiện ở ai-ads-9stage P5 sub-dept-notify 2026-06-19 (CRITICAL, suýt lọt vì lần đầu nhầm "appendOrUpdate = idempotent = an toàn").

**How to apply:** Với mọi workflow ghi tab human-gated:
1. Thêm node `Read <tab>` trước Build.
2. Build dựng `Set` các PK đã tồn tại → **skip** (`continue`) các row đã có (chỉ seed row MỚI), KHÔNG re-emit row cũ.
3. Hoặc nếu phải update: chỉ map các cột machine-owned, KHÔNG map `status`/`confirmed_by`/`confirmed_at`/`*_locked_until` (human-owned).
4. Test bắt buộc: set 1 row → confirmed (giả lập human) → re-run → assert GIỮ confirmed (không reset pending) + notify không dup.

Cùng họ với R1-C5 (campaign_plan protected ranges + status precondition). Khi verify phase nào ghi tab ★human-gated → luôn check pattern này. **Đã trúng 2 phase ai-ads-9stage**: P5 dept_confirmations (daily cron → chắc chắn cắn) VÀ P4 campaign_plan (monthly, wipe cả fb_campaign_id/adset/ad do P6 ghi → mất linkage). Cùng fix skip-existing-non-pending. ⇒ Khi 1 phase dính bug này, GREP mọi node `appendOrUpdate` khác trong pipeline có Build set status mặc định. Liên quan [[project_ai_ads_9stage]] [[feedback_n8n_cred_placeholder_silent_fail]].


## feedback_n8n_sheets_sa_mode_list_bug

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n Google Sheets node với Service Account auth fail runtime nếu documentId/sheetName dùng mode \"list\" — cần mode \"id\"/\"name\"._

# Service Account + Google Sheets node mode "list" → "Could not get parameter"

## Triệu chứng
Cron-triggered workflow fail instant (~50ms) với error:
```
"message": "Could not get parameter",
"extra": { "parameterName": "sheetName" }
```
Node là `n8n-nodes-base.googleSheets` typeVersion 4.5 với:
- `authentication: "serviceAccount"`
- `credentials.googleApi`: SA credential ID valid
- `documentId: { __rl: true, mode: "list", value: "1abc...", cachedResultName: "..." }`
- `sheetName: { __rl: true, mode: "list", value: "gid=12345", cachedResultName: "raw_posts" }`

**Verified case** (2026-05-23, AI Social Listening Analyzer + Reporter, n8n 1.122.5):
- 3 Social Listening WFs active cron 24h, mỗi execution fail instant với error trên
- Cùng credential SA `OyQwCVortHcv2gmc` dùng mode "id"/"name" trên AI PM Sub-1 → work bình thường

## Why
n8n's resource locator mode "list" yêu cầu Drive picker API call để validate/resolve. SA credential type không có Drive scope (chỉ Sheets scope). Resolve fail → `getNodeParameter` throws "Could not get parameter".

## Fix
Đổi sang static modes:
```json
"documentId": { "__rl": true, "mode": "id", "value": "1CHZbarEYXGubCX1CjuGqPCGcjaBTl9Y5i1HnISfVvDM" },
"sheetName": { "__rl": true, "mode": "name", "value": "raw_posts" }
```
- documentId: mode "id" với value = sheet ID
- sheetName: mode "name" với value = sheet tab name string

## How to apply
- Khi build/edit Sheets node với SA auth: KHÔNG dùng UI picker (sinh mode "list"). Edit JSON trực tiếp set mode "id"/"name".
- Khi import workflow từ user export (UI thường set mode "list"): grep `"mode": "list"` trong Sheets nodes → sửa trước khi PUT.
- Quick fix script: `ai-social-listening/_scripts/fix_credentials.py` (idempotent, swap mode + check cred).

Related:
- [[feedback-n8n-cred-placeholder-silent-fail]] — same fix sprint
- [[feedback-no-examples-in-prompts]] — other deployment gotcha


## feedback_n8n_sheets_readallrows_invalid

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n googleSheets v4.5 KHÔNG support operation \"readAllRows\" — dùng \"read\" với options={}._

# n8n googleSheets v4.5 operation "readAllRows" không tồn tại

## Triệu chứng
Workflow active, cron fire, Sheets node fail với:
```
"message": "Could not get parameter",
"extra": { "parameterName": "sheetName" }
```
Node parameters CÓ sheetName mode "name" hợp lệ, credential SA cũng đúng. Vẫn fail.

## Why
n8n googleSheets v2 router (typeVersion 4.5) chỉ support operations: `append`, `appendOrUpdate`, `clear`, `delete`, `read`, `update`. Operation `readAllRows` KHÔNG có trong v4.5 router (có thể là legacy v3.x name).

Khi operation invalid, router fail trước khi resolve param schema → mọi `getNodeParameter()` call throw "Could not get parameter".

Bug confusing vì error trỏ vào `sheetName` (param resolved cuối) thay vì root cause (operation lookup).

**Verified case** (2026-05-26, AI Social Listening Analyzer + Reporter):
- Workflow source dùng `"operation": "readAllRows"`
- 9 cron exec sau patch 2026-05-23 đều fail identical error
- Fix: đổi `read` → run thành công

## Fix
```json
// Trước
{
  "operation": "readAllRows",
  "filters": { ... },
  "options": { "headerRow": 1, "returnAllRowsAndColumns": false }
}

// Sau
{
  "resource": "sheet",
  "operation": "read",
  "options": {}
}
```
- `operation: "read"` đọc all rows mặc định
- `resource: "sheet"` explicit (v4.5 default cũng "sheet")
- `options: {}` empty — không cần `headerRow`/`returnAllRowsAndColumns`
- Filter sentiment/status etc → di chuyển sang Code node hoặc Filter node downstream

## How to apply
- Trước khi PUT bất kỳ Sheets node mới: verify operation thuộc {append, appendOrUpdate, clear, delete, read, update}
- Refer pattern AI PM Sub-1 `Read Trends`/`Read Competitor`/`Read Social` cho working template
- Validate offline: `n8nctl workflow validate <file> --strict` (nếu validator support operation check)

Related:
- [[feedback-n8n-sheets-sa-mode-list-bug]] — different Sheets gotcha same project
- [[feedback-n8n-cred-placeholder-silent-fail]] — initial discovery sprint


## feedback_n8n_execution_log_save

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Khi tạo workflow n8n mới PHẢI set settings.saveDataSuccessExecution='all' + saveDataErrorExecution='all' + saveExecutionProgress=True/False tuỳ tần suất — mặc định 'none' khiến không debug được khi silent fail._

**Rule**: Mọi workflow n8n MỚI tạo PHẢI set explicit `settings.saveDataSuccessExecution='all'` + `saveDataErrorExecution='all'` + `saveManualExecutions=true` ngay từ build. KHÔNG dựa vào default — n8n template/skeleton mặc định nhiều khi là `'none'` → execution không log → khi WF silent fail (cron không fire, governor skip, rate-limit, etc.) KHÔNG CÓ GÌ để debug ở UI Executions tab.

**Why**: 2026-06-10 phát hiện 6 WF của project [[project_ai_store_fanpage_repost]] có 5/6 với `'none'` — khi drip publisher silent 16h (14:20 06-09 → 06:30 06-10, không log publish nào trong run_audit dù cron */20 active), user check UI = trống → không root-cause được. Phải sửa toàn bộ + lưu rule này. Tốn ~30 phút.

**How to apply**: 
- Khi build mới qua /n8n-build hoặc Python builder, ensure JSON skeleton có:
  ```json
  "settings": {
    "executionOrder": "v1",
    "timezone": "Asia/Ho_Chi_Minh",
    "saveDataSuccessExecution": "all",
    "saveDataErrorExecution": "all",
    "saveExecutionProgress": true,
    "saveManualExecutions": true,
    "callerPolicy": "workflowsFromSameOwner"
  }
  ```
- Riêng `saveExecutionProgress` cân nhắc theo tần suất:
  - `true` cho WF cron ≤ 1 lần/giờ hoặc on-demand (cheap, debug intermediate node data)
  - `false` cho WF cron ≥ 1 lần/20 phút HOẶC sub-worker gọi >50 lần/ngày (avoid DB blowup; vẫn giữ success/error trace, chỉ mất intermediate)
- Audit hiện có: `n8nctl workflow get <id>` → check `settings.saveDataSuccessExecution`. Nếu thấy `'none'` → patch ngay.
- Bulk audit toàn instance: query `settings.saveDataSuccessExecution=='none'` qua n8nctl list — script audit định kỳ là good idea.

**Lưu ý KHÔNG đụng `settings.maxConcurrency`** ([[feedback_n8n_settings_maxconcurrency_400]]) — invalid, API 400.

**Backup template**: skeleton orchestrator/hub/utility trong `n8n-automation-kit/_templates/` nên audit lại có chuẩn settings không.


## feedback_n8n_cron_uses_workflow_timezone

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n scheduleTrigger cronExpression chạy theo settings.timezone của workflow, KHÔNG phải UTC — set giờ UTC là sai lệch 7h._

# n8n cron = workflow timezone, không phải UTC

`scheduleTrigger` với `rule.interval[0].field='cronExpression'` được n8n đánh giá theo **`settings.timezone` của workflow** (ở đây `Asia/Ho_Chi_Minh`), KHÔNG phải UTC.

**Bằng chứng**: AI PM (PC) cron `0 7 * * 1` → execution thật `startedAt=2026-06-15T00:00:00Z` = 07:00 ICT. Tức cron-hour 7 fire lúc 07:00 **VN**.

**Why:** dễ nhầm vì n8n lưu/hiển thị execution timestamp bằng UTC (`Z`), nên nhìn log tưởng cron theo UTC.

**How to apply:**
- Muốn 08:00 VN thứ 7 → `0 8 * * 6` (KHÔNG phải `0 1 * * 6`).
- Kiểm tra `settings.timezone` trước khi tính giờ cron.
- Verify: đối chiếu cron-hour với 1 execution thật đã fire (convert `startedAt` UTC → tz workflow).

**Case thật (2026-07-09)**: AI Oscar PM set `0 1 * * 6` tưởng = 08:00 VN, thực ra 01:00 VN. Kết hợp với [[feedback-n8npc-instance-save-only]] (cron không re-register sau `n8nctl workflow update`) → thứ 7 04/07 **trôi qua không chạy, không output, không email**, silent. Fix: `0 8 * * 6` + deactivate→activate ép re-register.

Liên quan: [[feedback-n8npc-instance-save-only]], [[project-ai-product-manager]].


## feedback_n8n_cred_placeholder_silent_fail

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n chấp nhận credential ID là literal \"REPLACE_WITH_YOUR_CREDENTIAL_ID\" (template placeholder) — workflow active nhưng silent-fail mọi cron._

# Template credential placeholder bị bỏ sót → workflow silent-fail

## Triệu chứng
Workflow `active: true`, cron fire đúng giờ, nhưng execution fail instant (~5-50ms) với:
```
"description": "Please recreate the credential or ask its owner to share it with you."
"message": "Node \"X\" does not have access to the credential"
```
Inspect node parameters thấy:
```json
"credentials": {
  "googleSheetsOAuth2Api": {
    "id": "REPLACE_WITH_YOUR_CREDENTIAL_ID",
    "name": "Google Sheets"
  }
}
```
Literal string `REPLACE_WITH_YOUR_CREDENTIAL_ID` đã được n8n DB chấp nhận như credential ID hợp lệ (không validate format).

**Verified case** (2026-05-23, AI Social Listening Collector workflow `k9Yzs17yp5SasmHW`):
- Source file template có placeholder ngày deploy
- Deployer (Claude/n8nctl) quên replace → PUT workflow as-is
- Workflow active 1+ tháng, cron mỗi 6h fire = ~120 fail/tuần, không alert (cron failure không trigger notification mặc định)

## Why
- n8n không validate credential ID khi PUT — chấp nhận bất kỳ string
- ActivePostWFs với credential lookup fail ở runtime → silent error mỗi cron
- Không có UI badge "broken credential" trên list workflows page → easy to miss

## Fix
1. Find live credential ID đúng: `n8nctl credential list | grep -B 1 -A 1 "<type>"`
2. Patch workflow JSON: replace `REPLACE_WITH_YOUR_CREDENTIAL_ID` → real cred ID
3. Set `authentication` field rõ ràng (vd `"serviceAccount"` cho googleApi SA)
4. PUT via curl direct: `curl -X PUT $N8N_HOST/api/v1/workflows/{id} -H "(n8n api-key header): $N8N_API_KEY" -d @patched.json` (avoid n8nctl strip bug)

## How to apply (preventive)
**Trước khi PUT bất kỳ workflow từ template/source file**:
```bash
grep -r "REPLACE_WITH" path/to/workflow.json && echo "PLACEHOLDER FOUND — fix before deploy"
```
Add làm pre-deploy check trong `/n8n-deploy` skill.

**Sau khi deploy WFs cron-triggered**: chạy `n8nctl execution list --workflow <id>` sau 1 cycle để verify không có error stream.

Related:
- [[feedback-n8n-sheets-sa-mode-list-bug]] — second bug discovered same sprint
- [[feedback-n8nctl-update-strips-fields]] — why use curl direct not n8nctl update


## feedback_sa_drive_no_quota

<!-- source: D--Projects-work-build-workflow-ai-training-tracker mtime 2026-07-20 -->
_SA `n8n-bot` 0 Drive quota → mọi upload 403. Workaround đã verify 2026-04-21 - dùng n8n credential OAuth2 user `QTCDjfnubZJpCDoJ` (name "Google Drive") để upload bình thường._

Trên n8n project build-workflow có 2 credential Google Drive:
1. **SA `n8n-bot@gen-lang-client-0477135314.iam.gserviceaccount.com`** (cred id `OyQwCVortHcv2gmc`): KHÔNG upload được file — 0 storage quota + 0 Shared Drive membership. Mọi upload → 403 `storageQuotaExceeded`, kể cả với folder có `canAddChildren=true` nhưng owner là personal Gmail. Chỉ dùng được cho READ-ONLY operations (Sheets read/write do share-with-SA, Drive files SA được share).
2. **OAuth2 user cred `QTCDjfnubZJpCDoJ`** (name "Google Drive", type `googleDriveOAuth2Api`): Upload bình thường vào My Drive của user sở hữu token. Đã verify 2026-04-21 qua exec `aKBBkqwwxdHAKGe2:9472` — 6/6 ảnh upload thành công vào folder `1V-QodgdMd4SwefYt1KcYH9o9Ohpki__3` (owner `nguyentanthao1976202@gmail.com`, My Drive của user này).

**Why:**
- Google rule: Service Accounts không có personal storage quota. Chỉ có thể "create" file nếu target là Shared Drive và SA là member ≥ Content Manager.
- OAuth2 user credential dùng quota của user thật → luôn upload được vào My Drive của user đó (và vào Shared Drive nếu user có quyền).

**How to apply:**
- Default cho mọi workflow mới cần Drive upload: dùng cred `QTCDjfnubZJpCDoJ`. Node type `n8n-nodes-base.googleDrive` v3, resource=file, operation=upload, `driveId: { __rl: true, value: 'My Drive', mode: 'list' }`, folderId là ID folder thuộc My Drive của owner OAuth2.
- KHÔNG dùng SA (`OyQwCVortHcv2gmc`) cho Drive upload nữa — chắc chắn fail.
- Đã áp dụng trong `ai-digital-marketing-content/workflows/_build_sub_carousel_publisher.py::DRIVE_ARCHIVE_NODE` (fan-out parallel với FB upload từ Extract_Image_Binary, `onError='continueRegularOutput'` để Drive fail không block FB path).
- Nếu cần hosting PUBLIC (FB Graph photos qua URL field): upload bằng OAuth2 cred xong publish file với permission `type=anyone`, reader qua webContentLink. Hoặc tốt hơn — upload binary trực tiếp lên FB `/photos` với `source` multipart field (đang áp dụng ở sub-carousel-publisher).

## feedback_n8nctl_update_strips_fields

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8nctl workflow update gửi extra fields gây 400; bypass bằng curl PUT với chỉ name+nodes+connections+settings_

# Bug: `n8nctl workflow update` returns 400 Bad Request

**Why**: n8nctl gửi full workflow JSON (gồm `id`, `versionId`, `createdAt`, `updatedAt`, `active`, `staticData`, `pinData`, `tags`, `meta`, `triggerCount`, etc.) trong PUT body. n8n Public API v1 PUT `/workflows/{id}` chỉ accept **4 fields top-level**: `name`, `nodes`, `connections`, `settings`. Extra fields → 400.

**How to apply**:
- Validator pass nhưng `n8nctl workflow update` vẫn 400 → bypass bằng curl direct:
```python
payload = {k: wf[k] for k in ('name','nodes','connections','settings') if k in wf}
PUT /api/v1/workflows/{id} với payload đã strip
```
- Verified 2026-05-12 trên Digital workflow `lI2axyT8qp6AJhIv`: n8nctl update fail → curl direct PUT 200 OK, workflow stays active.
- Memory note: lần update tiếp theo nếu n8nctl 400 → curl bypass thay vì debug schema. Báo cáo bug cho `@trngthnh369/n8nctl` package maintainer khi tiện.


## feedback_n8n_code_multibranch_bug

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n Code node $() access fails khi node có nhiều input connections từ branches parallel. Phải dùng sequential chain hoặc Merge node._

# n8n `$('OtherNode').all()` trả 0 items khi multi-branch input

## Triệu chứng
Code node nhận input từ nhiều upstream nodes (3+ branches parallel converge), gọi `$('OtherNode').all()` để reach back lấy output của node khác trả về `[]` dù node đó thực sự output nhiều items.

**Verified case** (AI PM Sub-1, n8n 1.122.5, 2026-05-22):
```
Connections: Trigger → [Read Trends, Read Competitor, Read Social] → Aggregate Signals
```
- `Read Competitor` outputs 856 items (verified via execution log)
- Trong `Aggregate Signals` code: `$('Read Competitor').all()` returns `[]`
- `_source_stats.competitor_raw = 0` dù sheet có 856 rows

## Why
n8n's `$()` accessor có quirk khi current node có multiple input branches converging. Items context bị fragment theo branch — `$()` chỉ thấy 1 branch.

## Fix verified
Đổi connections thành SEQUENTIAL CHAIN:
```
Trigger → Read Trends → Read Competitor → Read Social → Aggregate Signals
```
Aggregate có 1 input branch → `$('Read Competitor').all()` work bình thường, trả 856 items.

Alternative: dùng `Merge` node (mode: Multiplex / Combine) trước Code node để consolidate branches.

## How to apply
- KHÔNG dùng parallel branches → 1 Code node mà cần `$()` access
- Mặc định luôn sequential chain cho Code nodes có multi-source
- Document trong workflow comment để future-self không lặp lại

Related: [[feedback-no-examples-in-prompts]] (other prompting gotchas)


## feedback_n8n_cron_manual_race

<!-- source: build-workflow mtime 2026-06-12 -->
_Khi manual n8nctl workflow run fire trong cùng cron window, anti-concurrency guard 90s không đủ (pipeline ~4 min) → workflow pick next pending day → 2 bài đăng cách nhau 2 phút (spammy)_

Trên ai-ceo-diary-fanpage workflow `0Xv3rMXX8XImcHo7`, 2 fire trong cùng 2 phút → 2 bài đăng FB cách nhau ~2 min:
- 12:00:00 VN: cron `0 12 * * *` fire (mode=trigger) → claim day 5 → posted 12:04
- 12:01:52 VN: `n8nctl workflow run` smoke test (mode=manual) → claim day 6 → posted 12:06

Anti-concurrency guard 90s trong Select Next Pending hết hạn lúc 12:01:35 (90s sau lock day 5 ở 12:00:05). Smoke test 12:01:52 chạy Select Next Pending → guard không trigger → pick day 6 (smallest pending vì day 5 đang PUBLISHING).

**Why**: pipeline gpt-image-2 high mất ~3-4 phút. Guard 90s chỉ cover 25% pipeline → race window rộng.

**How to apply**:
1. Bump anti-concurrency window từ 90s → **600s (10 phút)** trong Select Next Pending jsCode. Cover full pipeline + buffer.
2. Variable rename cho rõ ràng: `recent_post_lt_90s` → `recent_post_lt_600s`, `concurrent_publishing` → `concurrent_publishing_lt_600s`.
3. **Tránh fire manual** test trong window cron schedule ±10 phút (vd cron 12:00 → tránh 11:50-12:10 manual fire).
4. Verified 2026-06-12: bumped 90s→600s, day 6 đã delete + reset → pending.

**Bonus discovery**: cron n8n trên n8npc instance THỰC SỰ FIRE đúng schedule (despite earlier router-stuck concerns). Memory [[feedback_n8npc_instance_save_only.md]] về cron không register cần update — sau nhiều UI Save + thời gian, router có thể self-heal hoặc instance restart làm cron hoạt động.

Liên quan [[feedback_fb_photos_code1_orphan_post.md]] (FB code=1 paradox cũng tạo duplicate, nhưng khác cơ chế).


## feedback_n8n_googleapi_http_scope

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Cách gọi raw Google API (Sheets batchUpdate...) từ n8n bằng Service Account credential trong HTTP Request node + scope gotcha_

Để gọi **raw Google API** (vd Sheets `spreadsheets:batchUpdate`) từ n8n bằng Service Account, dùng HTTP Request node (typeVersion 4.2) với `authentication: "predefinedCredentialType"` + `nodeCredentialType: "googleApi"` + credential id. Hỗ trợ từ n8n v0.225.0.

**2 điều kiện trên credential `googleApi` (Service Account), set trong n8n UI** (n8n public API KHÔNG update credential được — chỉ create/delete):
1. Bật toggle **"Set up for use in HTTP Request node"** (`httpNode: true`).
2. Field **Scope(s)** PHẢI có scope cần dùng, vd `https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive`. Thiếu → token mint OK nhưng Google trả `403 "Request had insufficient authentication scopes"` (auth thành công, scope sai — KHÔNG phải lỗi credential). Scope này độc lập với googleSheets node (node tự mint scope riêng), nên thêm scope KHÔNG ảnh hưởng googleSheets nodes hiện có.

**Use case chính**: gộp nhiều Sheets writes thành 1 call để né quota 60 writes/min. `spreadsheets.batchUpdate` cho phép trộn `updateCells` (GridRange theo cột vật lý, `startRowIndex = row_number - 1`, end-index exclusive) + `appendCells` (POSITIONAL theo header order — phải verify thứ tự cột) trong 1 request. Áp dụng cho AI SEO Manager sub-writer 2026-06-01 (xem [[feedback_n8n_sheets_ratelimit_cascade]]).

⚠️ HTTP Request node BẮT BUỘC có `method` explicit (validate.js block nếu thiếu). googleSheets/openAi/merge nodes thiếu `resource`/`operation`/`mode` → validate.js báo E061/false-positive dù n8n runtime default được; thêm explicit (`resource:"sheet"`+`operation:"read"/"update"`, openAi `resource:"text"`+`operation:"message"`, merge `mode:"append"`) để qua deploy hook.

**Local SA key** `service-account/gen-lang-client-0477135314-45a1b1cee429.json` = CÙNG Service Account với n8n cred `OyQwCVortHcv2gmc` (`n8n-bot@gen-lang-client-0477135314.iam.gserviceaccount.com`) → đọc/ghi được mọi sheet n8n-bot có access (vd SEO sheet `1w4Bz...`). Dùng để verify writes / đọc header / recon mà không cần qua n8n.


## feedback_n8n_node_id_must_be_random_uuid

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
Khi xây workflow JSON tay, **PHẢI** dùng `uuid.uuid4()` (Python) / `crypto.randomUUID()` (JS) để generate node IDs. KHÔNG dùng pattern dễ đọc kiểu `a0000001-0001-4001-8001-a00000000001`.

**Why**: Dù pattern format đúng UUIDv4 spec (regex match), n8n internal routing/registration có thể hash-route theo node ID. Pattern deterministic giống nhau giữa các workflow → router collision → webhook/cron KHÔNG register dù workflow active. Verified 2026-06-09 trên ai-ceo-diary-fanpage: 21 nodes với pattern `aXXXXXXX-XXXX-4XXX-8XXX-aXXXXXXXXXXX` → webhook 404/register fail liên tục, dù validator PASS và workflow active.

**How to apply**: 
- Mọi node mới khi build JSON tay phải có ID từ `uuid.uuid4()`
- Khi copy node từ template, **regenerate ID** trước khi gắn vào workflow mới
- n8n connections là theo node NAME, không phải ID → đổi ID không break connections
- Sau khi regen, push qua API rồi user UI Save 1 lần để n8n re-register với ID mới

Liên quan [[feedback_n8n_webhook_no_register_via_api]], [[feedback_n8npc_instance_save_only]] (trước đây nghĩ chỉ do instance type queue mode, nhưng pattern UUID có thể là root cause song song).

Code snippet đúng:
```python
import json, uuid
wf = json.load(open(path))
for n in wf['nodes']:
    n['id'] = str(uuid.uuid4())
# connections by NAME — không cần update
```


## feedback_n8n_no_require_luxon

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n self-hosted ở $N8N_HOST không cho `require('luxon')` trong Code node. Dùng global `DateTime` trực tiếp (n8n inject sẵn)._

# n8n không cho `require('luxon')` trong Code node

## Rule
KHÔNG dùng `const { DateTime } = require('luxon');` trong Code node của workflow trên instance `n8npc.khoahrv.id.vn`. Dùng global `DateTime` trực tiếp:

```js
// SAI — sẽ throw "VMError: Cannot find module 'luxon'"
const { DateTime } = require('luxon');
const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');

// ĐÚNG — DateTime đã được n8n inject sẵn
const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
```

**Why:** n8n Code node chạy trong VM2 sandbox, instance này không bật `NODE_FUNCTION_ALLOW_EXTERNAL=luxon` env var. Verified bằng execution 15036 lỗi `VMError: Cannot find module 'luxon'`. Memory commit `4b0aaed` (refactor AI Ads Manager) cũng đã fix issue này trước.

**How to apply:**
- Khi build workflow mới có Code node dùng Luxon, KHÔNG require — dùng global `DateTime` trực tiếp
- Library khác (lodash, axios, etc.) cũng có thể bị block tương tự — test trước hoặc dùng global của n8n
- Validate offline (n8nctl validate) KHÔNG bắt được lỗi này — chỉ phát hiện khi runtime


## feedback_n8n_sheets_trigger_needs_oauth2

<!-- source: build-workflow mtime 2026-06-01 -->
_n8n Google Sheets Trigger node yêu cầu OAuth2, KHÔNG hoạt động với Service Account_

n8n **Google Sheets Trigger** node (`n8n-nodes-base.googleSheetsTrigger`) **chỉ chạy với OAuth2** (credential type `googleSheetsTriggerOAuth2Api`), **KHÔNG nhận Service Account** (`googleApi`). Set `authentication: serviceAccount` + gắn cred googleApi → activate fail **400 `"Node ... does not have any credentials of type googleApi defined"`** (dù cred đã gắn đúng trong JSON). Verified 2026-06-01 (spike cho AI SEO Manager event-driven trigger).

→ Để có event-driven "row added → run" với SA-only setup, KHÔNG dùng được Sheets Trigger node. Workaround:
1. **Frequent schedule-poll** (recommended, zero setup): workflow schedule chạy mỗi 3-5 phút, READ topics bằng SA (works), filter PENDING → chạy/dispatch. ≤5min latency. Cần lock guard (config cell `run_lock_until` + reconciliation lock-aware) để tránh 2 run song song + reconciliation reset nhầm topic live.
2. Hoặc set up Google OAuth2 cred (UI OAuth flow + Google Cloud OAuth client) rồi mới dùng Sheets Trigger thật (~1min).

Khác với HTTP Request node — node đó NHẬN được SA (xem [[feedback_n8n_googleapi_http_scope]]). Trigger nodes Google nói chung thiên về OAuth2.


## feedback_google_sheet_formatting_convention

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Standard formatting cho mọi Google Sheet dùng trong n8n workflows — font JetBrains Mono 10, header bold+center, tab name lowercase snake_case English, alternative color_

Khi tạo hoặc cấu hình Google Sheet cho dự án n8n workflow, áp dụng convention sau MẶC ĐỊNH (không cần user yêu cầu lại):

**Font & size:**
- Font: `JetBrains Mono`
- Size: `10`

**Header row:**
- Bold (weight 700)
- Horizontal alignment: CENTER
- Nền có thể hơi tối để phân biệt (theo alternative color palette của sheet)

**Alternative row color:**
- Áp dụng `alternating colors` (banded rows) — dùng preset hoặc custom theo color của sheet đầu tiên user đã config
- Reference sheet 1 user đang dùng để lấy màu palette (đọc format trước khi apply cho tab mới)

**Column width:**
- Auto-fit (auto-resize) theo content — không hardcode width

**Naming convention:**
- **Tên file Sheet**: English, có thể dùng space hoặc snake_case
- **Tên tab sheet**: lowercase, English, underscore-separated (`snake_case`). VD: `config_positions`, `results_tracking`, `processed_files`, `errors_log`
- **Column header**: lowercase snake_case English (consistency với tab name)

**Why:** User explicit feedback 2026-04-23: muốn consistency + readable cho engineer (JetBrains Mono), tab name English dễ reference từ n8n workflow JSON.

**How to apply:**
- Khi tạo Sheet mới hoặc tab mới → apply toàn bộ format trên trong 1 lần batch request
- Dùng Sheets API `batchUpdate` với requests: `updateCells` (format) + `updateDimensionProperties` (auto-resize) + `updateSheetProperties` (alternate color)
- Trước khi apply alternative color, đọc sheet đầu tiên user đã config để lấy palette match
- Nếu user config sheet đầu tiên chưa có thì dùng default palette: header `#E8EAED`, even row `#F8F9FA`, odd row `#FFFFFF`


## feedback_n8n_ghost_executions

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_n8n queue mode đôi lúc tạo ghost executions (status=running nhưng 0 nodes fire) block worker queue_

n8n self-hosted (queue mode hoặc instance restart mid-run) đôi lúc để lại **ghost executions**: status = `running` nhưng `data.resultData.runData` rỗng, `lastNodeExecuted` undefined, `stoppedAt: null`. Thường xảy ra khi:
- Worker crash giữa execution mới được pick
- Instance restart mid-execution
- Queue mode worker disconnect

**Why:** Trigger sinh DB row execution → worker chưa kịp bind/start nodes → instance state mất. Trigger không retry, execution kẹt vĩnh viễn.

**How to apply:**
- Symptom: workflow active, polling trigger schedule fire nhưng list `n8nctl execution list --workflow <id>` cho thấy execution `running` rất lâu (giờ+) mà sub-workflows (writer/scorer) đều idle. Watcher poll mới không xuất hiện trong list → queue block.
- Verify: `n8nctl execution get <id> --logs` → 0 nodes run, lastNodeExecuted undefined.
- Cleanup: **xoá execution qua UI** (Executions panel → filter status=Running → Delete) hoặc `DELETE /api/v1/executions/{id}` (Public API v1 hỗ trợ). n8nctl không có verb stop/delete execution (verified 2026-06-16).
- Sau cleanup, watcher poll tiếp theo (3min) fire bình thường.
- Trường hợp 2026-06-16: 3 watcher (Topic Watcher AI SEO Manager) kẹt từ 12:33-12:39 VN sau khi 1 orchestrator dài 252s + writer chain xong → instance/worker bị gián đoạn. Sheet `0 PENDING/0 PROCESSING` → ghost không gây mất data, chỉ block event-driven.

**Mitigation lâu dài:** Đặt timeout settings.executionTimeout phía workflow (n8n hỗ trợ qua settings.executionTimeout) — sẽ tự fail execution nếu vượt threshold, giải phóng worker. Watcher hiện không set timeout nên ghost không tự dọn.

## Ghost SAU KHI stop (2026-07-09, exec 84392 AI PM)
Cancel 1 execution đang chạy thật cũng đẻ ra ghost. Trình tự đã verify:
- `POST /rest/executions/{id}/stop` (session cookie) → **HTTP 200 trả `status: canceled`**, NHƯNG DB row vẫn `running`, `stoppedAt: null`. Response body NÓI DỐI — phải re-`GET` để verify.
- `n8nctl execution delete <id>` lúc đó → **400 Bad Request** (n8n từ chối xoá execution `running`).
- `DELETE /rest/executions/{id}` → **404, route không tồn tại** (n8n dùng `POST /rest/executions/delete` với body `{ids:[...]}`).
- **Fix: gọi `/stop` LẦN 2** → lúc này `GET` mới thấy `status: canceled` + `stoppedAt` có giá trị → `n8nctl execution delete <id> --yes` chạy được.

**How to apply:** sau mọi lần stop, LUÔN `n8nctl execution get <id>` verify `status`+`stoppedAt` thay vì tin response của `/stop`. Nếu còn `running` → stop lại rồi mới delete. Backup `--logs` ra file TRƯỚC khi delete (record biến mất vĩnh viễn).

Related: [[feedback_n8n_run_verb_fires_production]]


## feedback_n8n_webhook_no_register_via_api

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Trên instance $N8N_HOST, workflow tạo hoặc update qua n8nctl/REST API không tự động register webhook URL — request POST /webhook/* trả 404 dù workflow.active=true._

# n8n webhook không auto-register qua API trên instance này

## Triệu chứng
- Tạo workflow có Webhook trigger qua `n8nctl workflow create/update`
- Workflow ở trạng thái `active=true` (verified qua API)
- Request POST `$N8N_HOST/webhook/<path>` trả `404 "webhook not registered"`
- Bounce active state (deactivate + activate) **không** fix
- `n8nctl workflow update --activate` cũng không fix

## Root cause
n8n self-hosted ở `n8npc.khoahrv.id.vn` có bug: webhook router chỉ refresh khi workflow được Save qua UI. API path không trigger re-registration.

Có thể do n8n chạy queue mode (multiple workers) và webhook cần register trên mọi worker, nhưng API chỉ chạm 1 worker.

## How to work around

**Khi cần test workflow có webhook trigger:**
1. **Cách 1 (đơn giản nhất):** Bảo user mở workflow trong UI, bấm Save (Ctrl+S) — webhook register ngay
2. **Cách 2:** Bảo user click "Execute Workflow" button trong UI để chạy bằng Manual Trigger (không cần webhook)
3. **Cách 3 (nếu có shell):** SSH vào host, restart n8n service

**Khi build workflow mới:**
- Đừng dựa vào webhook trigger để smoke test qua API
- Dùng Manual Trigger + bảo user click "Execute Workflow" trong UI
- Hoặc dùng Schedule trigger với cron sát thời điểm test (5 phút sau) — **2026-05-20: cách này CŨNG fail** — schedule trigger registry cũng không refresh, fire time qua mà 0 execution

## 2026-05-20 update — version bump KHÔNG fix
Test bumping webhook 2→2.1 + scheduleTrigger 1.2→1.3 + executeWorkflow 1.2→1.3 trên AI Product Manager orchestrator. Sau PUT update + deactivate/activate cycle:
- Webhook vẫn 404
- Schedule trigger không fire dù cron đặt 2 phút sau

Confirm: vấn đề thuần network architecture (registry không reload từ Public API), KHÔNG liên quan node version.

**Cách duy nhất**: User mở UI → workflow → Save (no changes needed).

## How to apply
- Không lãng phí thời gian thử bounce activate, update --activate, retry trigger, hoặc bump node version
- Communicate sớm với user: "webhook không reg qua API, bạn save UI 1 lần để register, sau đó cron + webhook work bình thường"
- Monitor execution qua `curl /api/v1/executions?workflowId=X` polling

## 2026-05-20 update — verified more nuance

- **Sub-workflow PUT KHÔNG break webhook**: Code/HTTP nodes trong sub-workflow update qua PUT chạy ngay lần execute tiếp theo. KHÔNG cần UI save sub-workflows.
- **Orchestrator PUT BREAKS webhook**: Bất kỳ update nào trong orchestrator (Code, settings, connections) → webhook un-register → 404. Phải UI save lại.
- **Activate/Deactivate cycle không fix** webhook trong cả 2 trường hợp.

## 2026-06-01 update — STALE VERSION + deactivate/activate NAY reload được

Behavior đã đổi (n8n upgrade?) so với note 2026-05-20. Verified trên AI PM orchestrator `hMOE5pwuaYpSKxl2`:
- **Webhook KHÔNG 404 nữa**: nếu path đã register từ UI save trước đó, POST `/webhook/ai-product-manager-trigger` vẫn accept + execute (hang chờ responseNode ~3min).
- **NHƯNG webhook execute STALE workflow definition** sau khi PUT update qua API: PUT đổi cache nodes batchGet→googleSheets, live GET cho thấy googleSheets, nhưng exec qua webhook vẫn chạy version batchGet cũ (cache_warnings báo lỗi của batchGet).
- **FIX 2026-06-01: deactivate + activate qua API ĐÃ reload definition** — exec sau cycle chạy version mới (googleSheets). `POST /api/v1/workflows/{id}/deactivate` rồi `/activate`, sleep 2-3s giữa. Khác hẳn note 2026-05-20 "deactivate/activate không fix".
- **How to apply**: sau khi PUT update orchestrator + muốn webhook-test ngay → BẮT BUỘC deactivate/activate cycle trước khi fire webhook, nếu không sẽ test nhầm version cũ. Schedule cron (production) cũng load version mới sau cycle này.
- **GPT-5 vs gpt-5-mini trong n8n**: GPT-5 là reasoning model — `reasoning_tokens` ăn hết `max_completion_tokens` budget → content rỗng. Pattern Content Manager dùng `gpt-5-mini` (proven). Nếu phải dùng gpt-5, set `max_completion_tokens` rất cao (>8000) hoặc thêm `reasoning_effort: "minimal"` trong request body.

## 2026-06-10 update — n8nctl v0.5.0 `workflow run` = giải pháp firing chính thức

Để **execute/E2E-test** workflow KHÔNG cần webhook register, dùng `n8nctl workflow run <id> [--trigger <node>] --wait` (v0.5.0) — hit `/rest/workflows/{id}/run` (session cookie), **bypass webhook router**. executionId trả ngay, `--wait` poll `/rest/executions`. Đây là cách thay cho "đợi UI Save rồi trigger-webhook". Live-verified trên n8n 1.122.5.

Lưu ý nuance từ POC 2026-06-09 (single-main instance): webhook register THỰC SỰ OK qua Public API trên 1.122.5 single-main (create+activate + update-while-active đều giữ webhook 200) — bug stale-router #21614 chỉ bite trên **queue mode + workflow bị push nhiều lần** (xem [[feedback_n8npc_instance_save_only]]). Với firing, `workflow run` bypass hết. Với webhook INBOUND production khi router stuck → vẫn cần UI Save / restart.


## reference_n8n_internal_rest_run

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Autonomous trigger pattern cho n8n self-hosted khi webhook router stuck — login /rest/login cookie → POST /rest/workflows/{id}/run với workflowData full + triggerToStartFrom. Cross-project portable._

n8n self-hosted instance (đặc biệt queue mode) thường KHÔNG re-register webhook + cron sau khi `n8nctl workflow update` qua API. UI Save là cách official fix nhưng phá rhythm autonomous. Workaround: **internal `/rest/workflows/{id}/run`** = endpoint nút *Execute Workflow* trong UI gọi. Bypass Public API limitation (không có /execute — [PR #20234](https://github.com/n8n-io/n8n/pull/20234) closed) và bypass webhook router stale state ([Issue #21614](https://github.com/n8n-io/n8n/issues/21614)).

## Auth
KHÔNG dùng (n8n api-key header) (trả 401). Cần session cookie:
```
POST /rest/login → {"emailOrLdapLoginId":"<email>","password":"<pw>"}
→ 200 + Set-Cookie n8n-auth=...
```

## Run workflow body (verified 2026-06-09)
```
POST /rest/workflows/{workflow_id}/run
Cookie: n8n-auth=...
{
  "workflowData": <full workflow object from GET /rest/workflows/{id}>,
  "triggerToStartFrom": {"name": "Schedule Trigger"}
}
```
**KHÔNG** include `runData` (n8n nhầm partial execution flow → HTTP 500 "destinationNodeName is required"). `triggerToStartFrom.name` là node NAME, không phải ID. Response async: `{"data":{"executionId":"<id>"}}`.

## Workflow settings ảnh hưởng
`saveManualExecutions: false` → exec không vào /api/v1/executions list. Bật `true` lúc debug.

## Portable assets (cross-project, cross-session)
- **Playbook chi tiết**: `~/.claude/docs/n8n-autonomous-trigger.md` (symptoms checklist + step-by-step + pitfalls)
- **Conditional rule auto-load**: `~/.claude/rules/conditional/n8n-trigger-autonomy.md` (trigger khi user prompt match n8n webhook 404 / can't fire / router stuck patterns)
- **Portable Python client (fallback)**: `~/.claude/scripts/n8n_session.py` (copy vào `<project>/scripts/`, đọc `.n8n-session.env` gitignored)

## Cách dùng cho session khác (PREFERRED — n8nctl ≥ 0.5.0)

n8nctl 0.5.0 đã có verb `workflow run` built-in dùng nguyên endpoint này. KHÔNG cần copy script Python nữa:
```bash
echo "$PW" | n8nctl auth login --session --email <email> --cookie-only
n8nctl workflow run <wf_id> --trigger "<trigger_node_name>" --wait --timeout 480000
n8nctl execution get <exec_id> --logs    # nếu saveManualExecutions=true
```
`--cookie-only` chỉ lưu cookie (~7d), KHÔNG lưu password. Help text cite Issue #21614. Verified 2026-06-10 trên n8npc.khoahrv.id.vn.

## Fallback (n8nctl < 0.5.0 hoặc không có n8nctl)
1. Copy script: `cp ~/.claude/scripts/n8n_session.py <project>/scripts/`
2. Hỏi user UI credentials (politely, gitignored, rotate-able)
3. Tạo `.n8n-session.env` + thêm vào `.gitignore`
4. `python <project>/scripts/n8n_session.py run <workflow_id>` → fire autonomous

Verified trên n8npc.khoahrv.id.vn cho [[project_ai_ceo_diary_fanpage]]. Liên quan [[feedback_n8n_webhook_no_register_via_api]], [[feedback_n8npc_instance_save_only]].


## feedback_ifd_mail_gateway_link_rewrite

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Mail gateway mail.ifd.vn (SMTP it02@ifd.vn) rewrite mọi <a href> link → subdomain tracking url####.ifd.vn bị NXDOMAIN → link chết. Dùng plain-text URL thay clickable link._

# IFD mail gateway rewrite link → chết (url####.ifd.vn NXDOMAIN)

## Triệu chứng
Email gửi qua SMTP IFD (`it02@ifd.vn`, host `mail.ifd.vn`, cred `UXg64lYpntKAwdyf`) có clickable link `<a href="https://...">`. Người nhận click → `This site can't be reached / DNS_PROBE_FINISHED_NXDOMAIN` cho domain `url4643.ifd.vn` (số thay đổi).

## Root cause
Mail gateway mail.ifd.vn có **URL-defense / click-tracking** rewrite mọi `<a href>` outbound → bọc qua subdomain `url####.ifd.vn`. Nhưng subdomain tracking đó **chưa config DNS** → NXDOMAIN → link chết. URL gốc trong source HTML hoàn toàn sạch (đã verify) — rewrite xảy ra ở gateway lúc gửi.

## How to apply (workaround — verified deploy 2026-06-01)
**Dùng plain-text URL thay `<a href>`**: gateway chỉ rewrite `<a href>` tag, KHÔNG đụng plain text. Recipient Gmail tự auto-linkify URL plain text client-side → mở đúng URL thật.

Pattern (AI PM Build Email HTML):
```html
<!-- THAY: <a href="https://docs.google.com/...">📊 View Sheet</a> -->
<div style="font-size:13px;">📊 Full Sheet (copy link để mở):</div>
<div style="font-family:monospace; word-break:break-all;">https://docs.google.com/spreadsheets/d/.../edit#gid=...</div>
```
KHÔNG wrap trong `<a>`. Áp dụng cho MỌI workflow gửi qua SMTP IFD nếu cần link (AI Research, CV Screener, reminders...).

## Fix triệt để (cần IT)
IT tắt URL-tracking/rewrite trên mail.ifd.vn cho it02@ HOẶC config DNS cho subdomain pattern url*.ifd.vn. Sau đó mới dùng lại clickable button đẹp.

## Caveat
Nếu gateway nâng cấp để rewrite CẢ plain-text URL (linkify trước khi gửi) → workaround này fail, chỉ còn IT fix. Verify lại nếu link vẫn chết sau khi đổi plain-text.

## Related
- [[project-n8n-smtp-migration]] (SMTP IFD setup) · [[feedback-ai-pm-email-recipients]] · [[project-ai-product-manager]]


## feedback_self_challenge_workflow_design

<!-- source: build-workflow-ai-training-tracker mtime 2026-07-20 -->
_Khi user yêu cầu build n8n workflow mới, PROACTIVELY tự challenge approach ban đầu với 3 câu hỏi (flaws, edge cases, alternative patterns) trước khi propose final architecture_

Khi user yêu cầu xây dựng n8n workflow mới (hoặc bất kỳ automation/system design lớn nào), sau khi propose kiến trúc ban đầu, phải TỰ CHALLENGE trước khi user phải yêu cầu, theo framework 3 câu hỏi:

1. **Flaws trong approach này là gì?** — Liệt kê cụ thể weakness của design (cost, consistency, scale, privacy, edge cases logic). Không nói chung chung, phải chỉ ra WHY + impact.
2. **Edge cases mình miss?** — Bảng liệt kê 15-20 edge case cụ thể với impact, bao gồm: input format khác, duplicate identity, concurrent run, rate limit, privacy/legal, failure modes.
3. **Pattern khác có tốt hơn không, tại sao?** — So sánh 3-5 alternative patterns. Chỉ rõ trade-off. Recommend pattern tốt nhất kèm bảng so sánh (cost, speed, consistency, privacy, scale).

**Why:** User ngày 2026-04-23 explicit feedback: "Sau khi tôi yêu cầu challenge bạn đã phân tích rất sâu và tốt, nhiều cái tôi chưa có tư duy đến. Cần tiếp tục áp dụng, phát huy và cải thiện". User là AI Engineer có kinh nghiệm → cần partner critical thinking, không muốn approach "safe/default" generic.

**How to apply:**
- Áp dụng ngay sau khi propose architecture sơ bộ, KHÔNG chờ user yêu cầu
- Format: section riêng "Challenge approach này" với 3 subsection (Flaws / Edge cases / Alternative patterns)
- Kết luận bằng recommendation cụ thể + so sánh bảng
- Nếu task đơn giản (utility 1 API call) thì có thể skip framework; nếu task là orchestrator/hub tier hoặc đụng privacy/scale/cost → BẮT BUỘC challenge
- Sau khi user confirm direction mới, mới chuyển sang clarifying questions chi tiết rồi /n8n-build
