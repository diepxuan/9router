# TOOLS.md - 9Router Dev Quick Reference

> Tài liệu tham chiếu nhanh cho dev khi làm việc với fork `diepxuan/9router`.
> Quy trình làm việc đầy đủ xem `AGENTS.md`. Bộ nhớ chiến lược xem `MEMORY.md`.
> Checklist rebase upstream xem `docs/CUSTOM-FEATURES-MERGE-CHECKLIST.md`.

---

## 1. Môi trường (Development)

- **Workspace:** `/root/.openclaw/workspace/projects/9router/`
- **Dashboard:** `http://9router.diepxuan.corp:3000/`
- **Cổng Proxy:** `3000` (chỉ định bởi Sếp, 2026-07-21)
- **Node:** v22.22.2

## 2. Thư mục chính (Key Directories)

| Path                | Mô tả                                             |
| ------------------- | ------------------------------------------------- |
| `src/`              | Source code                                       |
| `src/app/api/`      | API routes (proxy, providers)                     |
| `src/diepxuan/`     | Fork extension layer (custom feature của fork)    |
| `open-sse/`         | SSE engine (base + `open-sse/diepxuan/` cho fork) |
| `docs/`             | Tài liệu (UPDATE-_.md, CUSTOM-FEATURES-_.md)      |
| `scripts/diepxuan/` | Script kiểm tra custom feature sau rebase         |

## 3. Providers

- **Auth profile trong openclaw:** `9router`
- **Base URL:** `http://9router.diepxuan.corp:3000/v1`
- **Models:** openclaw-coder, openclaw-data, openclaw-free

## 4. Cơ sở dữ liệu (Database)

- SQLite: `better-sqlite3` (chính), `sql.js` (fallback)
- Runtime-generated, **không commit**
- `DATA_DIR` mặc định: `~/.9router`

## 5. Triển khai (Deployment)

- Docker + CapRover
- File cấu hình: `captain-definition`, `diepxuan.config.mjs`
- Đồng bộ runtime về host: `bash scripts/sync.sh`

## 6. Kiểm thử (Testing)

| Mục tiêu        | Cách kiểm                                         |
| --------------- | ------------------------------------------------- |
| RTK compression | Verify không mất context, nén chính xác tuyệt đối |
| Fallback        | Provider fail → next provider, không gián đoạn    |
| Quota           | Tracking chính xác, auto-refresh đúng timing      |
| Multi-account   | Round-robin phân phối đều                         |

## 7. Build & verify sau mỗi thay đổi

```bash
# 1. Kiểm tra custom feature còn nguyên (chạy nhanh, ~5s)
node scripts/diepxuan/check-custom-features.mjs

# 2. Production build (chạy ~3-5 phút, bắt lỗi import runtime)
npm run build

# Cả hai phải PASS trước khi push.
```

Script check manifest dựa trên `docs/custom-features.manifest.json` — 11 features, 314+ check, gồm:

- File tồn tại / pattern xuất hiện
- `node --check` syntax
- Phát hiện conflict marker còn sót sau rebase

## 8. Rebase upstream (master)

Mỗi lần upstream `decolua/9router` master có commit mới:

```bash
# 1. Fetch và rebase feature branch
git fetch upstream
git rebase upstream/master

# 2. Nếu có conflict, ưu tiên giữ base upstream, chỉ merge thủ công phần hook
#    (xem AGENTS.md §3 và CUSTOM-FEATURES-MERGE-CHECKLIST.md)

# 3. Sau rebase, chạy verify
node scripts/diepxuan/check-custom-features.mjs
npm run build
```

Nếu script báo FAIL, **dừng lại**, phân tích root cause, không push cho tới khi fix.

## 9. Smoke runtime (sau khi cần xác nhận sâu)

Chỉ chạy khi build PASS nhưng nghi ngờ hook runtime hỏng:

```bash
npm run start &                                     # Khởi động server
curl -sS http://9router.diepxuan.corp:3000/api/health
curl -sS http://9router.diepxuan.corp:3000/api/v1/models | jq .
```

Port chuẩn local: `3000`. Override bằng `PORT=<...>` nếu cần.

Smoke test theo feature: xem `docs/CUSTOM-FEATURES-MERGE-CHECKLIST.md` mục 11.

## 10. Commit & Push

Theo `AGENTS.md` §3 + `.git-checklist.md`:

