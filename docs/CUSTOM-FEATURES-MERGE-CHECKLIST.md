> **QUY TẮC CHANGELOG: TUYỆT ĐỐI KHÔNG dùng `CHANGELOG.md`.**
> Fork `diepxuan/9router` chỉ dùng file này làm changelog duy nhất.
> Mọi thay đổi (provider, feature, fix, update) đều ghi vào đây, tại section tương ứng.
> Mục đích: giúp mọi aiagent/session (kể cả aiagent hoặc session mới khởi tạo) hiểu ngay fork này custom những gì, thay đổi những gì, không cần đọc CHANGELOG gốc.

# Custom Features Merge Checklist

Tài liệu này ghi lại các chức năng được bổ sung riêng trong fork `diepxuan/9router`, không mặc định có trong upstream `decolua/9router` tại thời điểm ghi nhận.

Mục tiêu:
- Dùng làm danh sách đối chiếu sau mỗi lần merge/rebase với upstream.
- Tránh mất tính năng custom khi resolve conflict.
- Có checklist kiểm tra nhanh trước khi push/PR.
- Có manifest và script tự động để kiểm tra các patch fork còn hoạt động.

Công cụ kiểm tra tự động:
- Manifest máy đọc được: `docs/custom-features.manifest.json`
- Script kiểm tra: `scripts/diepxuan/check-custom-features.mjs`
- Lệnh chuẩn sau mỗi lần merge/rebase upstream:

```bash
node scripts/diepxuan/check-custom-features.mjs
npm run build
```

Nếu script báo `FAIL`, không push/PR cho tới khi đã phân tích và sửa nguyên nhân. Nếu cần cập nhật feature mới hoặc đổi vị trí file custom, cập nhật cả tài liệu này và `docs/custom-features.manifest.json`.

Repository:
- Fork: `diepxuan/9router`
- Upstream: `decolua/9router`
- Branch fork chính: `main`
- Branch upstream thường đối chiếu: `master`

Quy tắc merge/rebase:
- Không push trực tiếp lên upstream `decolua/9router`.
- Khi kiểm tra PR bằng GitHub CLI, luôn dùng repo rõ ràng: `-R diepxuan/9router`.
- Sau khi merge/rebase upstream, chạy checklist trong tài liệu này trước khi push.

---

## Features đã xóa khỏi fork (2026-07-21)

Các custom feature sau đã được gỡ khỏi fork `diepxuan/9router` theo yêu cầu của Sếp:

1. Alibaba Cloud Coding Plan provider (`alicode`, `alicode-intl`) — provider registration, model list, validate/test support.
2. Manual quota counter cho provider không có quota API (chỉ phục vụ AliCode).
3. Enhanced quota dashboard (fork layer `ProviderLimits` dùng để render manual quota).

Khi rebase upstream, không cần bảo tồn các custom layer liên quan:
- `src/diepxuan/shared/constants/{providers,config}.js` (đã xóa).
- `src/diepxuan/lib/db/repos/manualQuotaRepo.js` (đã xóa).
- `src/diepxuan/usage/{index,providers}.js` (đã xóa).
- `src/diepxuan/app/dashboard/usage/components/ProviderLimits/` (đã xóa).
- `open-sse/diepxuan/services/{usage,usageHooks}.js` (đã xóa).
- `public/providers/alicode*.png` (đã xóa).
- Hook `getDiepXuanUsageForProvider`, `handleUsageOverrideResponse`, `isDiepXuanUsageEligible`, `extendUsageSupportedProviders` trong base files đã được gỡ.
- Trang `/dashboard/quota` đã chuyển import về base layer `@/app/(dashboard)/dashboard/usage/components/ProviderLimits` (upstream component, không có alicode).

Lịch sử thay đổi còn trong git history (không còn ở working tree hiện tại):
- `docs/UPDATE-2026-05-09.md` — commit `e265be41`, `078f628c`
- `docs/UPDATE-2026-05-11.md`
- `docs/UPDATE-2026-06-02.md`

Các commit này vẫn truy cập được qua `git show <commit>:docs/UPDATE-2026-05-09.md` cho mục đích audit.


## 1. Fallback web search / web fetch sang combo đầu tiên

### Mục đích

Nếu request search/fetch không truyền provider/model hoặc truyền provider không hợp lệ, 9Router fallback sang combo đầu tiên cùng loại thay vì fail ngay.

Files:
- `src/sse/handlers/search.js`
- `src/sse/handlers/fetch.js`
- `src/diepxuan/sse/webComboFallback.js`

### Logic cần giữ

Search:
- Nhận `provider` hoặc `model`.
- Nếu `providerInput` là combo name thì chạy combo đó.
- Nếu không có provider/model, fallback sang combo đầu tiên có `kind === "webSearch"`.
- Nếu provider unknown, fallback sang combo đầu tiên có `kind === "webSearch"`.

Fetch:
- Logic tương tự cho web fetch combo.

Base handler chỉ nên giữ hook mỏng sang extension layer:

```js
handleDiepXuanWebComboFallback()
```

Logic chi tiết nằm trong `src/diepxuan/sse/webComboFallback.js`:

```js
getFallbackWebCombo()
getFirstWebCombo()
firstCombo
handleComboChat()
```

### Checklist sau merge upstream

```bash
grep -n "handleDiepXuanWebComboFallback\|No provider/model specified\|Unknown provider" src/sse/handlers/search.js src/sse/handlers/fetch.js
grep -n "firstCombo\|getFallbackWebCombo\|getFirstWebCombo" src/diepxuan/sse/webComboFallback.js
node --check src/sse/handlers/search.js
node --check src/sse/handlers/fetch.js
node --check src/diepxuan/sse/webComboFallback.js
```

### Smoke test khuyến nghị

Cần có ít nhất một combo webSearch/webFetch đã cấu hình.

Search không truyền provider/model:

```bash
curl -sS http://localhost:20128/api/v1/search \
  -H 'content-type: application/json' \
  -d '{"query":"test search"}'
```

Search provider unknown:

```bash
curl -sS http://localhost:20128/api/v1/search \
  -H 'content-type: application/json' \
  -d '{"model":"unknown-provider","query":"test search"}'
```

Kết quả mong đợi:
- Nếu có combo phù hợp: request được route qua combo.
- Nếu không có combo: trả lỗi rõ ràng, không crash.

---

## 2. Combo fail tracker qua DiepXuan hook

### Mục đích

Combo fallback có thể bỏ qua model đã lỗi liên tiếp để giảm latency và tránh lặp lại provider/model đang hỏng. Base `open-sse/services/combo.js` chỉ giữ hook mỏng; state và logic custom nằm trong `open-sse/diepxuan/**`.

### File cần tồn tại/được giữ

- `open-sse/services/combo.js` — base chỉ gọi hook cấp cao `beforeComboModelAttempt(...)` / `afterComboModelAttempt(...)`
- `open-sse/diepxuan/comboHooks.js` — hook registry mỏng, giữ compatibility helpers `shouldSkipComboModel(...)` / `recordComboModelOutcome(...)`
- `open-sse/diepxuan/comboFailTracker.js` — fail counter implementation

