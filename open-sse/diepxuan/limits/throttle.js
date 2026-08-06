/**
 * DiepXuan fork-layer: rate-limit throttle engine (ADR-007 PR #61).
 *
 * `acquireQuotaSlot` resolves three independent limits per request:
 *   1. Key Total       (conn:<id>:<provider>/*)  — shared by ALL models on a key
 *   2. Key Per-Model   (conn:<id>:<provider>/<m>) — a key's per-model cap
 *   3. Model Global    (global:<provider>/<m>)    — system-wide model cap
 *
 * Each tier is checked against its own sliding-window counter; the
 * worst violation (longest waitMs) wins. The `effectiveLimits` block
 * passed to callers is the union of all configured tiers so logging
 * carries the full context.
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.5.
 */

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import {
  getResolvedLimits,
  getResolvedKeyTotalLimits,
  getResolvedKeyModelLimits,
} from "./index.js";
import { readPrunedEvents, pushEvent } from "./cache.js";
import {
  countEvents,
  sumTokens,
  oldestAgeOutAt,
  projectedTokensAgeOutAt,
} from "./window.js";

// Lazy-load a connection row by id so callers that only know connectionId
// (e.g. comboHooks) still see their key-level limits. Defensive: returns
// null when repo missing or row not found so unconfigured keys bypass.
async function loadConnectionById(connectionId) {
  if (!connectionId) return null;
  try {
    const repo = await import("@/lib/db/repos/connectionsRepo.js");
    return (await repo.getProviderConnectionById(connectionId)) || null;
  } catch (_) {
    return null;
  }
}

const WINDOW_MS = {
  rpm: 60_000,
  tpm: 60_000,
  rph: 3_600_000,
  rpd: 86_400_000,
};

const DEFAULT_POLICY = "fallback";
const DEFAULT_MAX_WAIT_MS = 90_000;

/**
 * Build scope keys for 3 tiers.
 *   - keyTotalScope: conn:<id>:<provider>/* (ALL models on this key)
 *   - keyModelScope: conn:<id>:<provider>/<m> (a model on this key)
 *   - modelGlobalScope: global:<provider>/<m> (system-wide)
 */
function buildKeyTotalScope(connectionId, provider) {
  return `conn:${connectionId || "_no_conn"}:${provider}/*`;
}
function buildKeyModelScope(connectionId, provider, model) {
  return `conn:${connectionId || "_no_conn"}:${provider}/${model}`;
}
function buildModelGlobalScope(provider, model) {
  return `global:${provider}/${model}`;
}
// Kept for backward compat with cache tests / external callers.
function buildScope(connectionId, provider, model) {
  return buildKeyModelScope(connectionId, provider, model);
}

export function estimateTokens(body) {
  if (!body || typeof body !== "object") return 0;
  let chars = 0;
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      if (typeof m?.content === "string") chars += m.content.length;
      else if (Array.isArray(m?.content)) {
        for (const c of m.content) {
          if (typeof c?.text === "string") chars += c.text.length;
        }
      }
    }
  }
  if (Array.isArray(body.input)) {
    for (const m of body.input) {
      if (typeof m?.content === "string") chars += m.content.length;
      else if (Array.isArray(m?.content)) {
        for (const c of m.content) {
          if (typeof c?.text === "string") chars += c.text.length;
        }
      }
    }
  }
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      if (typeof t?.function?.name === "string") chars += t.function.name.length;
      if (typeof t?.function?.description === "string") chars += t.function.description.length;
      if (t?.function?.parameters) chars += JSON.stringify(t.function.parameters).length;
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * @typedef {{
 *   acquired: boolean,
 *   reason?: string,
 *   waitMs?: number,
 *   limits?: object|null,
 * }} AcquireResult
 */

/**
 * Decide whether a request can proceed and (optionally) how long to wait.
 *
 * @param {object} args
 * @param {string} args.provider
 * @param {string} args.model
 * @param {string|null|undefined} [args.connectionId]
 * @param {object|null|undefined} [args.connection]
 * @param {number|null|undefined} [args.contextWindow]
 * @param {boolean} [args.isFreeTier]
 * @param {object|null|undefined} [args.body]
 * @param {number} [args.maxWaitMs]
 * @returns {Promise<AcquireResult>}
 */