- Mỗi task = 1 branch = 1 PR. Tên branch: `task/<short-desc>` hoặc `fix/<short-desc>`.
- **Không** push trực tiếp lên `main` hoặc `master`.
- **Không** tạo PR lên `decolua/9router` (upstream) — chỉ lên fork `diepxuan/9router`.
- **Không** `git commit --amend` sau khi push — tạo commit mới.
- **Không** force push khi chưa hỏi Sếp.
- Sau khi Sếp merge PR: cleanup local branch đã lỗi thời.

Trước khi push:

```bash
git status --short --branch
git diff --cached
git log --oneline -5
```

## 11. Khi nào tạo tài liệu

Theo `AGENTS.md` §7, tạo hoặc cập nhật `docs/UPDATE-YYYY-MM-DD.md` khi:

- Thêm provider mới.
- Thay đổi logic nén RTK.
- Sửa fallback routing.
- Thay đổi dashboard UI đáng kể.
- Sửa lỗi ảnh hưởng đến proxy / token savings.

Đồng thời cập nhật `CHANGELOG.md` cho mọi thay đổi.

## 12. Tham chiếu (Reference)

| File                                      | Mục đích                                       |
| ----------------------------------------- | ---------------------------------------------- |
| `AGENTS.md`                               | Giao thức làm việc, boot sequence, kỷ luật Git |
| `MEMORY.md`                               | Bộ nhớ chiến lược dài hạn (chỉ MAIN SESSION)   |
| `AGENT_WORKSPACE.md`                      | Quick reference workspace                      |
| `SOUL.md`                                 | Bản sắc cốt lõi                                |
| `IDENTITY.md`                             | Con trỏ định danh + cấu hình                   |
| `USER.md`                                 | Hồ sơ Sếp                                      |
| `docs/CUSTOM-FEATURES-MERGE-CHECKLIST.md` | Checklist rebase upstream, manifest script     |
| `CHANGELOG.md`                            | Lịch sử phiên bản                              |
| `DOCKER.md`                               | Hướng dẫn Docker                               |
| `README.md`                               | Giới thiệu dự án                               |
| `memory/YYYY-MM-DD.md`                    | Nhật ký hàng ngày                              |


## 13. Sandbox & Escalation

> Chuẩn hoá cách agent phân biệt lệnh read-only, ghi local trong workspace, và ghi cần xin phép Sếp. Tránh tự ý retry khi lệnh fail do sandbox/permission.

### Phạm vi mặc định

- Workspace: `/data/9router` (worktree rw).
- `.git`: mount riêng, có thể `ro` tuỳ môi trường -> không thể tạo nhánh / commit / cherry-pick / rebase local.
- "Lệnh ngoài sandbox" = lệnh vượt phạm vi read-only (ghi local, network mutation, git write, npm/gh...). Vẫn nằm trong `/data/9router` hoặc `/tmp`.

### Phân nhóm lệnh

**Read-only — chạy luôn, không hỏi:**

- `cat`, `head`, `tail`, `less`, `wc`, `file`, `nl`, `stat` — đọc file.
- `ls`, `find`, `tree`, `du` — duyệt filesystem.
- `grep`, `rg`, `ag`, `awk`, `sed -n` — search/filter.
- `diff`, `cmp` — so sánh.
- `git status`, `git log`, `git show`, `git diff`, `git branch -a`, `git remote -v`, `git ls-files`, `git ls-tree` — git read-only.
- `curl` GET (không mutate), `node --version` — phi chuẩn.
- `date`, `whoami`, `pwd`, `echo`.

**Ghi local trong `/data/9router` hoặc `/tmp` — chạy luôn (khi `.git` cho phép):**

- `mkdir`, `cp`, `mv`, `sed -i`, `write`, `apply_patch` trong workspace.
- `git checkout -b <new-branch>` (local), `git add`, `git commit`, `git mv`.
- `npm run build`, `npm run lint`, `npm test`, `node --check <file>`.

**Ghi cần xin phép Sếp (chỉ chạy khi có approval rõ ràng):**

- `git push origin <feature-branch>` — chỉ khi Sếp nói "push đi" / "em tạo PR đi".
- `gh pr create`, `gh pr edit`, `gh pr merge <N>`, `gh pr close <N>` — workflow GitHub.
  - **Quy tắc merge:** `gh pr merge <N> --repo <owner/repo> --squash --delete-branch` (KHÔNG `git merge` local + `gh pr close` — mất attribution).
