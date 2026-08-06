/**
 * DiepXuan fork-layer: limit resolution engine.
 *
 * Public API for rate-limit metadata. Resolution order (high → low priority,
 * ưu tiên càng cao càng thắng):
 *
 *   1. connection.limits      — user-overridden on the api-key
 *   2. model.limits           — registry override for specific model
 *   3. provider.limits        — registry default for the provider
 *   4. autoDiscoveredLimits   — DB cache from a previous 429 (PR #60+)
 *   5. inferred (models.dev)  — heuristic from limit.context (PR #63)
 *   6. null                   — no throttle
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.1.
 *
 * PR #59 status: API + resolution logic + tests. No behaviour change for
 * existing providers (they return null). PR #60 wires the error parser;
 * PR #61 wires the throttle.
 */

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import REGISTRY from "../../providers/registry/index.js";
import { getAutoDiscoveredLimits } from "./autoDiscovery.js";
import { inferLimitsFromContext } from "./inference.js";

function findRegistryEntry(provider) {
  if (!Array.isArray(REGISTRY)) return null;
  let found = null;
  for (const e of REGISTRY) {
    if (e && (e.id === provider || e.alias === provider)) found = e;
  }
  return found;
}

export function getProviderLimits(provider) {
  if (!isDiepXuanEnabled() || !provider) return null;
  const reg = findRegistryEntry(provider);
  if (!reg) return null;
  return reg.limits || null;
}

export function getModelLimits(provider, model) {
  if (!isDiepXuanEnabled() || !provider || !model) return null;
  const reg = findRegistryEntry(provider);
  if (!reg || !Array.isArray(reg.models)) return null;
  const entry = reg.models.find((m) => m && m.id === model);
  if (!entry) return null;
  return entry.limits || null;
}

/**
 * Read the JSON blob stored on a connection. Two input shapes are supported:
 *   1. Raw DB row: { data: '{ "limits": ... }' }  — `data` is a JSON string.
 *   2. Flattened connection from connectionsRepo.getProviderConnectionById():
 *      { data: { limits, keyLimits, modelLimits, ... } } — `data` is an object
 *      already parsed and merged with row columns.
 * Both must work because throttle.lazy-load uses the flattened shape, while
 * tests / callers with raw rows still pass a string.
 */
function readConnectionData(connection) {
  if (!connection) return null;
  let data = connection.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (_) { return null; }
  }
  return (data && typeof data === "object") ? data : null;
}

export function getConnectionLimitsFromObj(connection) {
  if (!isDiepXuanEnabled() || !connection) return null;
  const data = readConnectionData(connection);
  return data ? (data.limits || null) : null;
}

export async function getConnectionLimits(connectionId) {
  if (!isDiepXuanEnabled() || !connectionId) return null;
  try {
    const repo = await import("@/lib/db/repos/connectionsRepo.js");
    const conn = await repo.getProviderConnectionById(connectionId);
    return getConnectionLimitsFromObj(conn);
  } catch (err) {
    return null;
  }
}

export { getAutoDiscoveredLimits };
export { inferLimitsFromContext };

export function mergeLimits(...layers) {
  const out = {};
  const sources = [];
  let policy;
  let maxWaitMs;
  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    for (const k of ["rpm", "tpm", "rph", "rpd", "concurrency"]) {
      if (out[k] == null && Number.isFinite(layer[k]) && layer[k] > 0) {
        out[k] = layer[k];
      }
    }
    if (policy == null && typeof layer.policy === "string") policy = layer.policy;
    if (maxWaitMs == null && Number.isFinite(layer.maxWaitMs) && layer.maxWaitMs > 0) {
      maxWaitMs = layer.maxWaitMs;
    }
    if (typeof layer.source === "string") sources.push(layer.source);
  }
  if (Object.keys(out).length === 0 && !policy && !maxWaitMs) return null;
  if (policy) out.policy = policy;
  if (maxWaitMs) out.maxWaitMs = maxWaitMs;
  if (sources.length > 0) out.source = sources.join(" <- ");
  return out;
}

/**
 * Resolve the effective limits for a (provider, model, connection) triple.
 * Returns null if no source provides a usable limit (means: do not throttle).
 *
 * NOTE: this resolver is for **Model Global** limits. The connection's
 * per-key override (`connection.limits`) is intentionally considered
 * here because the comment in the previous version said "connection
 * beats all other layers" — and downstream tests rely on that behaviour.
 * The 3-tier throttle then ALSO reads `keyLimits` / `modelLimits` from
 * the same connection via the dedicated helpers below; it never feeds
 * this resolver's output into the key scopes, so the global tier
 * cannot leak into other keys.
 */
export function getResolvedLimits({ provider, model, connection, connectionId, contextWindow, isFreeTier, skipConnectionLayer = false }) {
  if (!isDiepXuanEnabled()) return null;
  if (!provider || !model) return null;

  const connLayer = skipConnectionLayer ? null : getConnectionLimitsFromObj(connection);
  const modelLayer = getModelLimits(provider, model);
  const providerLayer = getProviderLimits(provider);
  const autoLayer = getAutoDiscoveredLimits(connectionId || null, provider, model);
  const inferred = (contextWindow != null)
    ? inferLimitsFromContext({ contextWindow, isFreeTier })
    : null;

  const merged = mergeLimits(connLayer, modelLayer, providerLayer, autoLayer, inferred);
  return merged;
}

// ─── 3-Tier Granular Limits (Key Total, Key Per-Model, Model Global) ──

export function getProviderKeyLimits(provider) {
  if (!isDiepXuanEnabled() || !provider) return null;
  const reg = findRegistryEntry(provider);
  return reg ? (reg.keyLimits || null) : null;
}

export function getKeyLimitsFromConnectionObj(connection) {
  if (!isDiepXuanEnabled() || !connection) return null;
  const data = readConnectionData(connection);
  return data ? (data.keyLimits || null) : null;
}

export function getResolvedKeyTotalLimits({ provider, connection }) {
  if (!isDiepXuanEnabled()) return null;
  const connKey = getKeyLimitsFromConnectionObj(connection);
  const provKey = getProviderKeyLimits(provider);
  return mergeLimits(connKey, provKey);
}

export function getKeyModelLimitsFromConnectionObj(connection, model) {
  if (!isDiepXuanEnabled() || !connection || !model) return null;
  const data = readConnectionData(connection);
  if (!data || typeof data !== "object") return null;
  if (data.modelLimits && typeof data.modelLimits === "object") {
    return data.modelLimits[model] || null;
  }
  return null;
}

export function getRegistryKeyModelLimits(provider, model) {
  if (!isDiepXuanEnabled() || !provider || !model) return null;
  const reg = findRegistryEntry(provider);
  if (!reg || !Array.isArray(reg.models)) return null;
  const entry = reg.models.find((m) => m && m.id === model);
  return entry ? (entry.keyLimits || entry.modelLimitsPerKey || null) : null;
}

export function getResolvedKeyModelLimits({ provider, model, connection }) {
  if (!isDiepXuanEnabled()) return null;
  const connKeyModel = getKeyModelLimitsFromConnectionObj(connection, model);
  const regKeyModel = getRegistryKeyModelLimits(provider, model);
  return mergeLimits(connKeyModel, regKeyModel);
}

export { extractLimitsFromError } from "./errorParser.js";
export { recordAutoDiscoveredLimits, initAutoDiscoveredLimitsTable } from "./autoDiscovery.js";
