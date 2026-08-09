# Custom Features Merge Checklist

> Fork `diepxuan/9router` changelog duy nhất (thay cho `CHANGELOG.md`).
> Mục tiêu: biết fork custom gì, file nào cần giữ khi rebase upstream.

## Quy tắc

- Không sửa base file upstream trực tiếp; custom nằm trong fork layer (`src/diepxuan/`, `open-sse/diepxuan/`).
- Sau rebase upstream: chạy `node scripts/diepxuan/check-custom-features.mjs`, PASS rồi mới push.
- Manifest máy đọc: `docs/custom-features.manifest.json`.

## Features đã xóa (2026-07-21)

- Alibaba Cloud Coding Plan (alicode, alicode-intl)
- Manual quota counter
- Enhanced quota dashboard (ProviderLimits custom)

## Nhóm custom features

### 1. Provider registry & capabilities

Các provider custom trong fork layer, base registry không sửa.

| Feature | File chính |
|---|---|
| AIHubMix / TokenRouter / ZenMux | `open-sse/diepxuan/registry/aihubmix.js`, `tokenrouter.js`, `zenmux.js` |
| Agnes | `open-sse/diepxuan/registry/agnes.js`, `open-sse/handlers/imageProviders/index.js` |
| Groq expansion + capabilities | `open-sse/diepxuan/registry/groq.js`, `open-sse/providers/capabilities.js` |
| Qoder un-deprecate | `open-sse/diepxuan/registry/qoder.js` |
| NVIDIA free catalog (48 models) | `open-sse/diepxuan/registry/nvidia.js` |
| OpenAI chat-compatible registry | `open-sse/diepxuan/registry/openai.js`, `open-sse/providers/registry/index.js` |
| LLMGateway free/cheap gateway | `open-sse/diepxuan/registry/llmgateway.js`, `open-sse/providers/registry/index.js` |
| Kilo Code free hosted models | `open-sse/diepxuan/registry/kilocode.js`, `open-sse/providers/registry/index.js` |
| Gemini free tier models | `open-sse/diepxuan/registry/gemini.js`, `open-sse/providers/registry/index.js`, `src/diepxuan/app/dashboard/providers/ModelFreeBadge.jsx`, `src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js` |
| MiniMax stripBuiltinTools config | `open-sse/diepxuan/registry/minimax.js`, `minimax-cn.js` |
| Wire vào registry | `open-sse/providers/registry/index.js` |

`src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js` là base file; chỉ thêm import + render badge từ fork layer (`ModelFreeBadge.jsx`) để hiển thị model free.

### 2. Context length system

| Feature | File chính |
|---|---|
| Cache + API + error parser | `open-sse/diepxuan/contextLength/` |
| `/v1/models` enrichment | `src/app/api/v1/models/route.js` |
| Context lengths API | `src/app/api/models/context-lengths/route.js` |
| Combo ctx skip | `open-sse/diepxuan/comboHooks.js` (`estimateTokens` + `getContextLengthSync`) |
| UI ctx badges (combo + provider) | `combos/page.js`, `combo/[id]/page.js`, `providers/[id]/ModelRow.js` |
| Source priority api > static > error | `contextLength/cache.js` |
| Đọc ưu tiên static > error | `contextLength/index.js` (`getContextLengthSync`, batch) |

### 4. Fork transformers & executors

| Feature | File chính |
|---|---|
| NVIDIA clean tool ids | `open-sse/diepxuan/nvidia/cleanToolIds.js`, `translator/index.js` |
| NVIDIA strip text / inject max_tokens | `open-sse/diepxuan/translator/paramSupportHooks.js`, `executors/default.js` |
| OpenAI Chat Completions param quirks | Strip `text` and incompatible `reasoning_effort` in `open-sse/diepxuan/translator/paramSupportHooks.js` |
| TokenRouter reasoning_effort clamp | `open-sse/diepxuan/translator/paramSupportHooks.js` (low/high/max) |
| TokenRouter flatten assistant content | `open-sse/diepxuan/translator/paramSupportHooks.js` (array → string) |
| Codex builtin tool pruner (config-driven) | `transformers/stripBuiltinTools.js`, `registry/minimax.js`, `minimax-cn.js` |
| Groq incompatible strip | `transformers/stripGroqIncompatible.js`, `executors/groq.js` |
| MiMo free 441 cooldown | `executors/mimo-free.js`, `executors/index.js` |
| Combo response model override | `transformers/responseModelOverride.js`, `chatCore.js`, `utils/stream.js` |
| Codex model marker strip | `transformers/stripCodexModelMarkers.js`, `translator/index.js`, `responseModelOverride.js` |