- `git push origin main` — push trực tiếp main.
- `git reset --hard`, `git checkout -- <file>`, `git clean -fd` — phá dữ liệu local.
- `git push --force`, `git push --force-with-lease` — force push.
- `rm` file lớn, `rm -rf` ngoài `/tmp/` hoặc workspace.
- Lệnh ghi ra ngoài `/data/9router` và `/tmp/`.
- Lệnh cần network ra ngoài GitHub: `npm install`, `composer install`, `git fetch/pull/push` khi sandbox chặn, gọi API mutation.
- Lệnh mở GUI/browser/app ngoài terminal.
- Migration/write DB ngoài phạm vi task.
- Lệnh start/stop/restart dev server (`npm run start`, `./dev.sh start|stop`) — chỉ khi Sếp yêu cầu rõ ràng.

### Khi lệnh fail do sandbox / network / permission

1. **DỪNG**, không tự ý retry bằng cách thêm flag hay né sandbox.
2. **Báo cáo Sếp:** lệnh đã chạy, exit code, stderr/output quan trọng, nghi vấn nguyên nhân.
3. **Sau khi được phép:** chỉ chạy đúng lệnh/phạm vi đã xin. Không dùng approval cho hành động khác rộng hơn.
4. **Báo lại kết quả** sau khi chạy.

### Cách xin phép — Phương án A (Codex CLI)

Codex CLI là runtime hiện tại. Mỗi lệnh thuộc nhóm "Ghi cần xin phép" đi qua approval UI theo cú pháp:

```text
sandbox_permissions: require_escalated
justification:      "Sếp cho phép em chạy '<lệnh chính xác>' ngoài sandbox để <mục đích cụ thể>, không?"
```

Quy tắc:

- `justification` phải nêu đúng **lệnh** sẽ chạy (copy-paste được) và **mục đích** cụ thể trong context task.
- Mỗi lệnh = 1 lần xin approval riêng. Không gộp nhiều lệnh.
- Sau khi Sếp duyệt, chỉ chạy đúng lệnh đã xin. Không mở rộng phạm vi, không thêm flag.
- Cần thêm lệnh ngoài sandbox -> xin approval mới.

Quy trình 6 bước:

1. Đối chiếu bảng phân nhóm để xác nhận lệnh thuộc nhóm cần xin phép.
2. Gọi tool với `sandbox_permissions: require_escalated` + `justification` theo template.
3. Chờ Sếp duyệt trên UI approval.
4. Chạy đúng lệnh đã xin — không thêm flag, không lồng lệnh khác.
5. Báo cáo Sếp — lệnh đã chạy, exit code, output ngắn gọn.
6. Cần thêm lệnh ngoài sandbox -> quay lại bước 1.

Ví dụ justification:

```text
justification: "Sếp cho phép em chạy 'git push origin docs/identity-audit' ngoài sandbox để push nhánh audit identities lên fork diepxuan/9router, không?"

justification: "Sếp cho phép em chạy 'gh pr merge 44 --repo diepxuan/9router --squash --delete-branch' ngoài sandbox để squash-merge PR #44 sau khi Sếp duyệt, không?"
```

### Phương án B — Runtime khác (OpenClaw / Hermes / không rõ)

Khi runtime **không phải** Codex CLI:

- **OpenClaw gateway:** cần Sếp xác nhận cú pháp escalation. Em không tự đoán, không tự chạy thử.
- **Hermes:** kiểm tra `hermes --help` xem có flag `--require-approval` / `--escalate` không.
- **Không rõ runtime:** Phương án C (chuyển sang máy có network) hoặc D (Sếp chạy tay, paste output về).

Quy tắc: DỪNG -> báo cáo Sếp kèm runtime + lệnh -> chờ Sếp xác nhận cú pháp hoặc chọn C/D -> chạy đúng phạm vi đã xin.

> Khi lệnh nhóm 3.1 fail bằng `authentication failed`, kiểm tra `gh auth status` và xin Sếp cấp lại token qua channel riêng.

## 14. Khi nào PHẢI escalate ngay (không chờ lệnh fail)

| Tình huống | Hành động |
| ---------------------------------------------- | ------------------------------ |
| `.git` không thể ghi (zfs `ro`, lock, ...)     | Báo Sếp ngay, không tự remount |
| Proxy ngừng hoạt động > 5 phút                 | Báo Sếp NGAY                   |
| Token / API key lộ / commit nhầm secret        | Báo Sếp NGAY, rollback ngay    |
| Lỗi ảnh hưởng > 1 người dùng                   | Báo Sếp NGAY                   |
| Trước khi push lên `main` / merge / force-push | Xin phép rõ ràng               |
| Trước khi xoá nhánh đã có trên remote          | Xin phép rõ ràng               |
