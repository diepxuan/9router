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
| NVIDIA + Kilo Code rate limits (provider/override tiers) | `open-sse/diepxuan/registry/nvidia.js`, `open-sse/diepxuan/registry/kilocode.js`, `open-sse/diepxuan/limits/index.js`, `tests/unit/limits-resolution.test.mjs` |
| OpenAI chat-compatible registry | `open-sse/diepxuan/registry/openai.js`, `open-sse/providers/registry/index.js` |
| LLMGateway free/cheap gateway | `open-sse/diepxuan/registry/llmgateway.js`, `open-sse/providers/registry/index.js` |
| Kilo Code free hosted models | `open-sse/diepxuan/registry/kilocode.js`, `open-sse/providers/registry/index.js` |
| Gemini free tier models | `open-sse/diepxuan/registry/gemini.js`, `open-sse/providers/registry/index.js`, `src/diepxuan/app/dashboard/providers/ModelFreeBadge.jsx`, `src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js` |
| MiniMax stripBuiltinTools config | `open-sse/diepxuan/registry/minimax.js`, `minimax-cn.js` |
| Wire vào registry | `open-sse/providers/registry/index.js` |

`src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js` là base file; chỉ thêm import + render badge từ fork layer (`ModelFreeBadge.jsx`) để hiển thị model free.

### 2026-08-05 — Rate-limit registry overrides + resolver fix

- **Feature:** Khai báo `limits` trong NVIDIA registry (provider-level 40 rpm / 1M tpm / concurrency 5 + model override `z-ai/glm-5.2` = 30 rpm, 500k tpm) và Kilo Code (provider-level 200 rph / 4 rpm).
- **Bug fix:** `open-sse/diepxuan/limits/index.js findRegistryEntry` trả entry đầu tiên thay vì entry cuối, khiến fork overrides (ví dụ limits NVIDIA/Kilo) bị base entry (id trùng) shadow. Đã sửa lấy **last match** đúng semantics "last wins".
- **File đổi:** `open-sse/diepxuan/registry/nvidia.js`, `open-sse/diepxuan/registry/kilocode.js`, `open-sse/diepxuan/limits/index.js`, `tests/unit/limits-resolution.test.mjs`.
- **Smoke test:** `node --test tests/unit/limits-resolution.test.mjs` pass 26/26.

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

### 3. Rate-limit engine (ADR-007)

| Feature | File chính |
|---|---|
| Metadata resolution | `open-sse/diepxuan/limits/index.js` |
| Auto-discovery từ 429 | `limits/autoDiscovery.js`, `autoDiscoverHook.js`, `errorParser.js` |
| Throttle sliding window | `limits/throttle.js`, `cache.js`, `window.js` |
| Combo fail tracker + skip | `open-sse/diepxuan/comboHooks.js`, `comboFailTracker.js`, `services/combo.js` |
| Wire vào core | `handlers/chatCore.js`, `utils/error.js`, `services/accountFallback.js` |
| Limits API | `src/app/api/models/limits/route.js` |
| Limits badge UI | `src/diepxuan/app/dashboard/providers/ModelLimitBadge.jsx`, `providers/[id]/ModelRow.js`, `page.js` |
| `/v1/models` limits enrichment | `src/app/api/v1/models/route.js` |

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
- `tests/unit/models-limits-api.test.mjs` — resolved limits + inferred source

Chạy: `node tests/unit/<file>` hoặc `npm test` (nếu có script).

## Smoke test nhanh

- Proxy: `curl http://localhost:3000/api/health`
- Combo: mở `/dashboard/combos`, kiểm tra ctx badge + fallback
- Rate limit: gửi request vượt RPM, kiểm tra throttle/fallback
- Console log: mở `/dashboard/console-log`
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
