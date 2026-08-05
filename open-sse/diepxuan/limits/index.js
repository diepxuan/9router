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

// ─── Tier 1-3: registry-declared ───────────────────────────────────────

/**
 * Find a registry entry by id (or alias). Returns the full entry — including
 * the `limits` block at the top and the `models[]` array with per-model
 * limits. Defensive against missing registry.
 *
 * Registry semantics: fork overrides are appended AFTER the base entry and
 * the LAST entry with the same id wins (see diepxuan/registry/*.js wiring).
 * So this must use the last match, not the first — otherwise fork-declared
 * limits (e.g. NVIDIA free tier, Kilo 200 rph) get shadowed by the base entry.
 *
 * @param {string} provider
 * @returns {object|null}
 */
function findRegistryEntry(provider) {
  if (!Array.isArray(REGISTRY)) return null;
  let found = null;
  for (const e of REGISTRY) {
    if (e && (e.id === provider || e.alias === provider)) found = e;
  }
  return found;
}

/**
 * Read provider-level limits (the `limits` block at the top of the registry).
 * @param {string} provider
 * @returns {object|null}
 */
export function getProviderLimits(provider) {
  if (!isDiepXuanEnabled() || !provider) return null;
  const reg = findRegistryEntry(provider);
  if (!reg) return null;
  return reg.limits || null;
}

/**
 * Read model-level limits (the `limits` field inside a model entry).
 * @param {string} provider
 * @param {string} model
 * @returns {object|null}
 */
export function getModelLimits(provider, model) {
  if (!isDiepXuanEnabled() || !provider || !model) return null;
  const reg = findRegistryEntry(provider);
  if (!reg || !Array.isArray(reg.models)) return null;
  const entry = reg.models.find((m) => m && m.id === model);
  if (!entry) return null;
  return entry.limits || null;
}

// ─── Tier 1: connection-level override ──────────────────────────────────

/**
 * Read limits stored inside a connection's data JSON blob.
 * Defensive: never throws; returns null on missing connection or bad data.
 *
 * @param {object|null|undefined} connection
 * @returns {object|null}
 */
export function getConnectionLimitsFromObj(connection) {
  if (!isDiepXuanEnabled() || !connection) return null;
  let data = connection.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (_) { return null; }
  }
  if (!data || typeof data !== "object") return null;
  return data.limits || null;
}

/**
 * Async wrapper for connection repo. Lazy import to avoid a hard dep cycle
 * with src/lib/db at module-load time (some paths import this from places
 * where the DB is not yet initialised).
 *
 * @param {string} connectionId
 * @returns {Promise<object|null>}
 */
export async function getConnectionLimits(connectionId) {
  if (!isDiepXuanEnabled() || !connectionId) return null;
  try {
    const repo = await import("@/lib/db/repos/connectionsRepo.js");
    const conn = await repo.getProviderConnectionById(connectionId);
    return getConnectionLimitsFromObj(conn);
  } catch (err) {
    // Missing repo on tests / forks without the connection layer → no-op
    return null;
  }
}

// ─── Tier 4: auto-discovered from previous 429s ─────────────────────────

// Re-export for ergonomics
export { getAutoDiscoveredLimits };

// ─── Tier 5: models.dev inference (PR #63) ─────────────────────────────

// Re-export for ergonomics
export { inferLimitsFromContext };

// ─── Resolver ───────────────────────────────────────────────────────────

/**
 * Merge multiple limit objects, lower-priority first → higher-priority last.
 * Numeric fields are taken from the FIRST object that defines them (i.e. the
 * highest priority). Source strings are concatenated for debugging.
 *
 * @param {...object|null|undefined} layers - high → low priority
 * @returns {object|null}
 */
export function mergeLimits(...layers) {
  // Layers are passed high → low priority (e.g. [connection, model, provider,
  // auto, inferred]). Numeric fields come from the FIRST layer that defines
  // them — i.e. the highest priority. policy / maxWaitMs follow the same
  // rule. Source strings are concatenated in their natural order so the UI
  // can show "connection <- model <- provider" for debugging.
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
 * @param {object} args
 * @param {string} args.provider
 * @param {string} args.model
 * @param {string|null|undefined} [args.connectionId]
 * @param {object|null|undefined} [args.connection]  - pre-loaded connection obj
 * @param {number|null|undefined} [args.contextWindow] - for inference fallback
 * @param {boolean} [args.isFreeTier]
 * @returns {object|null}
 */
export function getResolvedLimits({ provider, model, connectionId, connection, contextWindow, isFreeTier }) {
  if (!isDiepXuanEnabled()) return null;
  if (!provider || !model) return null;

  const connLayer = getConnectionLimitsFromObj(connection);
  const modelLayer = getModelLimits(provider, model);
  const providerLayer = getProviderLimits(provider);
  const autoLayer = getAutoDiscoveredLimits(connectionId, provider, model);
  const inferred = (contextWindow != null)
    ? inferLimitsFromContext({ contextWindow, isFreeTier })
    : null;

  // Precedence: connection > model > provider > auto > inferred
  const merged = mergeLimits(connLayer, modelLayer, providerLayer, autoLayer, inferred);
  return merged;
}

// Re-export the pure parser for tests / external callers
export { extractLimitsFromError } from "./errorParser.js";
export { recordAutoDiscoveredLimits, initAutoDiscoveredLimitsTable } from "./autoDiscovery.js";


// ─── 3-Tier Granular Limits (Key Total, Key Per-Model, Model Global) ──

/**
 * Read Key Total limits from registry or connection data.
 * Applied across ALL models sharing this connection/key.
 */
export function getProviderKeyLimits(provider) {
  if (!isDiepXuanEnabled() || !provider) return null;
  const reg = findRegistryEntry(provider);
  return reg ? (reg.keyLimits || null) : null;
}

export function getKeyLimitsFromConnectionObj(connection) {
  if (!isDiepXuanEnabled() || !connection) return null;
  let data = connection.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (_) { return null; }
  }
  return (data && typeof data === "object") ? (data.keyLimits || null) : null;
}

export function getResolvedKeyTotalLimits({ provider, connection }) {
  if (!isDiepXuanEnabled()) return null;
  const connKey = getKeyLimitsFromConnectionObj(connection);
  const provKey = getProviderKeyLimits(provider);
  return mergeLimits(connKey, provKey);
}

/**
 * Read Key Per-Model limits from connection data or registry model entry.
 * Applied to a specific model when invoked through this key/connection.
 */
export function getKeyModelLimitsFromConnectionObj(connection, model) {
  if (!isDiepXuanEnabled() || !connection || !model) return null;
  let data = connection.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (_) { return null; }
  }
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
