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

> Mục đích: chuẩn hoá cách agent phân biệt lệnh read-only, ghi local trong workspace, và ghi cần xin phép Sếp. Tránh tự ý retry khi lệnh fail do sandbox/permission.

### Phạm vi mặc định

- Workspace làm việc: `/data/9router` (worktree rw).
- Thư mục `.git`: mount riêng, có thể là `ro` tuỳ môi trường. Không có quyền ghi `.git` ⇒ không thể tạo nhánh, commit, cherry-pick, rebase local.
- Mọi thao tác ngoài workspace hoặc cần nâng quyền đều thuộc nhóm **cần xin phép Sếp**.

> **Ghi chú ngữ nghĩa:** "lệnh ngoài sandbox" ở đây nghĩa là lệnh vượt quá phạm vi read-only của sandbox (ghi local, network mutation, git write, npm/gh, v.v.) — **vẫn nằm trong `/data/9router` và `/tmp`**, không phải lệnh chạy ra ngoài hai vùng đó.

### Phân nhóm lệnh

**Read-only — chạy luôn, không hỏi:**

- `cat`, `head`, `tail`, `less`, `wc`, `file`, `nl`, `stat` — đọc file.
- `ls`, `find`, `tree`, `du` — duyệt filesystem.
- `grep`, `rg`, `ag`, `awk`, `sed -n` — search/filter.
- `diff`, `cmp` — so sánh file.
- `git status`, `git log`, `git show`, `git diff`, `git branch -a`, `git remote -v`, `git ls-files`, `git ls-tree` — git read-only.
- `curl` GET (không mutate), `node --version` — phi chuẩn.
- `date`, `whoami`, `pwd`, `echo`.

**Ghi local trong workspace `/data/9router` hoặc `/tmp` — chạy luôn (khi `.git` cho phép):**

- `mkdir`, `cp`, `mv`, `sed -i`, `write`, `apply_patch` trong `/data/9router` hoặc `/tmp`.
- `git checkout -b <new-branch>` (local), `git add`, `git commit`, `git mv`.
- `npm run build`, `npm run lint`, `npm test` — khi task yêu cầu.
- `node --check <file>` — cú pháp check.

**Ghi cần xin phép Sếp (chỉ chạy khi có approval rõ ràng):**

- `git push origin <feature-branch>` — chỉ khi Sếp nói "push đi" / "em tạo PR đi".
- `gh pr create`, `gh pr edit`, `gh pr merge <N>`, `gh pr close <N>` — workflow GitHub; chỉ khi Sếp cho lệnh rõ ràng.
  - **Quy tắc merge:** dùng `gh pr merge <N> --repo <owner/repo> --squash --delete-branch` (KHÔNG `git merge` local + `gh pr close` — sẽ mất attribution và audit trail).
- `git push origin main` — push trực tiếp lên main.
- `git reset --hard`, `git checkout -- <file>`, `git clean -fd` — phá dữ liệu local.
- `git push --force`, `git push --force-with-lease` — force push.
- `rm` file lớn, `rm -rf` ngoài `/tmp/` hoặc ngoài workspace.
- Lệnh ghi ra ngoài `/data/9router` và `/tmp/`.
- Lệnh cần network ra ngoài GitHub: `npm install`, `composer install`, `git fetch/pull/push` khi sandbox chặn, gọi API mutation bên ngoài.
- Lệnh mở GUI/browser/app ngoài terminal.
- Migration/write DB ngoài phạm vi task.
- Lệnh start/stop/restart dev server (`npm run start`, `./dev.sh start|stop`) — chỉ khi Sếp yêu cầu rõ ràng.

### Khi lệnh fail do sandbox / network / permission

Quy tắc bắt buộc:

1. **DỪNG**, không tự ý retry bằng cách thêm flag hay né sandbox.
2. **Báo cáo Sếp:** lệnh đã chạy, exit code, stderr/output quan trọng, nghi vấn nguyên nhân.
3. **Sau khi được phép:** chỉ chạy đúng lệnh/phạm vi đã xin. Không dùng approval cho hành động khác rộng hơn.
4. **Báo lại kết quả** sau khi chạy.

### Cách xin phép khi chạy tool — Phương án A (Codex CLI)

Codex CLI là runtime hiện tại của workspace. Mỗi lệnh thuộc nhóm "Ghi cần xin phép Sếp" (xem bảng phân nhóm ở trên) đều phải đi qua approval UI của Codex CLI theo cú pháp:

```
sandbox_permissions: require_escalated
justification:      "Sếp cho phép em chạy '<lệnh chính xác>' ngoài sandbox để <mục đích cụ thể>, không?"
```

