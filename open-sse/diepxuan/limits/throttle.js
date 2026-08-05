/**
 * DiepXuan fork-layer: rate-limit throttle engine.
 * PR #61 of ADR-007.
 *
 * `acquireQuotaSlot` is the main entry point. Given a (provider, model,
 * connectionId) triple, it:
 *   1. Resolves the effective limits via getResolvedLimits (PR #59).
 *   2. Reads the sliding-window counters from cache.js.
 *   3. Decides the next action based on `limits.policy`:
 *        - "wait-then-send" (default): sleep until oldest event ages out
 *        - "reject-429": return { acquired: false, reason } immediately
 *        - "fallback": same as reject-429 (caller is expected to fall back)
 *   4. Returns { acquired: true } if the call can proceed. The caller
 *      must invoke `recordRequestOutcome` after the call to commit the
 *      event into the counter table.
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.5.
 */

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import {
  getResolvedLimits,
  getResolvedKeyTotalLimits,
  getResolvedKeyModelLimits,
} from "./index.js";
import {
  readPrunedEvents,
  pushEvent,
} from "./cache.js";
import {
  countEvents,
  sumTokens,
  oldestAgeOutAt,
  projectedAgeOutAt,
  projectedTokensAgeOutAt,
} from "./window.js";

const WINDOW_MS = {
  rpm: 60_000,
  tpm: 60_000,
  rph: 3_600_000,
  rpd: 86_400_000,
};

const DEFAULT_POLICY = "fallback";  // safest: don't block the user
const DEFAULT_MAX_WAIT_MS = 90_000;  // cap wait so we don't hang the request

/**
 * Build scope keys for 3 tiers:
 *   - keyTotalScope: conn:<id>:<provider>/* (applies to ALL models on this key)
 *   - keyModelScope: conn:<id>:<provider>/<model> (applies to a model on this key)
 *   - modelGlobalScope: global:<provider>/<model> (applies to this model system-wide)
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

function buildScope(connectionId, provider, model) {
  return buildKeyModelScope(connectionId, provider, model);
}

/**
 * Estimate the token count of a request body. Conservative — over-estimate
 * rather than under. Falls back to 0 when nothing parseable.
 *
 * @param {object|null|undefined} body
 * @returns {number}
 */
export function estimateTokens(body) {
  if (!body || typeof body !== "object") return 0;
  let chars = 0;
  // Messages array (OpenAI / Anthropic / Responses)
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
  // `input` (Anthropic-style or Responses)
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
  // Tools: count their name + description + parameters JSON
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      if (typeof t?.function?.name === "string") chars += t.function.name.length;
      if (typeof t?.function?.description === "string") chars += t.function.description.length;
      if (t?.function?.parameters) chars += JSON.stringify(t.function.parameters).length;
    }
  }
  // Rough rule of thumb: 4 chars ≈ 1 token (English)
  return Math.ceil(chars / 4);
}

/**
 * @typedef {{
 *   acquired: boolean,
 *   reason?: string,        // "rpm_exceeded" | "tpm_exceeded" | "rph_exceeded" | "rpd_exceeded"
 *   waitMs?: number,        // how long the call will wait (if policy=wait-then-send)
 *   limits?: object|null,   // resolved limits, for logging
 * }} AcquireResult
 */

/**
 * Decide whether a request can proceed and (optionally) how long to wait.
 *
 * @param {object} args
 * @param {string} args.provider
 * @param {string} args.model
 * @param {string|null|undefined} [args.connectionId]
 * @param {object|null|undefined} [args.connection]   - pre-loaded connection
 * @param {number|null|undefined} [args.contextWindow] - for inference fallback
 * @param {boolean} [args.isFreeTier]
 * @param {object|null|undefined} [args.body]         - request body, for TPM estimate
 * @param {number} [args.maxWaitMs]                   - override default
 * @returns {Promise<AcquireResult>}
 */
export async function acquireQuotaSlot({
  provider, model, connectionId, connection, contextWindow, isFreeTier, body,
  maxWaitMs,
}) {
  if (!isDiepXuanEnabled()) return { acquired: true, limits: null };
  if (!provider || !model) return { acquired: true, limits: null };

  const keyTotalLimits = getResolvedKeyTotalLimits({ provider, connection });
  const keyModelLimits = getResolvedKeyModelLimits({ provider, model, connection });
  const modelGlobalLimits = getResolvedLimits({
    provider, model, connectionId, connection, contextWindow, isFreeTier,
  });

  if (!keyTotalLimits && !keyModelLimits && !modelGlobalLimits) {
    return { acquired: true, limits: null };
  }

  const effectiveLimits = [modelGlobalLimits, keyModelLimits, keyTotalLimits].filter(Boolean).reduce((acc, l) => ({ ...l, ...acc }), null);
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

  // Check 3 tiers defensive
  checkScopeLimits(buildKeyTotalScope(connectionId, provider), keyTotalLimits, "key_total");
  checkScopeLimits(buildKeyModelScope(connectionId, provider, model), keyModelLimits, "key_model");
  checkScopeLimits(buildModelGlobalScope(provider, model), modelGlobalLimits, "model_global");
  // Check legacy fallback scope for backward compatibility with older counter keys
  checkScopeLimits(buildKeyModelScope(connectionId, provider, model), modelGlobalLimits, "legacy_model");

  if (violations.length > 0) {
    const maxWait = Math.max(...violations.map((v) => v.waitMs));
    const worst = violations.reduce((a, b) => (b.waitMs > a.waitMs ? b : a));
    if (policy === "wait-then-send" && maxWait > 0 && maxWait <= waitCap) {
      return { acquired: true, waitMs: maxWait, limits: effectiveLimits, reason: worst.reason };
    }
    return { acquired: false, reason: worst.reason, waitMs: maxWait, limits: effectiveLimits };
  }
  return { acquired: true, limits: effectiveLimits };

  // Pick the longest wait as the binding constraint
  const maxWait = Math.max(...violations.map((v) => v.waitMs));
  const worst = violations.reduce((a, b) => (b.waitMs > a.waitMs ? b : a));

  if (policy === "wait-then-send" && maxWait > 0 && maxWait <= waitCap) {
    return { acquired: true, waitMs: maxWait, limits: effectiveLimits, reason: worst.reason };
  }

  return { acquired: false, reason: worst.reason, waitMs: maxWait, limits: effectiveLimits };
}

/**
 * After a request completes (success or fail), record the event so the
 * sliding window reflects it. Call this on every attempted model in a
 * combo so failed attempts also count (prevents hot-spinning on a
 * permanently-broken upstream).
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