### 5. UI / Dashboard

| Feature | File chính |
|---|---|
| Enhanced Console Log | `src/diepxuan/app/dashboard/console-log/EnhancedConsoleLog.jsx`, `console-log/page.js` |
| Console log live activity tracker | `src/diepxuan/lib/consoleLogLiveTracker.js`, `LiveConsoleHeader.jsx`, `LiveFallbackChain.jsx`, `/api/diepxuan/console-log/live/stream`, base patch `consoleLogBuffer.js` + `console-logs/stream/route.js` |
| CLI tools current-origin endpoint | `src/diepxuan/app/dashboard/cli-tools/baseUrl.js` + tool cards |
| Codex subagent description | `cli-tools/codex.js`, `CodexToolCard.js`, `codex-settings/route.js` |
| Combo curl dynamic baseUrl | `combo/[id]/page.js` |
| DonateModal removal | `src/shared/components/Header.js` |
| i18n vi combos | `public/i18n/literals/vi.json` |
| Combo list A-Z | `src/app/(dashboard)/dashboard/combos/page.js` |

### 6. Infrastructure

| Feature | File chính |
|---|---|
| Shared DB singleton | `open-sse/diepxuan/db/sharedDb.js` (`global._dbAdapter.instance.raw`) |
| Feature flag | `src/diepxuan/shared/config/flags.js` (`isDiepXuanEnabled`) |
| Debug log theo service | `open-sse/utils/debugLog.js` (dev: `NODE_ENV !== "production"`) |
| dev.sh + NODE_ENV | `dev.sh` |
| next.config allowedDevOrigins | `next.config.mjs` |
| CI/CD pipeline | `.github/workflows/build-and-deploy.yml` |
| Governance files | `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `AGENTS.md`, `AGENT_WORKSPACE.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` |

## Kiểm tra sau rebase

```bash
node scripts/diepxuan/check-custom-features.mjs
npm run build
```

Cả hai PASS mới push.

## Unit tests mới (2026-08-01)

- `tests/unit/stripCodexModelMarkers.test.mjs` — strip `[` marker trong text + body messages
- `tests/unit/context-length-priority.test.mjs` — static 1M thắng error 256K

Chạy: `node tests/unit/<file>` hoặc `npm test` (nếu có script).

## Smoke test nhanh

- Proxy: `curl http://localhost:3000/api/health`
- Combo: mở `/dashboard/combos`, kiểm tra ctx badge + fallback
- Console log: mở `/dashboard/console-log`
- Console log live: mở `/dashboard/console-log`, kiểm tra badge client/combo/single + fallback chain cập nhật realtime
- `/v1/models`: kiểm tra `context_length` có giá trị

## Ghi chú merge/rebase

- PR chỉ tạo trên `diepxuan/9router`, không lên upstream `decolua/9router`.
- Không push trực tiếp main/master.
- Nếu sửa base file, ghi rõ lý do ở commit.

### 2026-08-04 - OpenAI Chat Completions compatibility

- Added fork-layer OpenAI registry override: `open-sse/diepxuan/registry/openai.js`.
- Verified official OpenAI latest-model docs: `gpt-5.6` aliases to `gpt-5.6-sol`; Responses API is recommended for reasoning/tool-calling workflows.
- Kept OpenAI API provider on Chat Completions and removed/filtered non-chat or deprecated model slugs from its registry.
- Added Chat Completions quirks: strip `text` and force `reasoning_effort: "none"` when tools are present for `gpt-5.4*`, `gpt-5.5`, and `gpt-5.6-*`.
- Cleaned NVIDIA EOL model ids and added static context length for `z-ai/glm-5.2` (200k).
- Smoke tests: `node --test tests/unit/paramSupportHooks.test.mjs tests/unit/openai-fork-registry.test.mjs`, `node --check` target files, registry import, fork custom-feature checker.

### 2026-08-07 - Console Log request grouping + depth indicator

**Mục đích**: Mỗi client request hiển thị 1 dòng duy nhất trong Enhanced Console Log, không phải 1 dòng per combo instance (giảm noise khi combo chain có nhiều nested).

**File thay đổi**:
- `src/diepxuan/lib/consoleLogLiveTracker.js`: thêm `requestId` (root = own key, nested inherit root's key qua scope stack) + `depth` (0 = top-level, N = nested N cấp). Model push capture `entry.depth` để biết thuộc combo ở depth nào.
- `src/diepxuan/app/dashboard/console-log/LiveFallbackChain.jsx`: group entries theo `requestId`, flatten models của root + nested thành 1 chain ngang. Sort `success > running > failed`. Model `depth > 0` hiển thị border-l-4 border-l-purple-500 để phân biệt model con mà không phá layout chain.
- `tests/unit/diepxuan-console-log-tracker.test.mjs`: 3 test mới verify `depth` propagation (root depth=0, nested depth=N, model inherit).

**Quyết định thiết kế**:
- Flatten chain (không expand/nested accordion) — Sếp yêu cầu "1 client request = 1 dòng".
- Sort `success > running > failed` — failed xuống dưới cùng để dễ thấy lỗi.
- Border tím trái cho model con — phân biệt visual mà không indent/prefix.

**Smoke test**:
- Mở `/dashboard/console-log` khi có request đang chạy → quan sát mỗi client request hiển thị 1 row.
- Trigger 1 request có nhiều nested combo (vd gpt-5.5 → minimax → minimax-cn) → verify tất cả models flatten thành 1 chain ngang, model con có border tím.
- Trigger 1 request fail → verify row fail xuống dưới cùng.

**Verify**:
- `node --check consoleLogLiveTracker.js`: OK
- `node_modules/.bin/eslint LiveFallbackChain.jsx`: OK
- `node scripts/diepxuan/check-custom-features.mjs`: 634/634 PASS
- `node --test tests/unit/*.test.mjs`: 51/51 PASS

### 2026-08-07 - Single model provider prefix + TokenRouter icon

**Mục đích**: 
1. Single/combo model trong LiveFallbackChain hiển thị provider prefix (icon + label ngắn) trước model name — giúp scan nhanh provider đang được thử mà không cần expand.
2. TokenRouter provider bổ sung icon tại `public/providers/tokenrouter.png` (chưa có từ trước).

**File thay đổi**:
- `public/providers/tokenrouter.png` (mới, 128×128 RGBA, 2.1 KB): 3 node trắng nối nhau trên nền tím `#8B5CF6` (đúng màu `display.color` trong registry). Phù hợp semantic "model aggregator hub". Generate qua sharp + SVG inline (no network).
- `src/diepxuan/app/dashboard/console-log/LiveFallbackChain.jsx`:
  - Import `REGISTRY` từ `open-sse/providers/registry/index.js`. Build `PROVIDER_IDS = new Set()` từ `id` + `alias` + `aliases` của mỗi entry (157 ids, computed once at module load).
  - Gate provider prefix: `hasProviderPrefix = parts.length > 1 && PROVIDER_IDS.has(parts[0])`. Chỉ tách khi `parts[0]` thực sự là provider id/alias đã biết — tránh invent provider cho model không có prefix (vd `minimax`, `gpt-5.5`) hoặc path không hợp lệ (vd `minimaxai/minimax-m3`).
  - Render trước model name: label `providerId` text-only (font-mono 10px, truncate max-w 110px, tooltip `title={providerId}`). Không icon (giữ chain compact).
  - `modelOnly = parts[parts.length - 1]` — chỉ trailing slug. Vd `nvidia/minimaxai/minimax-m3` → `nvidia` + `minimax-m3`. `title={rawName}` trên model span để hover tooltip full path.

**Quyết định thiết kế**:
- Gate trên `PROVIDER_IDS` thay vì hardcode list — theo kịp registry khi có provider mới (vd tokenrouter, aihubmix, ...). Cùng pattern với `src/sse/services/model.js:14`.
- Text-only label (không icon) — Sếp yêu cầu. Icon 14-16px làm chain rộng thêm, không cần thiết.
- Trailing slug thay vì full path sau provider — Sếp yêu cầu gọn. Tooltip vẫn cho full path.
- TokenRouter icon PNG vẫn được add để các chỗ khác trong dashboard dùng (vd Header, ModelSelectModal qua `/providers/{id}.png`); không hiển thị trong LiveFallbackChain.

**Smoke test**:
- Mở `/dashboard/console-log` khi có request đang chạy.
- Model có prefix provider: `#5 nvidia minimax-m3 ✓` (chỉ trailing slug, có label `nvidia` ở giữa).
- Model không có prefix: `#X minimax` hoặc `#X gpt-5.5` (không có provider label).
- Hover vào model span → tooltip hiện full path (vd `nvidia/minimaxai/minimax-m3`).

**Verify**:
- `node_modules/.bin/eslint src/diepxuan/app/dashboard/console-log/LiveFallbackChain.jsx`: exit 0.
- `node --test tests/unit/diepxuan-console-log-tracker.test.mjs`: 24/24 PASS.
- `node scripts/diepxuan/check-custom-features.mjs`: 634/634 PASS.

### 2026-08-07 - Cascade disable model → remove from combos

**Mục đích**: Khi user disable model trong provider (vd NVIDIA `deepseek-ai/deepseek-v4-pro` / `deepseek-ai/deepseek-v4-flash` do EOL), tự động xóa model tương ứng khỏi mọi combo.models[] để combo không reference model đã chết.

**File thay đổi**:
- `src/lib/db/repos/combosRepo.js`: thêm `removeModelsFromAllCombos(ids, providerAlias?)`. Atomic transaction (`db.transaction()`), exact-match string (không prefix inference). Return count combo đã update. Log thông báo `[combosRepo] removed N entries from M combo(s) (triggered by disable on provider "X")`.
- `src/lib/db/index.js`: re-export `removeModelsFromAllCombos`.
- `src/lib/localDb.js`: re-export `removeModelsFromAllCombos` (back-compat shim).
- `src/app/api/models/disabled/route.js` (POST handler): sau `disableModels()` → gọi `removeModelsFromAllCombos(ids, providerAlias)`. Response giờ trả `{success, combosUpdated}`.
- `tests/unit/combos-remove-models.test.js` (mới, 4 case): exact match, no-op với empty/invalid, suffix không match, empty combo.models[].

**Quyết định thiết kế**:
- **General helper, không hardcode 2 model** — pattern giống `renameComboReferences` (~50 dòng), áp dụng được cho mọi provider/model trong tương lai (vd Minimax EOL, OpenAI deprecate).
- **Exact match** — combo.models[] entries phải khớp nguyên si với id từ disable. Không tự thêm prefix (`deepseek-ai/deepseek-v4-pro` không bị xóa khi disable `nvidia/deepseek-ai/deepseek-v4-pro`).
- **Không xóa combo rỗng** — giữ combo với `models: []` cho caller tự quyết (UI có thể hiển thị warning, hoặc user xóa tay).
- **Base file edit hợp lệ** — `combosRepo.js` là infrastructure dùng chung nhưng helper là pure additive (function mới, không sửa existing). Đã ghi trong commit message để Sếp review.

**Smoke test**:
- Mở `/dashboard/providers/nvidia` → disable `deepseek-ai/deepseek-v4-pro`.
- Mở `/dashboard/combos` → combo có reference model đó tự động mất entry.
- Response API trả `{success:true, combosUpdated: N}` với N = số combo bị ảnh hưởng.
- Check DB read-only: `~/.9router/db/data.sqlite` → `SELECT name, models FROM combos WHERE models LIKE '%deepseek-v4-pro%'` trả về 0 rows.

**Verify**:
- `node --check`: 4 file OK.
- `vitest run tests/unit/combos-remove-models.test.js`: 4/4 PASS.
- `vitest run tests/unit/diepxuan-feature-flags.test.js`: 7/7 PASS.
- `node scripts/diepxuan/check-custom-features.mjs`: 634/634 PASS.


### 2026-08-09 - Default LLM combo + unresolvable chat fallback

**Mục đích**: Luôn có combo LLM `default` với models mặc định `["llmfree"]`, nằm đầu danh sách combo, không thể xóa/đổi tên ở API/UI, và các request LLM chat có model không resolve được sẽ chạy qua combo `default`.

**File thay đổi**:
- `src/diepxuan/lib/defaultCombo.js` (mới): hằng số `DEFAULT_COMBO_NAME`, `DEFAULT_COMBO_MODELS`, `ensureDefaultCombo()`, `getCombosWithDefaultFirst()`, `canResolveModel()`, `resolveDefaultComboFallback()`. Chỉ active khi fork enabled và không safe mode.
- `src/app/api/combos/route.js`: GET đảm bảo `default` và trả nó đầu danh sách; POST `default` là ensure/upsert idempotent.
- `src/app/api/combos/[id]/route.js`: GET/PUT/DELETE tự ensure khi không thấy; chặn delete và đổi tên `default`.
- `src/app/api/v1/models/route.js`: gọi `ensureDefaultCombo()` trước khi đọc combos.
- `src/sse/handlers/chat.js`: gọi `resolveDefaultComboFallback()` trước combo routing; chỉ LLM chat bị fallback, không đổi image/TTS/web.
- `src/sse/handlers/search.js`, `src/sse/handlers/fetch.js`: gọi `ensureDefaultCombo()` (chỉ đảm bảo có default LLM, không fallback web vào nó).
- `src/app/(dashboard)/dashboard/combos/page.js`: server order giữ `default` đầu, ẩn nút Delete, disable đổi tên trong edit modal, hiển thị badge Default.
- `tests/unit/diepxuan-default-combo.test.mjs` (mới).
- `docs/custom-features.manifest.json`: thêm feature `default-combo`.
- `memory/2026-08-09.md`: nhật ký khôi phục session bị context overflow và trạng thái verify.

**Quyết định thiết kế**:
- Models default: `["llmfree"]` theo lựa chọn của Sếp ở session plan 2026-08-08.
- Phạm vi fallback: chỉ LLM chat (`/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/api/chat`, `/v1/responses/compact`); image/TTS/web giữ nguyên.
- Trigger: mọi model không resolve được (combo không tồn tại, alias lạ, provider prefix lạ); provider prefix hợp lệ vẫn giữ hành vi lỗi credential hiện tại.
- `default` không thể xóa/đổi tên nhưng vẫn sửa được models/strategy.

**Smoke test**:
- `GET /api/combos` có `default` đầu danh sách, models `["llmfree"]`.
- `DELETE /api/combos/{defaultId}` trả 400 `Default combo cannot be deleted`.
- Gọi `/v1/chat/completions` với model `totally-missing-combo` -> log `Invalid model format, using default combo`, chạy combo `default`.
- Dashboard `/dashboard/combos`: `default` đầu list, không có nút Delete, edit modal disable name.

**Smoke test đã chạy (2026-08-09)**:
- `curl http://127.0.0.1:3000/v1/chat/completions` với `{"model":"tmp","messages":[{"role":"user","content":"Hi"}],"max_tokens":20}` -> HTTP 200, trả `"model":"minimaxai/minimax-m3"`.
- Console log: `Invalid model format, using default combo {"model":"tmp"}` rồi chạy `default -> llmfree -> nvidia -> nvidia/minimaxai/minimax-m3`.
- `GET /api/combos`: `default` đứng đầu, models `["llmfree"]`.
- `npm run build`: PASS.
