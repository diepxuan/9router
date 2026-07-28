# Fork-layer rate-limit metadata + auto-discovery (ADR-007)

> This folder implements the limit resolution engine described in
> `docs/UPDATE-2026-07-28.md` (ADR-007).
>
> Status: **PR #59 (this PR)** — schema + khai báo limits trong registry, **no behavior change**.
> PR tiếp theo (#60) sẽ wire errorParser vào executor, #61 sẽ enable throttle.

## Public API (đã có ở PR #59)

| Export | Module | Mục đích |
|---|---|---|
| `getResolvedLimits({ provider, model, connectionId })` | [index.js](./index.js) | Resolve limits theo 5-tier precedence |
| `getProviderLimits(provider)` | [index.js](./index.js) | Đọc `limits` block từ provider registry |
| `getModelLimits(provider, model)` | [index.js](./index.js) | Đọc `limits` từ model entry (override provider) |
| `getConnectionLimits(connectionId)` | [index.js](./index.js) | Đọc `limits` từ `providerConnections.data.limits` |
| `getAutoDiscoveredLimits(connectionId, provider, model)` | [autoDiscovery.js](./autoDiscovery.js) | DB cache từ 429 |
| `inferredFromModelsDev(provider, model)` | [inference.js](./inference.js) | Heuristic từ `limit.context` |

## Files

| File | PR | Mục đích |
|---|---|---|
| [index.js](./index.js) | #59 | Public API + resolution logic |
| [autoDiscovery.js](./autoDiscovery.js) | #59 | DB layer cho `autoDiscoveredLimits` (chỉ interface) |
| [inference.js](./inference.js) | #59 | models.dev heuristic |
| [errorParser.js](./errorParser.js) | #59 | Pure functions để test (chưa wire executor) |
| [cache.js](./cache.js) | #60 | `rateLimitCounters` table (sliding window events) |
| [window.js](./window.js) | #60 | SlidingWindow class |
| [throttle.js](./throttle.js) | #61 | `acquireQuotaSlot` + wait/reject logic |
| [tests/limits.test.mjs](./tests/limits.test.mjs) | #59 | Unit tests |

## Backward compat (PR #59)

- Provider không khai báo `limits` → `getResolvedLimits()` trả `null`.
- Executor KHÔNG throttle. Behavior 100% giống code cũ.
- DB tables (`rateLimitCounters`, `autoDiscoveredLimits`) chưa được tạo — chờ PR #60.