Quy tắc:

- `justification` phải nêu đúng **lệnh** sẽ chạy (copy-paste được) và **mục đích** cụ thể trong context task hiện tại.
- Không gộp nhiều lệnh vào 1 justification — mỗi lệnh = 1 lần xin approval riêng.
- Sau khi Sếp duyệt, chỉ chạy đúng lệnh đã xin. Không mở rộng phạm vi, không thêm flag khác.
- Nếu cần thêm lệnh ngoài sandbox, xin approval mới với justification mới.

#### Quy trình 6 bước chuẩn

1. **Xác định lệnh cần escalate** — đối chiếu bảng phân nhóm lệnh ở trên để chắc chắn lệnh thuộc nhóm cần xin phép.
2. **Gọi tool với escalation** — đặt `sandbox_permissions: require_escalated` và viết `justification` theo template.
3. **Chờ Sếp bấm duyệt** trên UI approval của Codex CLI.
4. **Chạy đúng lệnh đã xin** — không thêm flag, không lồng lệnh khác.
5. **Báo cáo Sếp** — lệnh đã chạy, exit code, output ngắn gọn (ví dụ `Cloning into '/tmp/9router'... done., HEAD 89cac0d`).
6. **Nếu cần thêm lệnh ngoài sandbox** (push sau khi đã clone, merge sau khi đã push, v.v.) → quay lại bước 1, xin approval mới.

#### Ví dụ justification cho từng nhóm lệnh

**Nhóm 3.1 — Network ra GitHub (clone/fetch/push, gh CLI, gh api):**

```text
justification: "Sếp cho phép em chạy 'gh repo clone diepxuan/9router /tmp/9router -- --branch disable-self-update-check --depth 50' ngoài sandbox để clone branch feature vào /tmp trước khi viết patch, không?"
justification: "Sếp cho phép em chạy 'gh pr view 43 --repo diepxuan/9router --json title,body,files,reviewDecision' ngoài sandbox để lấy metadata PR trước khi review, không?"
justification: "Sếp cho phép em chạy 'gh pr create --repo diepxuan/9router --base main --head disable-self-update-check --title "<title>" --body "<body>"' ngoài sandbox để tạo PR sau khi Sếp duyệt patch, không?"
justification: "Sếp cho phép em chạy 'gh pr merge 43 --repo diepxuan/9router --squash --delete-branch' ngoài sandbox để squash-merge PR sau khi Sếp duyệt, không?"
justification: "Sếp cho phép em chạy 'git push origin disable-self-update-check' ngoài sandbox để update PR #43 sau khi Sếp duyệt patch, không?"
```

**Nhóm 3.2 — Network ra package registry (composer/npm/pip):**

```text
justification: "Sếp cho phép em chạy 'composer require spatie/laravel-permission --no-interaction' ngoài sandbox để cài package cho task ACL, không?"
justification: "Sếp cho phép em chạy 'npm install <pkg> --save' ngoài sandbox để thêm dependency cho task hiện tại, không?"
justification: "Sếp cho phép em chạy 'pip install -r requirements.txt' ngoài sandbox để cài dependency cho Hermes tool, không?"
```

**Nhóm 3.3 — Phá dữ liệu local / push trực tiếp main / force push:**

```text
justification: "Sếp cho phép em chạy 'git reset --hard <sha>' ngoài sandbox để undo commit lỗi trên branch local, không?"
justification: "Sếp cho phép em chạy 'git push --force-with-lease origin disable-self-update-check' ngoài sandbox để sửa commit message sau khi Sếp duyệt, không?"
```

**Nhóm 3.4 — Start/stop dev server:**

```text
justification: "Sếp cho phép em chạy 'npm run dev' ngoài sandbox để verify UI sau khi sửa component, không?"
justification: "Sếp cho phép em chạy './dev.sh restart' ngoài sandbox để restart service sau khi đổi config upstream check, không?"
```

**Nhóm 3.5 — Ghi ra ngoài workspace Portal:**

```text
justification: "Sếp cho phép em chạy 'mkdir -p /data/9router' ngoài sandbox để tạo worktree cho branch disable-self-update-check, không?"
justification: "Sếp cho phép em chạy 'sudo systemctl restart nginx' ngoài sandbox để reload proxy sau khi đổi config, không?"
```

**Nhóm 3.6 — Mở GUI/browser/app ngoài terminal:**

```text
justification: "Sếp cho phép em chạy 'curl -I http://portal.diepxuan.corp/simba' ngoài sandbox để verify website, không?"
justification: "Sếp cho phép em chạy 'google-chrome http://9router.diepxuan.corp:3000/' ngoài sandbox để mở browser verify UI, không?"
```

