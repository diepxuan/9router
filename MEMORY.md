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
| Rate-limit engine (ADR-007) | Đã xóa (PR #68 re-scope, 2026-08-06) | Xóa engine throttle + auto-discovery + `/api/models/limits` + `ModelLimitBadge` + NVIDIA/Kilo limit declarations + 3-tier scope builders. Giữ combo fail tracker + ctx skip + fallback tức thời + response model override. Nếu sau cần throttle, fork lại từ upstream main, không dùng code đã xóa. |
| MiMo free 441 cooldown | Đã xóa (PR #71, 2026-08-06) | Strip `open-sse/diepxuan/executors/mimo-free.js` + `DiepxuanMimoFreeExecutor` + `MIMO_RATE_LIMIT_CODES`. 441 trượt qua upstream parser, combo fallback chain xử lý đồng nhất. Follow-up #2 trong nhật ký 2026-08-06 đã giải quyết. |
| DB cleanup (`rate_limit_counters_diepxuan`/`auto_discovered_limits_diepxuan`) | Đã xóa (PR #70, 2026-08-06) | Schema migration v2 drop 2 bảng qua `src/lib/db/migrations/002-drop-rate-limit-tables.js`. Pre-migration backup tự động qua `migrate.js` (`schemaChanging`). `SCHEMA_VERSION` 1→2. Follow-up #3 trong nhật ký 2026-08-06 đã giải quyết. |
| `diepxuan-feature-flags.test.js` test drift | Đã xử lý (PR #69, 2026-08-06) | Restore `isDiepXuanSafeMode()` trong `flags.js` (function body bị thiếu từ upstream drift) + drop 4 dead tests import `@/diepxuan/usage/index.js` (module không tồn tại) + sửa 3 expected values. Test 7/7 PASS. Follow-up #4 trong nhật ký 2026-08-06 đã giải quyết. |
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
| 2026-08-06 | PR #69 merged (squash `836a908e`): restore `isDiepXuanSafeMode()` trong `flags.js` + drop 4 dead tests (import module không tồn tại) + sửa 3 expected `{skip:true}` → `{skip:true,reason:"fail_count_exceeded"}` khớp comboHooks. `diepxuan-feature-flags.test.js` 7/7 PASS (was 4/11). Follow-up #4 giải quyết. |
| 2026-08-06 | PR #70 merged (squash `982a14c0`): schema migration v2 drop 2 bảng `rate_limit_counters_diepxuan` (436 rows) + `auto_discovered_limits_diepxuan` (4 rows) — orphan từ ADR-007 đã bị strip ở PR #68. Pre-migration backup tự động qua `migrate.js`. Follow-up #3 giải quyết. |
| 2026-08-06 | PR #71 merged (squash `cec2ff8e`): drop MiMo free 441 cooldown — strip `open-sse/diepxuan/executors/mimo-free.js` + manifest entry; 441 giờ trượt qua upstream parser → combo fallback chain xử lý đồng nhất |
| 2026-08-07 | PR #72 merged (squash `12ef887f`): console log request grouping + depth indicator — LiveFallbackChain group theo `requestId`, flatten root+nested thành 1 chain ngang/row, sort newest first (tail-f), `border-l-4 border-l-purple-500` cho model nested. 13 file +1120/-434, 634/634 PASS, 51/51 test PASS. |
| 2026-08-06 | PR #68 merged (squash `5f25a49`): re-scoped combo-only; dropped ADR-007 rate-limit engine (throttle/auto-discovery/api/ui/registry declarations) |
| 2026-07-31 | Context length system: API /api/models/context-lengths, combo ctx skip, ctx badges combo + provider UI, source priority api > static > error, NVIDIA 48 free models |
| 2026-07-30 | Commit series trên basemain: governance, CI/CD, Enhanced Console Log, CLI baseUrl, provider expansion, web combo fallback, response model override, rate-limit engine + wire, sharedDb, context length |
| 2026-07-25 | PR #58: REMOVED wrong wrapToolsForMinimax + dropThinking quirk. Root cause analysis: MiniMax Claude endpoint expects Anthropic-shape tools, not OpenAI-shape. MiniMax docs confirm thinking IS supported. Kept stripBuiltinTools + all other correct fixes. |
| 2026-07-24 | PR #54: strip 3 Codex builtin tools + MiMo 441 cooldown + error observability |
| 2026-07-24 | PR #53: NVIDIA strip unsupported `text` param |
| 2026-07-24 | PR #52: NVIDIA tool_call_id sanitizer (fix 92% NVIDIA error rate) |
| 2026-07-23 | PR #46 (fork DiepXuan → main), PR #51 (i18n vi combos + RR label) merged |
| 2026-07-23 | Round Robin: key "Vòng tròn" → "Luân phiên" (chuẩn kỹ thuật) theo yêu cầu Sếp |
| 2026-07-23 | vi.json: 196 → 201 keys, không sửa base file (runtime i18n) |
| 2026-07-22 | PR #46 batch 2: drop dead code + wrap hooks + sync docs |
| 2026-07-21 | Tách SOUL/IDENTITY/USER/TOOLS single source of truth (PR #44) |

### Phiên bản sau merge
- main: v0.5.40 + fork layer (basemain, 14+ commits custom)
- DiepXuan custom features: 25 manifest features, check script PASS
