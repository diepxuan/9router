/**
 * DiepXuan fork-layer: infer rate limits from a known model catalog.
 *
 * Sếp chấp thuận (2026-07-28) dùng heuristic từ `limit.context` để suy ra
 * RPM/TPM khi registry không khai báo. Nguồn: models.dev (https://models.dev/api.json)
 * — MIT-licensed community catalog. Cached locally, refreshed weekly.
 *
 * Heuristic (deliberate conservative — under-throttle is safer than over):
 *   context >= 1_000_000  →  tpm 1_000_000, rpm 30
 *   context >= 200_000     →  tpm   500_000, rpm 40
 *   context >= 100_000     →  tpm   200_000, rpm 60
 *   context <  100_000     →  tpm   100_000, rpm 80
 *   free-tier provider     →  rpm * 0.5 (clamped min 5)
 *
 * PR #59: exports the pure `inferLimitsFromContext()` helper. The catalog
 * fetcher is wired in PR #63.
 */

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

/**
 * @param {object} args
 * @param {number} args.contextWindow
 * @param {boolean} [args.isFreeTier]
 * @returns {{ rpm: number, tpm: number, source: string } | null}
 */
export function inferLimitsFromContext({ contextWindow, isFreeTier = true }) {
  if (!isDiepXuanEnabled()) return null;
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return null;

  let rpm, tpm;
  if (contextWindow >= 1_000_000) {
    rpm = 30; tpm = 1_000_000;
  } else if (contextWindow >= 200_000) {
    rpm = 40; tpm = 500_000;
  } else if (contextWindow >= 100_000) {
    rpm = 60; tpm = 200_000;
  } else {
    rpm = 80; tpm = 100_000;
  }

  if (isFreeTier) {
    rpm = Math.max(5, Math.floor(rpm * 0.5));
  }

  return { rpm, tpm, source: "inferred-from-context" };
}

/**
 * Lookup context window from a pre-loaded catalog entry.
 * @param {object|null|undefined} catalogEntry - { limit: { context, output } } from models.dev
 */
export function inferFromCatalogEntry(catalogEntry) {
  if (!catalogEntry || !catalogEntry.limit) return null;
  const ctx = catalogEntry.limit.context;
  if (!Number.isFinite(ctx)) return null;
  return inferLimitsFromContext({ contextWindow: ctx });
}
