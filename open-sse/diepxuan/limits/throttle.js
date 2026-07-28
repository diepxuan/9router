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
import { getResolvedLimits } from "./index.js";
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
 * Build the scope key. Per-connection so 2 NVIDIA keys don't trample.
 */
function buildScope(connectionId, provider, model) {
  return `${connectionId || "_no_conn"}:${provider}/${model}`;
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

  const limits = getResolvedLimits({
    provider, model, connectionId, connection, contextWindow, isFreeTier,
  });
  if (!limits) return { acquired: true, limits: null };

  const policy = limits.policy || DEFAULT_POLICY;
  const waitCap = Number.isFinite(maxWaitMs) ? maxWaitMs
    : Number.isFinite(limits.maxWaitMs) ? limits.maxWaitMs
    : DEFAULT_MAX_WAIT_MS;
  const scope = buildScope(connectionId, provider, model);
  const now = Date.now();

  // ─── Check each window with a limit ───────────────────────────────
  /** @type {Array<{reason: string, waitMs: number}>} */
  const violations = [];

  if (Number.isFinite(limits.rpm) && limits.rpm > 0) {
    const ev = readPrunedEvents(scope, "rpm", WINDOW_MS.rpm);
    if (countEvents(ev) >= limits.rpm) {
      violations.push({ reason: "rpm_exceeded", waitMs: oldestAgeOutAt(ev, WINDOW_MS.rpm, now) - now });
    }
  }
  if (Number.isFinite(limits.tpm) && limits.tpm > 0) {
    const ev = readPrunedEvents(scope, "tpm", WINDOW_MS.tpm);
    const projected = estimateTokens(body) + 4096; // +headroom for output
    if (sumTokens(ev) + projected > limits.tpm) {
      violations.push({
        reason: "tpm_exceeded",
        waitMs: projectedTokensAgeOutAt(ev, WINDOW_MS.tpm, projected) - now,
      });
    }
  }
  if (Number.isFinite(limits.rph) && limits.rph > 0) {
    const ev = readPrunedEvents(scope, "rph", WINDOW_MS.rph);
    if (countEvents(ev) >= limits.rph) {
      violations.push({ reason: "rph_exceeded", waitMs: oldestAgeOutAt(ev, WINDOW_MS.rph, now) - now });
    }
  }
  if (Number.isFinite(limits.rpd) && limits.rpd > 0) {
    const ev = readPrunedEvents(scope, "rpd", WINDOW_MS.rpd);
    if (countEvents(ev) >= limits.rpd) {
      violations.push({ reason: "rpd_exceeded", waitMs: oldestAgeOutAt(ev, WINDOW_MS.rpd, now) - now });
    }
  }

  if (violations.length === 0) return { acquired: true, limits };

  // Pick the longest wait as the binding constraint
  const maxWait = Math.max(...violations.map((v) => v.waitMs));
  const worst = violations.reduce((a, b) => (b.waitMs > a.waitMs ? b : a));

  if (policy === "wait-then-send" && maxWait > 0 && maxWait <= waitCap) {
    return { acquired: true, waitMs: maxWait, limits, reason: worst.reason };
  }

  return { acquired: false, reason: worst.reason, waitMs: maxWait, limits };
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
  const scope = buildScope(connectionId, provider, model);
  const ts = Date.now();
  pushEvent(scope, "rpm", WINDOW_MS.rpm, ts, 0);
  pushEvent(scope, "tpm", WINDOW_MS.tpm, ts, total);
  pushEvent(scope, "rph", WINDOW_MS.rph, ts, 0);
  pushEvent(scope, "rpd", WINDOW_MS.rpd, ts, 0);
}

export { WINDOW_MS, buildScope };