#### Bảng tham chiếu nhanh (lệnh ↔ nhóm ↔ justification skeleton)

| Lệnh mẫu                                       | Nhóm  | Justification skeleton                                                                  |
| ---------------------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| `gh repo clone <o>/<r> /tmp/<r> -- --depth 50` | 3.1   | để clone repo `<o>/<r>` branch `<b>` vào `/tmp/<r>` cho task `<task>`                   |
| `git fetch origin` / `git pull --ff-only`      | 3.1   | để fetch/pull branch `<b>` từ remote cho task `<task>`                                  |
| `git push origin <branch>`                     | 3.1   | để push branch `<branch>` lên remote sau khi Sếp duyệt patch                            |
| `gh pr view <N> --repo <o>/<r> --json ...`     | 3.1   | để xem metadata PR #`<N>` trước khi review                                              |
| `gh pr create / edit / merge / close`          | 3.1   | để tạo/sửa/merge/close PR #`<N>` sau khi Sếp duyệt                                      |
| `gh api ...`                                   | 3.1   | để gọi API mutation trên `<o>/<r>` cho task `<task>`                                     |
| `composer require <pkg>`                       | 3.2   | để cài package `<pkg>` cho task `<task>`                                                |
| `npm install <pkg>` / `npm install`            | 3.2   | để cài dependency cho task `<task>`                                                     |
| `pip install ...`                              | 3.2   | để cài dependency cho Hermes tool                                                       |
| `git reset --hard` / `git clean -fd`           | 3.3   | để undo / dọn local cho task `<task>`                                                   |
| `git push origin main`                         | 3.3   | để push thẳng main (chỉ khi Sếp duyệt riêng)                                            |
| `git push --force[-with-lease]`                | 3.3   | để force-push branch `<b>` sau khi Sếp duyệt                                            |
| `npm run dev` / `npm start` / `./dev.sh ...`   | 3.4   | để start/stop/restart dev server khi verify task `<task>`                                |
| `mkdir / cp / chmod / sudo ...` ngoài `/data`  | 3.5   | để ghi `<path>` ngoài workspace cho task `<task>`                                        |
| `google-chrome / firefox / xdg-open`           | 3.6   | để mở GUI/browser verify task `<task>`                                                  |

> Token GitHub hiện hết hạn 2024-03-14 — phần lớn lệnh nhóm 3.1 sẽ fail `authentication failed`. Sếp cần cấp token mới qua channel riêng trước khi em chạy các lệnh đó.

### Phương án B — Runtime khác (OpenClaw / Hermes / không rõ)

Khi runtime **không phải** Codex CLI (ví dụ chạy dưới OpenClaw gateway, Hermes, hoặc runtime không nhận diện được):

- **OpenClaw gateway:** cần Sếp xác nhận cú pháp escalation. Em đoán có thể là `openclaw exec --require-approval --cmd "<cmd>"` hoặc qua gateway API. **Em không tự chạy thử** — báo Sếp xác nhận syntax trước.
- **Hermes:** kiểm tra `hermes --help` xem có flag `--require-approval` / `--escalate` không. **Em không tự chạy thử** — báo Sếp.
- **Không rõ runtime:**
  - **Phương án C** — Sếp chuyển em sang máy có network (hoặc cấp network egress).
  - **Phương án D** — Sếp chạy tay trên máy Sếp, paste output về cho em để xử lý tiếp.

Quy tắc chung khi runtime lạ:

1. DỪNG — không tự đoán cú pháp, không tự chạy thử để "xem có hoạt động không".
2. Báo cáo Sếp — kèm thông tin runtime em đang chạy (nếu biết) và lệnh cần thực thi.
3. Chờ Sếp xác nhận cú pháp escalation hoặc chọn Phương án C / D.
4. Sau khi Sếp cho phép, chạy đúng phạm vi đã xin, không mở rộng.

## 14. Khi nào PHẢI escalate ngay (không chờ lệnh fail)

| Tình huống                                     | Hành động                      |
| ---------------------------------------------- | ------------------------------ |
| `.git` không thể ghi (zfs `ro`, lock, ...)     | Báo Sếp ngay, không tự remount |
| Proxy ngừng hoạt động > 5 phút                 | Báo Sếp NGAY                   |
| Token / API key lộ / commit nhầm secret        | Báo Sếp NGAY, rollback ngay    |
| Lỗi ảnh hưởng > 1 người dùng                   | Báo Sếp NGAY                   |
| Trước khi push lên `main` / merge / force-push | Xin phép rõ ràng               |
| Trước khi xoá nhánh đã có trên remote          | Xin phép rõ ràng               |
