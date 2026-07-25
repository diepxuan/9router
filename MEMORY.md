# MEMORY.md - Bộ nhớ Chiến lược 9Router

> Chỉ MAIN SESSION mới được đọc file này. Các session thông thường chỉ ghi vào nhật ký hàng ngày.

---

## 1. Trạng thái dự án

| Thuộc tính | Giá trị |
|------------|---------|
| Kho lưu trữ | `diepxuan/9router` |
| Phiên bản hiện tại | v0.4.66 (29/05/2026) |
| Dashboard | `http://9router.diepxuan.corp:3000/` |
| Triển khai | CapRover (Docker) |

---

## 2. Runtime đặc thù (do Sếp chỉ định)

| Mục | Giá trị / Quyết định |
|-----|---------------------|
| Cổng Proxy | **3000** (Sếp chỉ định 2026-07-21; tài liệu upstream mặc định ghi 20128 — đã đồng bộ) |
| Timeout stall | 30 giây (từ v0.4.66) |
| DATA_DIR | `~/.9router`, fallback khi gặp lỗi EACCES/EPERM |
| SQLite backend | `better-sqlite3` -> `node:sqlite` (Node >= 22.5) -> `sql.js` (cuối cùng) |
| `.git` workspace | Mount `ro` trong môi trường dev — mọi thao tác ghi `.git` cần Sếp phê duyệt (xem `TOOLS.md §13`) |

Mô tả chung về kiến trúc (RTK / Fallback / Multi-account / Format Translation): xem [SOUL.md §4](./SOUL.md#4-chuyên-môn-dự-án).

---

## 3. Provider mới (Tháng 05/2026)

| Provider | Phiên bản |
|----------|-----------|
| Qoder | v0.4.66 |
| Kiro | v0.4.50 |
| xAI Grok | v0.4.58 |
| Xiaomi MiMo | v0.4.12 |
| Azure OpenAI | v0.4.2 |
| Cloudflare Workers AI | v0.4.25 |

Danh sách tổng quan (40+ providers): xem [SOUL.md §4](./SOUL.md#4-chuyên-môn-dự-án) và [TOOLS.md §3](./TOOLS.md#3-providers).

---

## 4. Nợ kỹ thuật (Technical Debt)

| Vấn đề | Trạng thái | Ghi chú |
|-------|--------|-------|
| CHANGELOG bị ngắt quãng | Không còn áp dụng | Fork đã chuyển sang dùng `docs/CUSTOM-FEATURES-MERGE-CHECKLIST.md` làm changelog duy nhất (theo AGENTS.md §7). `CHANGELOG.md` giữ nguyên bản upstream làm tham chiếu. |
| Tài liệu Identity trùng lặp | Đã xử lý (PR #44, 2026-07-21) | PA A single source of truth đã merge. Tổng dòng 956 -> 731 (-23.5%). Xem PR https://github.com/diepxuan/9router/pull/44. |
| Workspace `.git` read-only | Đã ghi nhận (2026-07-21) | `.git` mount `ro` trong môi trường dev hiện tại — mọi thao tác tạo nhánh/commit/cherry-pick cần Sếp phê duyệt. Xem `TOOLS.md §13`. |

---

## 5. Bài học kinh nghiệm

### Tháng 05/2026
- Nén RTK phải kiểm tra kỹ trước khi merge.
- Logic Fallback cần unit test chặt chẽ.
- Xây dựng lại Docker image sau khi thay đổi base image.

### Tháng 04/2026
- Đăng nhập OIDC có thể gây khóa tài khoản — cần chế độ phục hồi.
- Xung đột cổng MITM 443 — phải kill process trước khi khởi động.
- Chế độ Tailscale TUN tốt hơn cho Funnel TLS.

---

*MEMORY.md được cập nhật bởi MAIN SESSION. Các session thông thường không đọc/ghi file này.*

## 6. Cập nhật gần đây

| Ngày | Sự kiện |
|------|---------|
| 2026-07-24 | PR #54: strip 3 Codex builtin tools + MiMo 441 cooldown + error observability (squash-merge) |
| 2026-07-24 | PR #55: fix console-log right panel scroll |
| 2026-07-24 | PR #53: NVIDIA strip unsupported `text` param |
| 2026-07-24 | PR #52: NVIDIA tool_call_id sanitizer + MiniMax tool wrapper (fix 92% + 74% error rate) |
| 2026-07-23 | PR #46 (fork DiepXuan → main), PR #51 (i18n vi combos + RR label) merged |
| 2026-07-23 | Round Robin: key "Vòng tròn" → "Luân phiên" (chuẩn kỹ thuật) theo yêu cầu Sếp |
| 2026-07-23 | vi.json: 196 → 201 keys, không sửa base file (runtime i18n) |
| 2026-07-22 | PR #46 batch 2: drop dead code + wrap hooks + sync docs |
| 2026-07-21 | Tách SOUL/IDENTITY/USER/TOOLS single source of truth (PR #44) |

### Phiên bản sau merge
- main: v0.5.40 + fork layer (commit b88a1ef3, PR #54/#55)
- DiepXuan custom features: 17 manifest features (thêm §23 stripBuiltinTools, §24 MiMo cooldown, §25 observability)
