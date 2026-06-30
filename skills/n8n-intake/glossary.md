# Glossary — Pierre Cardin VN Internal Terms

> Từ điển nội bộ cho `n8n-intake` skill. Khi user paste request có dùng từ lóng/viết tắt/tên người nội bộ, Claude inject file này vào context để hiểu đúng và bỏ qua câu hỏi clarification.
>
> **Cách dùng**: Mỗi khi gặp thuật ngữ mới user phải clarify, add 1 dòng vào section phù hợp. Lần sau Claude tự hiểu.
>
> **Format**: `<từ/viết tắt>` — `<nghĩa đầy đủ>` — `<context khi dùng>`

---

## 1. Tên người & vai trò

> Map nickname → role + bộ phận. Tránh hỏi "anh/chị X là ai".

<!-- Ví dụ:
- **chị Lan** — Marketing Manager — phụ trách content + ads Facebook
- **anh Tùng** — Sales Director — owner quyết định KPI bán hàng
- **sếp Hùng** — CEO — final approver cho workflow ảnh hưởng tài chính
- **chị Hà ODN** — Inventory Manager outlet Đà Nẵng — owner báo cáo size tồn
-->

(Add khi gặp người mới)

---

## 2. Hệ thống & platform nội bộ

> Tên platform team gọi tắt → tên chính thức + auth pattern.

<!-- Ví dụ:
- **Haravan** — Haravan POS/eCommerce — REST API, dùng `Bearer` token, credential `haravan-prod`
- **ABA** — ABA Bank merchant API — webhook + signed payload, credential `aba-merchant`
- **ASIA** — internal ERP "AsiaSoft" — Postgres direct, credential `asia-readonly`
- **Kiotviet** — Kiotviet POS — REST API + retailer code, credential `kiotviet-pcbo`
- **Apify FB** — Apify actors cho Facebook scraping — API key `apify-pierre`
-->

(Add khi gặp hệ thống mới)

---

## 3. Outlet / market codes

> Viết tắt outlet hoặc thị trường → location đầy đủ.

<!-- Ví dụ:
- **HCM** — Outlet TP. Hồ Chí Minh
- **HN** — Outlet Hà Nội
- **ODN** — Outlet Đà Nẵng
- **PCBO** — Pierre Cardin Bồ Tát (flagship store)
- **TH** — thị trường Thái Lan
- **KH** — thị trường Cambodia
- **MM** — thị trường Myanmar
-->

(Add khi gặp outlet/market mới)

---

## 4. Bộ phận / phòng ban

> Viết tắt phòng ban → tên đầy đủ.

<!-- Ví dụ:
- **MKT** — Marketing
- **KT** — Kế toán
- **TMĐT** — Thương mại điện tử (eCommerce team)
- **B2B** — phòng B2B / wholesale
- **VH** — Vận hành (Operations)
- **CSKH** — Chăm sóc khách hàng
-->

(Add khi gặp phòng ban mới)

---

## 5. Channels / groups

> Tên channel team hay nhắc → platform thật + ID/handle.

<!-- Ví dụ:
- **group MKT-Sales** — Zalo nhóm "Marketing & Sales Pierre Cardin VN"
- **#it-alerts** — Slack channel cho IT alerts
- **#kpi-daily** — Slack channel báo cáo KPI sáng
- **mail nhóm BGĐ** — distribution list `bgd@pierrecardin.vn`
-->

(Add khi gặp channel mới)

---

## 6. Workflow nicknames / quy trình thường gọi

> Tên thân mật của workflow → workflow chính thức (project + file).

<!-- Ví dụ:
- **luồng KPI sáng** — `ai-kpi-manager/workflow/orchestrator-daily-kpi.json` (chạy 7h sáng)
- **báo cáo doanh số đêm** — `ai-ads-manager/workflow/utility-revenue-report.json` (chạy 23h)
- **luồng size tồn** — `ai-size-reorder/workflow/hub-size-stock-check.json`
-->

(Add khi gặp tên gọi không chính thức)

---

## 7. Business terminology

> Thuật ngữ kinh doanh nội bộ → giải thích.

<!-- Ví dụ:
- **size còn tồn** — số lượng SKU còn trong outlet, group theo size
- **đơn ghi nợ** — đơn B2B chưa thanh toán, theo dõi qua sheet "Công nợ"
- **báo size về** — quy trình outlet báo size cần nhập từ kho trung tâm
- **chốt đơn cuối ngày** — cron 22h tổng hợp đơn từ Haravan + Kiotviet → Sheet "Daily Orders"
-->

(Add khi gặp thuật ngữ business mới)

---

## Lưu ý maintain

- File này grow theo thời gian — không cần hoàn thiện ngay
- Khi `/n8n-intake` phải hỏi clarification cho 1 thuật ngữ, sau khi user giải thích → user/Claude add vào đây
- Nếu file dài > 500 dòng → split theo section (people.md, systems.md...) và update SKILL.md tương ứng
- KHÔNG put thông tin nhạy cảm: passwords, API tokens, số tài khoản. Chỉ tên/vai trò/credential reference (ví dụ `credential: haravan-prod` chứ không phải token thật).