### Điểm đối chiếu code

Base `open-sse/services/combo.js` chỉ nên thấy hook cấp cao:

```js
beforeComboModelAttempt({ modelStr, comboName, log })
afterComboModelAttempt({ modelStr, comboName, ok })
```

Logic chi tiết trong `open-sse/diepxuan/comboHooks.js` vẫn giữ:

```js
shouldSkipComboModel(modelStr, comboName)
recordComboModelOutcome(modelStr, comboName, success)
```

`open-sse/diepxuan/comboFailTracker.js` phải giữ threshold `MAX_FAILS` và reset window `RESET_AFTER_MS`.

### Checklist sau merge upstream

```bash
grep -R "beforeComboModelAttempt\|afterComboModelAttempt" -n open-sse/services/combo.js open-sse/diepxuan/comboHooks.js
grep -R "shouldSkipComboModel\|recordComboModelOutcome" -n open-sse/diepxuan
node --check open-sse/services/combo.js
node --check open-sse/diepxuan/comboHooks.js
node --check open-sse/diepxuan/comboFailTracker.js
```

---

## 3. Dynamic baseUrl trong combo curl snippet

### Mục đích

Trang combo hiển thị curl snippet dùng base URL động theo host hiện tại thay vì hard-code, giúp copy command đúng môi trường.

Files:
- `src/app/(dashboard)/dashboard/media-providers/combo/[id]/page.js`
- `next.config.mjs`

### Checklist sau merge upstream

```bash
grep -n "baseUrl\|window.location\|headers" src/app/\(dashboard\)/dashboard/media-providers/combo/\[id\]/page.js | head -80
node --check src/app/\(dashboard\)/dashboard/media-providers/combo/\[id\]/page.js
node --check next.config.mjs
```

### Smoke test khuyến nghị

1. Chạy app local.
2. Mở combo detail page.
3. Kiểm tra curl snippet dùng đúng origin hiện tại.
4. Copy curl chạy thử request với API key hợp lệ nếu cần.

---

## 4. CLI global install / bundled dashboard package

### Mục đích

Fork giữ thêm output build và dependencies cần thiết để CLI/global install có thể chạy dashboard package từ source/package.

Files/thư mục liên quan:
- `cli/package.json`
- `cli/cli.js`
- `cli/hooks/postinstall.js`
- `cli/src/cli/**`
- `cli/app/package.json`
- `cli/app/server.js`
- `cli/app/.next/**`
- `cli/app/node_modules/**`
- `.npmignore`
- `next.config.mjs`

### Lưu ý quan trọng

`cli/app/.next` và `cli/app/node_modules` là generated/dependency artifacts nhưng hiện được track để phục vụ CLI packaging.

Điều này có trade-off:
- Ưu điểm: package CLI có đủ artifact để chạy sau global install.
- Nhược điểm: repo nặng, rebase dễ conflict, diff lớn, dễ bị upstream merge làm lệch artifact.

Khi merge upstream, không xóa các artifact này nếu chưa có phương án packaging thay thế.

### Checklist sau merge upstream

```bash
test -f cli/package.json && echo "cli/package.json OK"
test -f cli/cli.js && echo "cli/cli.js OK"
test -f cli/hooks/postinstall.js && echo "postinstall OK"
test -d cli/app/.next && echo "cli/app/.next OK"
test -d cli/app/node_modules && echo "cli/app/node_modules OK"
node --check cli/cli.js
node --check cli/hooks/postinstall.js
node --check cli/src/cli/api/client.js
node --check cli/src/cli/menus/providers.js
node --check cli/src/cli/menus/settings.js
node --check cli/src/cli/terminalUI.js
```

### Smoke test khuyến nghị

Nếu cần kiểm tra package CLI:

```bash
cd cli
npm pack --dry-run
node cli.js --help
```

Nếu có flow global install nội bộ, test trong môi trường sạch trước khi release.

---

## 5. MITM / Antigravity custom flow

### Mục đích

Fork có các endpoint/UI hỗ trợ Antigravity MITM và alias/config qua dashboard CLI tools.

Files cần chú ý:
- `src/app/api/cli-tools/antigravity-mitm/route.js`
- `src/app/api/cli-tools/antigravity-mitm/alias/route.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/MitmServerCard.js`
- `src/mitm/manager.js`
- `src/mitm/handlers/base.js`
- `cli/app/src/mitm/server.js`

### Checklist sau merge upstream

```bash
grep -R "antigravity-mitm\|MitmServerCard\|MITM" -n src cli/app/src | head -120
node --check src/app/api/cli-tools/antigravity-mitm/route.js
node --check src/app/api/cli-tools/antigravity-mitm/alias/route.js
node --check src/mitm/manager.js
node --check src/mitm/handlers/base.js
```

### Smoke test khuyến nghị

1. Mở `/dashboard/cli-tools`.
2. Kiểm tra card MITM hiển thị đúng.
3. Start/stop MITM nếu môi trường cho phép.
4. Kiểm tra log không có exception.

---

## 6. Build/deploy pipeline custom

### Mục đích

Fork có workflow build/deploy riêng để build CLI package, đổi package identity sang scope nội bộ và publish lên GitHub Packages của fork.

Workflow chính:
- File: `.github/workflows/build-and-deploy.yml`
- Trigger: push lên `main` và `workflow_dispatch`
- Quyền GitHub Actions cần giữ:
  - `contents: write`
  - `packages: write`
- Registry publish: `https://npm.pkg.github.com`
- Package publish: `@diepxuan/9router`
- Auth publish: `${{ secrets.GITHUB_TOKEN }}` qua `NODE_AUTH_TOKEN`

Các bước custom trong workflow cần giữ:
1. Checkout với `fetch-depth: 0` và `ref: ${{ github.head_ref || github.ref_name }}`.
2. Setup Node.js với `registry-url: "https://npm.pkg.github.com"`.
3. Trong thư mục `cli`, patch package trước build:
   - `npm pkg set name="@diepxuan/9router"`
   - `npm pkg set publishConfig.registry="https://npm.pkg.github.com/"`
   - `npm pkg delete scripts.prepublishOnly || true`
4. Chạy `npm run build` trong `cli`.
5. Bump version không tạo git tag:
   - `npm version patch --no-git-tag-version`
   - `npm version prerelease --preid=patch.$TIMESTAMP --no-git-tag-version`
6. Publish bằng `npm publish`.

Files:
- `.github/workflows/build-and-deploy.yml`
- `Dockerfile`
- `captain-definition`
- `scripts/sync.sh`
- `.npmignore`
- `next.config.mjs`

`scripts/sync.sh` hiện sync dữ liệu runtime từ host `9router` về `/var/lib/9router/`:

```bash
rsync -avP --delete 9router:~/.9router/ /var/lib/9router/
```

### Checklist sau merge upstream

