/**
 * DiepXuan fork-layer hook: auto-discover rate limits from upstream 429/403
 * responses. PR #60 of ADR-007.
 *
 * Wired into the error-handling path in handlers/chatCore.js. Fires AFTER
 * `parseUpstreamError` extracts `body` + `errorBody`, so we have all the
 * context we need (status, headers, body, model, provider, connectionId).
 *
 * Flow:
 *   1. parseUpstreamError returns parsed error
 *   2. We call extractLimitsFromError(...) on the raw response (status +
 *      headers + body) — pure function, returns {rpm, tpm, ...} or null.
 *   3. If non-null AND we have a connectionId, call
 *      recordAutoDiscoveredLimits(...) to UPSERT into the local DB cache.
 *   4. Next request reads from getAutoDiscoveredLimits() and applies the
 *      rate-limit policy. Closes the loop.
 *
 * All side-effects are gated on isDiepXuanEnabled() so this is a no-op
 * when the fork flag is off (matches upstream behaviour byte-for-byte).
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.4.
 */

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import { extractLimitsFromError } from "./errorParser.js";
import {
  recordAutoDiscoveredLimits,
  initAutoDiscoveredLimitsTable,
} from "./autoDiscovery.js";

let _initialised = false;

/**
 * Lazy one-shot table init. Called from `maybeRecordLimitsFromUpstreamError`
 * so we don't need to wire into a startup hook (which would be a base-file
 * change). Safe to call multiple times — init is idempotent.
 */
function ensureInit() {
  if (_initialised) return;
  if (!isDiepXuanEnabled()) return;
  try {
    initAutoDiscoveredLimitsTable();
    _initialised = true;
  } catch (err) {
    // Non-fatal — log and continue. Auto-discovery is best-effort.
    if (process.env.DIEPXUAN_DEBUG) {
      console.warn("[AutoDiscover] init failed:", err?.message || err);
    }
  }
}

/**
 * Inspect a failed upstream response and (best-effort) record its rate-limit
 * hints to the local DB cache. Returns `true` when something was written,
 * `false` otherwise (no-op path is the common case).
 *
 * @param {object} args
 * @param {number} args.status            - HTTP status from parseUpstreamError
 * @param {Response|object|null} args.response - The raw fetch Response, or
 *   an object with .headers (we tolerate both). Headers are read-only here.
 * @param {string|object|null|undefined} args.body - Raw body string or
 *   already-parsed JSON object.
 * @param {string|null|undefined} args.connectionId
 * @param {string} args.provider
 * @param {string} args.model
 * @returns {boolean}
 */
export function maybeRecordLimitsFromUpstreamError({ status, response, body, connectionId, provider, model }) {
  if (!isDiepXuanEnabled()) return false;
  if (!connectionId || !provider || !model) return false;
  ensureInit();

  // Build a headers bag the parser understands. `response.headers` may be a
  // Headers instance, a plain object, or null.
  let headers = null;
  if (response && typeof response === "object") {
    if (typeof response.headers?.entries === "function") {
      headers = {};
      try {
        for (const [k, v] of response.headers.entries()) headers[k] = v;
      } catch (_) { headers = null; }
    } else if (response.headers && typeof response.headers === "object") {
      headers = response.headers;
    }
  }

  const extracted = extractLimitsFromError({ status, headers, body });
  if (!extracted) return false;

  // Strip helper-only fields before persisting
  const { evidence, ...limits } = extracted;
  void evidence; // evidence is included in the limits object but not stored
  const written = recordAutoDiscoveredLimits({
    connectionId,
    provider,
    model,
    limits,
    evidence: extracted.evidence || "",
  });

  if (written && process.env.DIEPXUAN_DEBUG) {
    console.log(`[AutoDiscover] recorded limits for ${provider}/${model} (conn=${connectionId.slice(0, 8)}):`, limits);
  }
  return written;
}