export async function acquireQuotaSlot({
  provider, model, connectionId, connection, contextWindow, isFreeTier, body,
  maxWaitMs,
}) {
  if (!isDiepXuanEnabled()) return { acquired: true, limits: null };
  if (!provider || !model) return { acquired: true, limits: null };

  // Resolve the connection once. `comboHooks` only passes connectionId,
  // so we have to fall back to a lazy DB lookup to honour per-key limits.
  const conn = connection || (await loadConnectionById(connectionId));

  const keyTotalLimits = getResolvedKeyTotalLimits({ provider, connection: conn });
  const keyModelLimits = getResolvedKeyModelLimits({ provider, model, connection: conn });
  // Model Global skips the connection-key layer so a key's `connection.limits`
  // can never leak into the global scope and block other keys sharing the
  // same model. (This was a real bug in the prior commit — see fix fde7a0a2.)
  //
  // `connectionId` is forwarded on purpose: the auto-discovered limits layer
  // (ADR-007 §2.4) is keyed by (connectionId, provider, model) and
  // `getAutoDiscoveredLimits` short-circuits to `null` when connectionId is
  // missing. Without this, throttle would never pick up limits learned from
  // a previous 429 for the same key. (Fix shipped as PR #68 follow-up.)
  const modelGlobalLimits = getResolvedLimits({
    provider, model, connection: conn, connectionId, contextWindow, isFreeTier,
    skipConnectionLayer: true,
  });

  if (!keyTotalLimits && !keyModelLimits && !modelGlobalLimits) {
    return { acquired: true, limits: null };
  }

  // effectiveLimits is the union of all configured tiers, with the
  // following precedence (highest → lowest):
  //   modelGlobal > keyModel > keyTotal
  // Reduce spreads `l` LAST so the first element in the array ends
  // up as the lowest-priority fill. Putting modelGlobal last means
  // its rpm/tpm/concurrency win; keyTotal at index 0 only fills
  // fields nothing else set. policy/maxWaitMs follow the same rule
  // so the strictest tier's behaviour always wins (e.g. modelGlobal
  // policy=reject-429 must NOT be downgraded to keyTotal's
  // wait-then-send by the union).
  //
  // NOTE: the actual acquire/wait decision is per-scope (key_total,
  // key_model, model_global counters are independent), so the
  // effectiveLimits value is only used for policy + maxWaitMs +
  // logging. A breach on ANY scope still surfaces its own reason.
  const effectiveLimits = [keyTotalLimits, keyModelLimits, modelGlobalLimits]
    .filter(Boolean)
    .reduce((acc, l) => ({ ...acc, ...l }), null);
  const policy = effectiveLimits.policy || DEFAULT_POLICY;
  const waitCap = Number.isFinite(maxWaitMs) ? maxWaitMs
    : Number.isFinite(effectiveLimits.maxWaitMs) ? effectiveLimits.maxWaitMs
    : DEFAULT_MAX_WAIT_MS;

  const now = Date.now();
  const projectedTokens = estimateTokens(body) + 4096;
  /** @type {Array<{reason: string, waitMs: number}>} */
  const violations = [];

  function checkScopeLimits(scopeKey, lims, prefix) {
    if (!lims) return;
    if (Number.isFinite(lims.rpm) && lims.rpm > 0) {
      const ev = readPrunedEvents(scopeKey, "rpm", WINDOW_MS.rpm);
      if (countEvents(ev) >= lims.rpm) {
        violations.push({ reason: `${prefix}_rpm_exceeded`, waitMs: oldestAgeOutAt(ev, WINDOW_MS.rpm, now) - now });
      }
    }
    if (Number.isFinite(lims.tpm) && lims.tpm > 0) {
      const ev = readPrunedEvents(scopeKey, "tpm", WINDOW_MS.tpm);
      if (sumTokens(ev) + projectedTokens > lims.tpm) {
        violations.push({
          reason: `${prefix}_tpm_exceeded`,
          waitMs: projectedTokensAgeOutAt(ev, WINDOW_MS.tpm, projectedTokens) - now,
        });
      }
    }
    if (Number.isFinite(lims.rph) && lims.rph > 0) {
      const ev = readPrunedEvents(scopeKey, "rph", WINDOW_MS.rph);
      if (countEvents(ev) >= lims.rph) {
        violations.push({ reason: `${prefix}_rph_exceeded`, waitMs: oldestAgeOutAt(ev, WINDOW_MS.rph, now) - now });
      }
    }
    if (Number.isFinite(lims.rpd) && lims.rpd > 0) {
      const ev = readPrunedEvents(scopeKey, "rpd", WINDOW_MS.rpd);
      if (countEvents(ev) >= lims.rpd) {
        violations.push({ reason: `${prefix}_rpd_exceeded`, waitMs: oldestAgeOutAt(ev, WINDOW_MS.rpd, now) - now });
      }
    }
  }

  // Each scope is evaluated exactly once. Precedence is encoded into
  // the scope key, not the call order.
  checkScopeLimits(buildKeyTotalScope(connectionId, provider), keyTotalLimits, "key_total");
  checkScopeLimits(buildKeyModelScope(connectionId, provider, model), keyModelLimits, "key_model");
  checkScopeLimits(buildModelGlobalScope(provider, model), modelGlobalLimits, "model_global");

  if (violations.length === 0) {
    return { acquired: true, limits: effectiveLimits };
  }
  const maxWait = Math.max(...violations.map((v) => v.waitMs));
  const worst = violations.reduce((a, b) => (b.waitMs > a.waitMs ? b : a));
  if (policy === "wait-then-send" && maxWait > 0 && maxWait <= waitCap) {
    return { acquired: true, waitMs: maxWait, limits: effectiveLimits, reason: worst.reason };
  }
  return { acquired: false, reason: worst.reason, waitMs: maxWait, limits: effectiveLimits };
}

/**
 * After a request completes (success or fail), record the event into
 * all 3 scope counters so the next acquireQuotaSlot sees the usage.
 *
 * @param {object} args
 * @param {string} args.provider
 * @param {string} args.model
 * @param {string|null|undefined} [args.connectionId]
 * @param {number} [args.promptTokens=0]
 * @param {number} [args.completionTokens=0]
 */
export function recordRequestOutcome({ provider, model, connectionId, promptTokens = 0, completionTokens = 0 }) {
  if (!isDiepXuanEnabled() || !provider || !model) return;
  const total = (promptTokens || 0) + (completionTokens || 0);
  const ts = Date.now();
  const scopes = [
    buildKeyTotalScope(connectionId, provider),
    buildKeyModelScope(connectionId, provider, model),
    buildModelGlobalScope(provider, model),
  ];
  for (const sc of scopes) {
    pushEvent(sc, "rpm", WINDOW_MS.rpm, ts, 0);
    pushEvent(sc, "tpm", WINDOW_MS.tpm, ts, total);
    pushEvent(sc, "rph", WINDOW_MS.rph, ts, 0);
    pushEvent(sc, "rpd", WINDOW_MS.rpd, ts, 0);
  }
}

export { WINDOW_MS, buildScope };