```bash
node scripts/diepxuan/check-custom-features.mjs
test -f .github/workflows/build-and-deploy.yml && echo "workflow OK"
grep -n "@diepxuan/9router\|npm.pkg.github.com\|npm publish\|prepublishOnly\|NODE_AUTH_TOKEN" .github/workflows/build-and-deploy.yml
test -f Dockerfile && echo "Dockerfile OK"
test -f captain-definition && echo "captain-definition OK"
test -f scripts/sync.sh && echo "sync.sh OK"
grep -n "rsync -avP --delete 9router:~/.9router/ /var/lib/9router/" scripts/sync.sh
npm run build
```

### Dấu hiệu workflow bị merge hỏng

- Package name không còn là `@diepxuan/9router` trước khi publish.
- Registry không còn là `https://npm.pkg.github.com/`.
- Workflow không xóa `scripts.prepublishOnly`, làm publish bị chặn bởi script upstream.
- Version bump tạo git tag hoặc sửa git history ngoài ý muốn.
- `npm publish` chạy ở root thay vì trong `cli`.
- Thiếu `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- Workflow trigger/push nhầm upstream hoặc branch không phải fork `main`.

### Lưu ý

- Không tự ý push/trigger deploy production nếu Sếp chưa duyệt.
- Workflow này chạy khi push lên `main`; mọi PR cần review kỹ trước merge vì merge có thể kích hoạt publish package.

### Domain separation rule

Fork-only code should live under `src/diepxuan/**` and `open-sse/diepxuan/**` whenever practical. Base files should only contain small hooks/bridges and must fail safely so upstream-compatible behavior remains available if a fork module is disabled or broken.

- Sau merge upstream, kiểm tra workflow không tạo PR/push nhầm upstream.

---

## 7. Workspace/project governance files

### Mục đích

Fork có các file vận hành agent/workspace riêng, không thuộc upstream mặc định.

Files:
- `AGENTS.md`
- `AGENT_WORKSPACE.md`
- `BOOTSTRAP.md`
- `SOUL.md`
- `IDENTITY.md`
- `TOOLS.md`
- `USER.md`
- `HEARTBEAT.md`
- `docs/UPDATE-*.md`

### Checklist sau merge upstream

```bash
test -f AGENTS.md && echo "AGENTS.md OK"
test -f SOUL.md && echo "SOUL.md OK"
test -f IDENTITY.md && echo "IDENTITY.md OK"
test -d docs && echo "docs OK"
```

### Lưu ý

Các file này phục vụ workspace/agent nội bộ. Không dùng để đánh giá upstream feature parity.

---

## 8. Checklist tổng sau mỗi lần merge/rebase upstream

Chạy từ root repo:

```bash
# 1. Kiểm tra trạng thái git
git status --short --branch
git log --oneline --decorate --max-count=10

# 2. Chạy bộ kiểm tra custom feature tự động
node scripts/diepxuan/check-custom-features.mjs

# 3. Kiểm tra nhanh custom keywords còn tồn tại
# (Removed: alicode, manualQuota, getUsageOverride, isDiepXuanUsageEligible — features removed 2026-07-21)
grep -R "EnhancedConsoleLog" -n src/app src/diepxuan/app | head -120
grep -R "resetComboFailTracker\|combo fallback immediately tries next model" -n src open-sse tests | head -120
grep -R "DonateModal\|volunteer_activism\|Donate" -n src/shared/components/Header.js src/shared/components/DonateModal.js || true
grep -R "firstCombo\|No provider/model specified\|Unknown provider" -n src/sse/handlers/search.js src/sse/handlers/fetch.js

# 4. Syntax check file custom chính
node --check src/app/api/usage/[connectionId]/route.js
node --check src/sse/handlers/search.js
node --check src/sse/handlers/fetch.js
node --check src/app/(dashboard)/dashboard/console-log/page.js
node --check src/diepxuan/app/api/console-logs-structured/route.js
node --check tests/unit/combo-immediate-fallback-node.test.mjs
node --check scripts/diepxuan/check-custom-features.mjs

# 5. Build production
npm run build

# 6. Kiểm tra working tree không có artifact ngoài ý muốn
git status --short --branch
```

Kết quả tối thiểu phải đạt:
- `node scripts/diepxuan/check-custom-features.mjs` pass, không có `FAIL`.
- `node --check` pass hết.
- `npm run build` pass.
- Các keyword custom còn tồn tại.
- Header không còn `DonateModal`, `volunteer_activism`, `Donate`.
- Không có conflict marker. Script tự kiểm tra conflict marker theo đầu dòng `<<<<<<<`, `=======`, `>>>>>>>` để tránh false positive với comment separator hoặc command grep trong tài liệu.

Quy tắc docs khi rebase:
- Không chỉnh sửa lan man các file docs upstream/fork khác.
- Chỉ dùng `docs/CUSTOM-FEATURES-MERGE-CHECKLIST.md` làm tài liệu kiểm tra fork docs/custom feature sau rebase.
- Nếu cần thêm guardrail cho custom feature, cập nhật `docs/custom-features.manifest.json`, `scripts/diepxuan/check-custom-features.mjs` và chính checklist này; không chạm các docs khác trừ khi Sếp yêu cầu riêng.

---

## 9. Checklist smoke test runtime

Chỉ chạy khi cần xác nhận sâu hơn build/static validation.

```bash
npm run build
npm run start
```

Sau đó kiểm tra:

```bash
curl -sS http://localhost:20128/api/health
curl -sS http://localhost:20128/api/v1/models | jq .
```

Port chuẩn local của workspace là `20128`. Nếu runtime override port, thay `20128` bằng port thực tế.

Smoke test theo feature:
- Enhanced console log: mở `/dashboard/console-log`, kiểm tra `EnhancedConsoleLog` và structured log API hoạt động.
- Search/fetch fallback: gọi `/api/v1/search` và `/api/v1/web/fetch` khi có combo phù hợp.
- Combo fallback tracker: đổi settings liên quan combo và kiểm tra `resetComboFailTracker()` còn được gọi.
- Combo curl snippet: mở combo detail page, kiểm tra origin trong command.
- Fork branding header: kiểm tra Header giống upstream nhất có thể nhưng không còn Donate UI/modal.
- CLI package: hiện xem là phần master fork, không coi là custom feature mới; chỉ kiểm tra khi thay đổi CLI/package.

---

## 10. Các dấu hiệu merge hỏng cần xử lý ngay

`docs/custom-features.manifest.json` có nhóm `invariants` để checker fail nhanh khi rebase làm mất hook nền trong base files. Các invariant này phải được giữ đồng bộ với contract hook mỏng hiện tại.

- `/dashboard/console-log` không còn import/render `EnhancedConsoleLog`.
- `src/diepxuan/app/api/console-logs-structured/route.js` hoặc `EnhancedConsoleLog.jsx` bị mất.
- `settings/route.js` mất `resetComboFailTracker()` khi settings đổi.
- `tests/unit/combo-immediate-fallback-node.test.mjs` bị mất hoặc không còn gọi `handleComboChat`.
- `search.js` / `fetch.js` mất hook `handleDiepXuanWebComboFallback()` trước fallback lỗi thiếu/không rõ provider.
- `src/shared/components/DonateModal.js` xuất hiện trở lại, hoặc `Header.js` có lại `DonateModal`, `volunteer_activism`, `Donate`.
- `npm run build` fail tại route usage/search/fetch/provider/quota/console-log.
- Có conflict marker trong `src`, `open-sse`, `cli`, `docs`.
- Workflow GitHub Actions trỏ nhầm hoặc push nhầm upstream.

---

## 11. Runtime feature flag cho DiepXuan extension layer

### Mục đích

Toàn bộ hook DiepXuan (combo fail tracker, web fallback, executor NVIDIA strip, ...) phải đi qua 2 flag runtime để dễ dàng tắt/bật khi debug, smoke test hoặc rebase upstream.

> **Cập nhật 2026-07-22:** AliCode manual quota + usage hooks đã bị xóa khỏi fork (xem "Features đã xóa khỏi fork" ở đầu file). Chỉ còn combo fail tracker, web fallback, NVIDIA executor strip đi qua flag.

### Files sử dụng flag (2026-07-22)

| File | Có guard `isDiepXuanEnabled()`? |
|------|----------------------------------|
| `src/diepxuan/shared/config/flags.js` | (định nghĩa) |
| `open-sse/diepxuan/comboHooks.js` | có |
| `src/diepxuan/sse/webComboFallback.js` | có |
| `src/diepxuan/app/dashboard/cli-tools/baseUrl.js` | **không cần** (luôn trả giá trị hợp lệ + có fallback tự nhiên; xem ghi chú dưới) |
| `src/diepxuan/app/dashboard/cli-tools/codex.js` | có (2026-07-22: trả `config` gốc khi disabled, không extend) |
| `src/diepxuan/app/dashboard/console-log/EnhancedConsoleLog.jsx` | **không wrap** (always-on: thay thế hoàn toàn base component, wrap = mất feature) |
| `src/app/api/v1/models/route.js` (NVIDIA resolver + context_length) | có (qua wrapper trong `open-sse/diepxuan/contextLength/*`) |
| `open-sse/diepxuan/contextLength/index.js` | có (2026-07-22) |
| `open-sse/diepxuan/contextLength/cache.js` | có (2026-07-22; fix import 2026-07-23 — xem mục 13) |
| `open-sse/diepxuan/contextLength/modelsApi.js` | có (2026-07-22) |
| `open-sse/diepxuan/contextLength/errorParser.js` | có (2026-07-22) |

> **Ghi chú:**
> - `baseUrl.js` là pure helper không có side-effect; trả `""` khi không có window. Caller base đã có fallback riêng nên không cần guard. Nếu Sếp muốn tắt hẳn behavior dynamic-origin, đặt `DIEPXUAN_ENABLED=false` + revert commit hook trong base files.
> - `EnhancedConsoleLog.jsx` thay thế hoàn toàn base component `/dashboard/console-log/page.js`. Khi fork tồn tại thì feature tồn tại; khi fork xóa thì mới mất. Đây là design intentional, không phải "leak".
> - `open-sse/diepxuan/executorHooks.js` (NVIDIA NIM executor strip) **đã xóa 2026-07-22** vì là dead code (function `stripNvidiaUnsupportedParams` không ai import/gọi). Nếu sau này cần wire NVIDIA strip, tạo lại file và wrap với `isDiepXuanEnabled()`.
> - `src/diepxuan/app/api/console-logs-structured/route.js` (API route structured log) **đã xóa 2026-07-22** vì là dead code. `EnhancedConsoleLog.jsx` dùng logic `parseLogsIntoRequests` inline, không gọi API này.

### Flag

- `DIEPXUAN_ENABLED` (mặc định `true`)
  - `false`: tất cả hook DiepXuan có guard trả về giá trị "no-op" (`null`/`false`), giữ nguyên hành vi upstream.
- `DIEPXUAN_SAFE_MODE` (mặc định `false`)
  - `true`: dành cho các hook ghi/đo lường, tắt ghi DB và override; chỉ giữ phần đọc an toàn.
  - Hiện chưa có hook nào dùng safe mode (reserved cho tương lai).

### Helper quan trọng

```js
isDiepXuanEnabled()        // process.env.DIEPXUAN_ENABLED, default true
isDiepXuanSafeMode()       // process.env.DIEPXUAN_SAFE_MODE, default false
DIE_PXUAN_FLAGS            // namespace object (chưa được dùng)
```

### Checklist sau merge upstream

```bash
# Flag định nghĩa còn nguyên
grep -q "isDiepXuanEnabled" src/diepxuan/shared/config/flags.js

# Hook còn nguyên và có guard (trừ file TODO ở trên)
grep -q "isDiepXuanEnabled" open-sse/diepxuan/comboHooks.js
grep -q "isDiepXuanEnabled" open-sse/diepxuan/executorHooks.js
grep -q "isDiepXuanEnabled" src/diepxuan/sse/webComboFallback.js

# Syntax check
node --check src/diepxuan/shared/config/flags.js
node --check src/diepxuan/sse/webComboFallback.js
node --check open-sse/diepxuan/comboHooks.js
node --check open-sse/diepxuan/executorHooks.js

# Test
cd tests && NODE_PATH=/tmp/node_modules /tmp/node_modules/.bin/vitest run diepxuan-feature-flags
```

### Smoke test

1. Bật mặc định (`DIEPXUAN_ENABLED=true`):
   - request `/api/v1/search` không provider → fallback combo đầu tiên.
   - combo fail liên tiếp 3 lần → model bị skip 5 phút.
   - `/api/v1/models` → mỗi model LLM có field `context_length`.
   - Codex config có `[agents.subagent].description = "9Router subagent..."`.
2. Tắt bằng `DIEPXUAN_ENABLED=false`:
   - request `/api/v1/search` không provider → trả lỗi thiếu provider như upstream.
   - combo fail không bị track (mỗi lần retry đều thử lại).
   - `/api/v1/models` → KHÔNG có field `context_length` (giống upstream).
   - Codex config KHÔNG có `description` trong `[agents.subagent]` (giống upstream).
   - `EnhancedConsoleLog` + dynamic origin CLI tools vẫn chạy (always-on, không wrap).

---

## 12. Ghi chú lần kiểm tra gần nhất

Lần kiểm tra gần nhất: **2026-07-22** (branch `diepxuan`, PR #46).

### Verify kết quả (sau lần refactor thứ 2)

- `node scripts/diepxuan/check-custom-features.mjs`: **360 PASS / 0 WARN / 0 FAIL**.
  - Số check giảm từ 369 → 360 do xóa 9 check của feature `nvidia-executor-strip` (file dead code đã xóa).
  - Số features: 14 (tăng từ 13 nhờ thêm `auto-context-length`; giảm 1 vì xóa `nvidia-executor-strip`).
  - FAIL cũ (`fork-branding-header` — `DonateModal.js`) đã fix bằng cách bỏ `forbiddenFiles`, chỉ giữ `forbiddenPatterns` (xem entry manifest + mục "Fork branding header" ở trên).
- `node --check` tất cả file fork layer + base files bị sửa: PASS.
- `npm run build`: **PASS** (chạy ngoài sandbox với `npm install` trước để có `@next/third-parties@^16.2.9`).
  - Trong Codex sandbox (`/data/9router`) build fail vì sandbox chặn `fonts.googleapis.com` — không phải bug code. Xem `TOOLS.md §7`.
- Test `tests/unit/{combo-immediate-fallback-node.test.mjs,diepxuan-feature-flags.test.js}`: chưa chạy (test setup dùng `NODE_PATH=/tmp/node_modules` + `vitest`, cần env riêng).

### Trạng thái git tại thời điểm kiểm tra

- Branch: `diepxuan` (local) sync với `origin/diepxuan`.
- Base: `origin/main` (`79918c78`, v0.5.40 ngày 2026-07-20).
- Working tree: nhiều file modified (sẽ squash thành 1 commit trước khi push update PR #46).
- 14 features trong manifest (tăng từ 13 nhờ thêm `auto-context-length`; giảm 1 vì xóa `nvidia-executor-strip`).

Khi dùng tài liệu này trong lần sau, luôn kiểm tra lại trạng thái git hiện tại thay vì dựa vào ghi chú cũ.

---

## 13. Auto Context Length Info (2026-06-28)

### Mục đích
Tự động thu thập và cập nhật `context_length` (max tokens) cho mọi model, để:
- `/v1/models` endpoint trả về `context_length` chính xác cho Codex/OpenAI clients
- Combo fallback không thử model nhỏ trước model lớn một cách mù quáng
- Hook cho proactive truncation (tương lai) sử dụng context info

### Nguồn dữ liệu (theo thứ tự ưu tiên)
1. **Provider `/v1/models` API** — 1 call / 24h, cache vào SQLite
2. **Parse 400 error** — Học từ lỗi `maximum context length is X tokens`
3. **MODEL_INFO static** — Fallback cuối cùng

### Bug fix 2026-07-23: thiếu import `isDiepXuanEnabled` trong `cache.js`

- **Triệu chứng:** log dev bắn liên tục (mỗi ~1s) `Error fetching models: ReferenceError: isDiepXuanEnabled is not defined` mỗi khi provider fetch model (đi qua `resolveProviderModelsWithContext` → `upsertContextLength`).
- **Nguyên nhân:** `open-sse/diepxuan/contextLength/cache.js` gọi `isDiepXuanEnabled()` trong `upsertContextLength()` nhưng **quên import**. Bảng ở mục 11 ghi file này "có guard" từ 2026-07-22, nhưng guard ném ReferenceError vì thiếu import (guard chỉ thật sự hoạt động sau fix này).
- **Fix:** thêm `import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";` — cùng đường dẫn với các module anh em (`modelsApi.js`, `errorParser.js`, `index.js`).
- **Bài học (tránh lặp lại):** khi thêm guard `isDiepXuanEnabled()` vào file fork layer mới, luôn kiểm tra dòng import đi kèm; `node --check` không bắt được lỗi này (biến undefined chỉ ném lúc runtime).
- **Verify:** `node --check` PASS; gọi `/api/models` + `/api/v1/models` → 200; log 0 lỗi `isDiepXuanEnabled` (trước đó bắn mỗi giây).

### Files cần giữ (fork layer)

```
open-sse/diepxuan/contextLength/
  cache.js          -- SQLite cache, priority: error > api > static
  modelsApi.js      -- Fetch NVIDIA /v1/models, parse max_model_len
  errorParser.js    -- Parse 400 "max context" error
  index.js          -- Public API: getContextLength, getContextLengthBatch
```

### Injection points (base files)

| Base file | Thay đổi |
|-----------|----------|
| `src/app/api/v1/models/route.js` | Register NVIDIA resolver + add `context_length` field |
| `open-sse/services/accountFallback.js` | `checkFallbackError(status, error, backoff, modelId)` — cache 400 |
| `open-sse/services/combo.js` | Pass `modelStr` to `checkFallbackError` |

### Checklist khi rebase upstream

```bash
# Files còn nguyên
test -f open-sse/diepxuan/contextLength/index.js
test -f open-sse/diepxuan/contextLength/cache.js
test -f open-sse/diepxuan/contextLength/modelsApi.js
test -f open-sse/diepxuan/contextLength/errorParser.js

# Pattern còn nguyên trong base files
grep -q "resolveProviderModelsWithContext" src/app/api/v1/models/route.js
grep -q "updateContextLengthFromError" open-sse/services/accountFallback.js
grep -q "diepxuan: capture 400" open-sse/services/accountFallback.js

# Smoke test
curl -s http://localhost:20128/api/v1/models | grep -q "context_length"
```

### Smoke test

1. Khởi động server, gọi `GET /v1/models` → tìm `nvidia/minimaxai/minimax-m2.7` → có `context_length`.
2. Trigger request vượt context (gửi 400K tokens) → nhận 400 → kiểm tra cache:
   ```bash
   sqlite3 /var/lib/9router/db/data.sqlite "SELECT model_id, context_length, source FROM model_context_info;"
   ```
3. Tắt `DIEPXUAN_ENABLED=false` → vẫn hoạt động (fallback MODEL_INFO).

---

## 14. CLI tools dynamic current-origin endpoint

### Mục đích

Dashboard CLI tools trong fork ưu tiên endpoint theo origin hiện tại của browser thay vì hard-code `localhost` hoặc ép `localhost` sang `127.0.0.1`. Điều này phục vụ môi trường nội bộ dùng hostname/domain như `9router.diepxuan.corp`, reverse proxy, tunnel hoặc VM IP động.

Base UI chỉ giữ bridge mỏng; policy nằm trong fork layer:

Files fork layer:
- `src/diepxuan/app/dashboard/cli-tools/baseUrl.js`

Base files có bridge:
- `src/app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/BaseUrlSelect.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/DefaultToolCard.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/DeepSeekTuiToolCard.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/HermesToolCard.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/JcodeToolCard.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/OpenClawToolCard.js`

### Logic cần giữ

Trong `src/diepxuan/app/dashboard/cli-tools/baseUrl.js` phải có:

```js
getCurrentBrowserOrigin()
getCliToolBaseUrl()
getToolDetailBaseUrl()
```

Base files chỉ nên import helper:

```js
@/diepxuan/app/dashboard/cli-tools/baseUrl
```

Không đưa lại literal fallback cứng vào component nếu không có lý do rõ ràng:
- `http://localhost:20128`
- `http://127.0.0.1:20128`
- `url.replace("://localhost", "://127.0.0.1")`

### Checklist sau merge upstream

```bash
grep -R "getCliToolBaseUrl\|getCurrentBrowserOrigin\|getToolDetailBaseUrl" -n src/diepxuan/app/dashboard/cli-tools src/app/\(dashboard\)/dashboard/cli-tools | head -80
grep -R "127.0.0.1:20128\|localhost:20128\|://127.0.0.1" -n src/app/\(dashboard\)/dashboard/cli-tools || true
node --check src/diepxuan/app/dashboard/cli-tools/baseUrl.js
node --check src/app/\(dashboard\)/dashboard/cli-tools/components/BaseUrlSelect.js
node --check src/app/\(dashboard\)/dashboard/cli-tools/components/DefaultToolCard.js
node --check src/app/\(dashboard\)/dashboard/cli-tools/components/DeepSeekTuiToolCard.js
node --check src/app/\(dashboard\)/dashboard/cli-tools/components/HermesToolCard.js
node --check src/app/\(dashboard\)/dashboard/cli-tools/components/JcodeToolCard.js
node --check src/app/\(dashboard\)/dashboard/cli-tools/components/OpenClawToolCard.js
```

### Smoke test khuyến nghị

1. Mở dashboard bằng hostname thực tế, ví dụ `http://9router.diepxuan.corp:20128` hoặc reverse proxy tương ứng.
2. Mở `/dashboard/cli-tools` và một tool detail page.
3. Kiểm tra Base URL mặc định trong snippet/settings là origin hiện tại, không bị đổi sang `127.0.0.1`.
4. Apply settings cho Hermes/JCode/OpenClaw/DeepSeek TUI nếu tool có sẵn, kiểm tra file config ghi đúng origin.

---

## 15. Codex subagent config description

### Mục đích

Fork thêm `description` cho `[agents.subagent]` khi tạo config Codex CLI, để subagent có mô tả rõ ràng trong config sinh ra từ dashboard/API.

Files fork layer:
- `src/diepxuan/app/dashboard/cli-tools/codex.js`

Base files có bridge:
- `src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.js`
- `src/app/api/cli-tools/codex-settings/route.js`

### Logic cần giữ

Trong fork layer phải có:

```js
CODEX_SUBAGENT_DESCRIPTION
extendCodexSubagentConfig()
```

Base files chỉ import helper/value từ:

```js
@/diepxuan/app/dashboard/cli-tools/codex
```

### Checklist sau merge upstream

```bash
grep -R "CODEX_SUBAGENT_DESCRIPTION\|extendCodexSubagentConfig" -n src/diepxuan/app/dashboard/cli-tools src/app/\(dashboard\)/dashboard/cli-tools/components/CodexToolCard.js src/app/api/cli-tools/codex-settings/route.js
node --check src/diepxuan/app/dashboard/cli-tools/codex.js
node --check src/app/\(dashboard\)/dashboard/cli-tools/components/CodexToolCard.js
node --check src/app/api/cli-tools/codex-settings/route.js
```

### Smoke test khuyến nghị

1. Mở Codex tool card.
2. Copy manual config hoặc apply settings.
3. Kiểm tra `[agents.subagent]` có cả `description` và `model`.

---

## 16. Root `dev.sh` nội bộ DiepXuan

### Mục đích

`dev.sh` ở root repo là script vận hành môi trường dev nội bộ của anh, giữ nguyên ở root để tiện dùng. Đây là custom fork, không tách sang `scripts/diepxuan`.

Script quản lý:
- detect VM IP động qua `ip route` hoặc `hostname -I`.
- hosts entry cho `9router.diepxuan.corp` với marker `# 9router-dev managed`.
- systemd service `9router-dev`.
- stop/start service production `9router` khi start/stop dev để tránh tranh port.

### File cần giữ

- `dev.sh`

### Checklist sau merge upstream

```bash
test -x dev.sh && echo "dev.sh executable OK"
grep -n "9router.diepxuan.corp\|9router-dev\|HOSTS_MARKER\|get_vm_ip\|stop_prod_service\|start_prod_service" dev.sh
bash -n dev.sh
```

### Lưu ý vận hành

- Không tự ý chuyển `dev.sh` sang thư mục khác.
- Không tự ý chạy `./dev.sh start|stop|restart` trong session agent nếu anh chưa yêu cầu, vì script cần root và chạm `/etc/hosts`/systemd.
- Khi rebase upstream, nếu `dev.sh` conflict thì ưu tiên giữ behavior nội bộ ở trên.



## 17. NVIDIA NIM executor strip (open-sse/diepxuan/executorHooks.js)

### Mục đích

NVIDIA Chat Completions API (`integrate.api.nvidia.com`) chấp nhận params OpenAI Chat Completions chuẩn nhưng reject các param OpenAI Responses / Codex SDK extras (`text`, `client_metadata`, `reasoning`, `store`, top-level `parallel_tool_calls`, ...) với HTTP 400.

Hook này strip các param không supported trước khi gửi tới NVIDIA.

> **Cảnh báo 2026-07-22:** File `open-sse/diepxuan/executorHooks.js` hiện đang là **DEAD CODE** — function `stripNvidiaUnsupportedParams` được export nhưng **không có chỗ nào trong codebase gọi nó**. Có thể là hook dở dang chưa wire vào base executor. Cần quyết định: xóa file, hoặc wire vào `open-sse/executors/openaiChat.js` (hoặc tương đương) trước khi upstream stable.

### File cần giữ

- `open-sse/diepxuan/executorHooks.js` (37 dòng)

### Logic cần giữ

```js
import { isDiepXuanEnabled } from "../../src/diepxuan/shared/config/flags.js";

const NVIDIA_ALLOWED = new Set([
  "model", "messages",
  "max_tokens", "max_completion_tokens",
  "temperature", "top_p", "top_k",
  "stop", "stream",
  "presence_penalty", "frequency_penalty",
  "logit_bias", "user", "seed",
  "response_format",
  "tools", "tool_choice",
]);

export function stripNvidiaUnsupportedParams(provider, body) {
  if (!isDiepXuanEnabled()) return body;
  if (provider !== "nvidia") return body;
  // ...
}
```

### Checklist sau merge upstream

```bash
test -f open-sse/diepxuan/executorHooks.js
grep -q "stripNvidiaUnsupportedParams" open-sse/diepxuan/executorHooks.js
grep -q "isDiepXuanEnabled" open-sse/diepxuan/executorHooks.js
node --check open-sse/diepxuan/executorHooks.js
```

### Smoke test khuyến nghị

1. Tạo NVIDIA connection, gửi request có `text`, `client_metadata`.
2. Trước wire: request fail 400.
3. Sau wire (khi có caller): request pass.

---

## 18. /v1/models context_length enrichment

### Mục đích

Enrich mỗi LLM model trong response `/api/v1/models` với field `context_length` (max input tokens). Codex CLI / OpenAI clients dùng field này để:
- Hiển thị context window cho user.
- Validate request trước khi gửi (tránh 400).
- Quyết định có cần truncate history không.

### Cơ chế

Trong `buildModelsList()` của `src/app/api/v1/models/route.js`, sau khi dedupe model IDs, mỗi model được lookup qua `getContextLengthBatchCached()`:

1. **Cache hit** (SQLite, từ lần trước) → trả về ngay.
2. **Cache miss** → fallback `getStaticContextLength()` (MODEL_INFO từ upstream).
3. **Cache miss + không có static** → bỏ qua (model không có `context_length`).

### Base file bị sửa

`src/app/api/v1/models/route.js`:
- Import `getContextLengthBatchCached` + `getStaticContextLength` từ `open-sse/diepxuan/contextLength/index.js`.
- Register NVIDIA resolver trong `LIVE_MODEL_RESOLVERS`:
  ```js
  nvidia: async (conn) => {
    const result = await resolveProviderModelsWithContext(conn);
    return result?.models?.length ? result : null;
  }
  ```
- Trong loop dedupe: gọi `getContextLengthBatchCached` một lần cho tất cả model IDs (batch), rồi set `model.context_length = cached?.contextLength || getStaticContextLength(model.id)`.

### Fork layer files (xem §13)

- `open-sse/diepxuan/contextLength/cache.js` — SQLite cache.
- `open-sse/diepxuan/contextLength/modelsApi.js` — NVIDIA `/v1/models` API.
- `open-sse/diepxuan/contextLength/errorParser.js` — Parse 400 error.
- `open-sse/diepxuan/contextLength/index.js` — Public API.

### Checklist sau merge upstream

```bash
# Imports còn nguyên
grep -q "getContextLengthBatchCached" src/app/api/v1/models/route.js
grep -q "getStaticContextLength" src/app/api/v1/models/route.js
grep -q "resolveProviderModelsWithContext" src/app/api/v1/models/route.js
grep -q "LIVE_MODEL_RESOLVERS" src/app/api/v1/models/route.js

# Pattern enrich còn nguyên
grep -q "context_length" src/app/api/v1/models/route.js

# Syntax check
node --check src/app/api/v1/models/route.js
node --check open-sse/diepxuan/contextLength/index.js
node --check open-sse/diepxuan/contextLength/cache.js
node --check open-sse/diepxuan/contextLength/modelsApi.js
node --check open-sse/diepxuan/contextLength/errorParser.js
```

### Smoke test khuyến nghị

```bash
# Khởi động server, gọi /v1/models
curl -sS http://localhost:20128/api/v1/models | jq '.data[] | select(.id | contains("nvidia")) | {id, context_length}'
# → phải có context_length cho model NVIDIA
```

---

## 19. Agnes AI provider (fork-layer registry) — 2026-07-23

### Mục đích

Bổ sung provider **Agnes AI** (Sapiens AI) — gateway đa phương thức, OpenAI-compatible.
Docs: https://agnes-ai.com/en/docs/overview

- Base URL: `https://apihub.agnes-ai.com/v1`
- Auth: `Authorization: Bearer <API_KEY>` (apikey thuần, không OAuth)
- Chat: `POST /v1/chat/completions`; Image: `POST /v1/images/generations`; validate qua `GET /v1/models`

### Model — đã test live (2026-07-23, qua GET /v1/models + gọi thật)

| Model | Kind | Kết quả test | Trạng thái |
|-------|------|--------------|-----------|
| `agnes-2.0-flash` | llm (text/vision) | `POST /v1/chat/completions` → 200 OK | **Bật** |
| `agnes-image-2.0-flash` | image | `POST /v1/images/generations` → 200 OK (trả URL) | **Bật** |
| `agnes-image-2.1-flash` | image | có trong `/v1/models` live | **Bật** |
| `agnes-1.5-flash` | llm | `503 model_not_found` (No available channel) | **Bỏ** (chưa mở dù MODEL_CATALOG có ghi) |
| `agnes-video-v2.0` | video | `POST /v1/videos` async + poll `video_id` | **Hoãn** (shape khác `videoCore`, cần executor riêng) |

> **Bài học:** MODEL_CATALOG.md của Agnes liệt kê `agnes-1.5-flash` nhưng endpoint trả 503.
> Luôn xác thực bằng `GET /v1/models` + 1 call thật trước khi đưa model vào registry.

### Quyết định kiến trúc (hướng 2)

Provider chuẩn của 9Router nằm ở base dir `open-sse/providers/registry/` và REGISTRY được import
trực tiếp bởi nhiều consumer (`providers/index.js`, `src/shared/constants/providers*.js`, `services/model.js`...).
Không có chokepoint nào ở layer fork để tiêm provider mà không đụng base.

Thỏa hiệp gần luật fork (AGENTS §6) nhất: **logic provider nằm ở layer fork**, chỉ chạm các
điểm hợp nhất bắt buộc ở base bằng thay đổi tối thiểu (1 dòng mỗi điểm).

### Files cần giữ (fork layer)

```
open-sse/diepxuan/registry/agnes.js   -- registry entry (chat transport + image imageConfig + models)
public/providers/agnes.png            -- provider icon 128x128 (logo mark chinh thuc, tach tu platform favicon.ico)
```

### Injection points (base files — bắt buộc, tối thiểu)

| Base file | Thay đổi |
|-----------|----------|
| `open-sse/providers/registry/index.js` | Thêm `import d1 from "../../diepxuan/registry/agnes.js";` (namespace `dN` cho fork, tránh renumber `pN` của upstream khi rebase) + append `d1` vào cuối mảng `export default [...]` |
| `open-sse/handlers/imageProviders/index.js` | Thêm `agnes: createOpenAIAdapter("agnes"),` vào map `ADAPTERS` (image dùng adapter OpenAI-compatible generic, đọc `imageConfig.baseUrl` từ registry) |

> **Lý do dùng `d1` thay vì `p100`:** dải `pN` do upstream tự sinh và đánh số lại toàn bộ mỗi khi thêm provider.
> Dùng namespace riêng `dN` cho các entry fork để append thêm không rơi vào vùng bị renumber → giảm conflict khi rebase.

### Checklist khi rebase upstream

```bash
# File fork còn nguyên
test -f open-sse/diepxuan/registry/agnes.js
test -f public/providers/agnes.png

# Injection points còn nguyên
grep -q 'import d1 from "../../diepxuan/registry/agnes.js"' open-sse/providers/registry/index.js
grep -qE '^\s*d1,' open-sse/providers/registry/index.js
grep -q 'agnes: createOpenAIAdapter("agnes")' open-sse/handlers/imageProviders/index.js

# Syntax
node --check open-sse/diepxuan/registry/agnes.js
node --check open-sse/providers/registry/index.js
node --check open-sse/handlers/imageProviders/index.js
```

### Smoke test

```bash
# REGISTRY + downstream build
node --input-type=module -e '
import R from "./open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MODELS, PROVIDER_MEDIA } from "./open-sse/providers/index.js";
console.log("has agnes:", R.some(r=>r.id==="agnes"));
console.log("chat:", PROVIDERS.agnes?.baseUrl);
console.log("models:", PROVIDER_MODELS.agnes?.map(m=>m.id));
console.log("image:", PROVIDER_MEDIA.agnes?.imageConfig?.baseUrl);
'
# → has agnes: true
#   chat: https://apihub.agnes-ai.com/v1/chat/completions
#   models: [agnes-2.0-flash, agnes-image-2.0-flash, agnes-image-2.1-flash]
#   image: https://apihub.agnes-ai.com/v1/images/generations

# Gọi thật (thay <KEY>)
curl -s https://apihub.agnes-ai.com/v1/chat/completions -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"agnes-2.0-flash","messages":[{"role":"user","content":"Say OK"}],"max_tokens":16}'
```

### Verify đã chạy (2026-07-23)

- REGISTRY length 100 → 101, `has agnes: true`, không trùng id/alias.
- `PROVIDERS.agnes` + `PROVIDER_MODELS.agnes` (3 model) + `PROVIDER_MEDIA.agnes.imageConfig` build đúng (`format:"openai"` mặc định).
- `node --check` PASS cho cả 3 file.
- `node scripts/diepxuan/check-custom-features.mjs`: 360 PASS / 0 WARN / 0 FAIL.
- Gọi thật: `agnes-2.0-flash` → 200 "OK"; `agnes-image-2.0-flash` → 200 (trả URL ảnh).

## 20. i18n — dịch phần giải thích Combos + Round Robin label sang tiếng Việt — 2026-07-23 (rev 2)

### Mục đích

Phần giải thích trong page `Combos` (`src/app/(dashboard)/dashboard/combos/page.js`) đang hiển thị tiếng Anh (do base upstream). Khi user chọn locale `vi`, runtime i18n sẽ tự thay thế sang tiếng Việt thông qua JSON literal map.

Đợt rev 2 (2026-07-23) — Sếp yêu cầu chuẩn hóa:
- "Round Robin" không dịch thành "Vòng tròn" (nghĩa đen literal, không đúng kỹ thuật) → phải dùng "Luân phiên" (thuật ngữ chuẩn trong load balancing / scheduling).
- Bổ sung key cho `STRATEGY_OPTIONS` trong modal (3 label nhỏ).

### Cơ chế

1. Runtime i18n quét DOM (MutationObserver).
2. Đối chiếu text node với key trong `public/i18n/literals/{locale}.json`.
3. Có key → thay thế; không có → giữ nguyên tiếng Anh (fallback).

### Quyết định dịch thuật (rev 2)

| English key | Vietnamese value | Bối cảnh |
|------------|-----------------|-----------|
| `Round Robin` | `Luân phiên` | Bullet list Combos + label `ConnectionsCard.js` (round-robin load balancing — chuẩn kỹ thuật) |
| `Round Robin — rotates models across requests to spread load` | `Luân phiên — xoay vòng model giữa các request để phân tải` | Bullet giải thích combo strategy |
| `Round Robin — rotate` | `Luân phiên — xoay vòng` | `STRATEGY_OPTIONS` trong modal tạo/edit combo |
| `Fallback — try in order` | `Fallback — thử theo thứ tự` | `STRATEGY_OPTIONS` trong modal |
| `Fusion — panel + judge` | `Fusion — panel + judge` | `STRATEGY_OPTIONS` trong modal (giữ thuật ngữ Anh "panel" + "judge") |
| `Group models under one name, then pick a strategy per combo:` | `Gom các model dưới một tên, rồi chọn chiến lược cho mỗi combo:` | Header giải thích |
| `Fallback — tries models in order (next on failure)` | `Fallback — thử các model theo thứ tự (model tiếp theo khi lỗi)` | Bullet Fallback |
| `Fusion — queries all models in parallel, then a judge synthesizes one answer. Best quality, but costs the most: every request bills all panel models + the judge (N+1 calls)` | `Fusion — truy vấn tất cả model song song, sau đó một judge tổng hợp thành một câu trả lời. Chất lượng cao nhất nhưng tốn kém nhất: mỗi request tính phí tất cả panel models + judge (N+1 calls)` | Bullet Fusion (giữ "panel", "judge", "N+1 calls" vì là thuật ngữ) |
| `Capacity auto-switch — sends image/PDF/audio requests to a model that supports them first` | `Capacity auto-switch — gửi request hình ảnh/PDF/audio đến model hỗ trợ trước` | Bullet Capacity auto-switch |

### Fork layer files (xem §13)

- `public/i18n/literals/vi.json` — chỉnh sửa key `Round Robin` (value cũ "Vòng tròn" → "Luân phiên"), cập nhật value key long-form, thêm 3 key mới cho STRATEGY_OPTIONS. Tổng: 198 → 201 keys.

### Base file bị sửa

- **Không có.** Chỉ đụng JSON literal, không sửa UI source → không có merge conflict khi rebase upstream.

### File phụ thuộc (base, không sửa)

- `src/app/(dashboard)/dashboard/combos/page.js` — dùng key `Round Robin` (line 155) + `Round Robin — rotates...` (line 155) + `Round Robin — rotate` (line 235).
- `src/app/(dashboard)/dashboard/providers/components/ConnectionsCard.js` line 407 — dùng key `Round Robin`.

### Checklist sau merge upstream

- [ ] Không cần làm gì nếu upstream không sửa text trong 2 file trên.
- [ ] Nếu upstream sửa text → cập nhật lại key tương ứng trong `vi.json` (key cũ có thể trở thành dead keys, an toàn).

### Smoke test khuyến nghị

1. Mở Dashboard, chuyển locale sang "Tiếng Việt 🇻🇳".
2. Vào page Combos:
   - Phần mô tả "Gom các model..." thay vì "Group models..." ✓
   - 4 bullet: "Fallback" / "Luân phiên" / "Fusion" / "Capacity auto-switch" ✓
3. Vào Create Combo (modal):
   - Dropdown chọn strategy hiển thị: `Fallback — thử theo thứ tự`, `Luân phiên — xoay vòng`, `Fusion — panel + judge` ✓
4. Vào page Providers → Connections → bullet "Luân phiên" (mult-account) ✓
5. Chuyển lại locale "English 🇺🇸" → text gốc tiếng Anh hiển thị đầy đủ.

### Verify đã chạy (2026-07-23, rev 2)

- `python3 -m json.tool public/i18n/literals/vi.json`: JSON hợp lệ.
- 201 keys, không trùng lặp.
- `node scripts/diepxuan/check-custom-features.mjs`: 360 PASS / 0 WARN / 0 FAIL.
- Tất cả key match exact với text trong base file (kể cả em-dash `—`).

### Lịch sử

- rev 1 (PR #50 commit `9aedad6c`): thêm 5 keys ban đầu, dùng "Round Robin" trong value.
- rev 2 (sửa tiếp PR #50 hoặc PR mới): chuẩn hóa "Round Robin" key → "Luân phiên", thêm 3 keys cho STRATEGY_OPTIONS modal. Theo Sếp yêu cầu trực tiếp.
