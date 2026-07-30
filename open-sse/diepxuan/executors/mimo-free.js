// Created: 2026-07-24 by 9Router Agent (fork-layer)
// Purpose:
//   Wrap the base MimoFreeExecutor so the upstream "high-frequency
//   non-compliant requests" response (HTTP 400, error.code "441") is
//   surfaced as a 1-hour cooldown via parseError().
//
// Root cause (logged 2026-07-24 in requestDetails):
//   Provider `mimo-free` (alias `mmf`, model `mimo-auto`) returned 6 errors
//   in a 1-hour window. Upstream JSON:
//     { "error": { "code": "441",
//                  "message": "Detected high-frequency non-compliant requests..." } }
//   We were persisting the message but no `resetsAtMs`, so the retry loop
//   hit the same wall repeatedly.
//
// Fix:
//   - Subclass base executor and add parseError(response, bodyText).
//     error.js (open-sse/utils/error.js) already routes the call:
//       if (executor && typeof executor.parseError === "function") { ... }
//   - Return { status, message, resetsAtMs } for code 441 — flow:
//       parseUpstreamError -> returns resetsAtMs
//       chatCore.js -> tracks cooldown, combo fallback skips connection
//       observability row records status=429 + resetsAtMs for diagnostics.
//
// Scope:
//   ONLY the fork wrapper around `mimo-free` / `mmf`.  All other executors
//   are unchanged. When `DIEPXUAN_ENABLED=false`, the registry falls back
//   to the base executor — upstream behaviour is restored byte-for-byte.

import { MimoFreeExecutor } from "../../executors/mimo-free.js";

// Symbols used by upstream to flag rate-limit/cooldown responses.
// "441" matches the actual JSON code, since HTTP stays 400 even for
// rate-limits here.
export const MIMO_RATE_LIMIT_CODES = new Set(["441"]);

// 1 hour cooldown. MiMo text says "appeal through official website channels",
// so retrying inside the same hour has near-zero chance of success.
const MIMO_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Try to recognise the MiMo rate-limit response and return a cooldown.
 * Returns null when the response does not match, so the upstream default
 * parser still produces message for everything else.
 *
 * @param {Response} response
 * @param {string} bodyText
 * @returns {null | {status: number, message: string, resetsAtMs: number}}
 */
export function parseMimoFreeError(response, bodyText) {
  if (!response || response.status !== 400) return null;

  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }

  const err = parsed && parsed.error;
  if (!err || typeof err !== "object") return null;
  const code = err.code != null ? String(err.code) : "";
  if (!code || !MIMO_RATE_LIMIT_CODES.has(code)) return null;

  const message =
    (typeof err.message === "string" && err.message) ||
    "MiMo rate-limited; cooldown applied";
  return {
    status: 429,
    message,
    resetsAtMs: Date.now() + MIMO_COOLDOWN_MS,
  };
}

export class DiepxuanMimoFreeExecutor extends MimoFreeExecutor {
  constructor() {
    super();
  }

  parseError(response, bodyText) {
    return parseMimoFreeError(response, bodyText);
  }
}

export default DiepxuanMimoFreeExecutor;
