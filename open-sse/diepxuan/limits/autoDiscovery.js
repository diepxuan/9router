/**
 * DiepXuan fork-layer: auto-discovered limits from upstream 429 responses.
 *
 * This module manages the `autoDiscoveredLimits` SQLite table. When an upstream
 * returns HTTP 429 with a rate-limit hint (e.g. "Requests limit = 40 / minute"),
 * errorParser.js extracts the value and we UPSERT it here. Future requests read
 * from this table to get the limit without a registry edit.
 *
 * Status (PR #59): Table creation + read API only. Write API (recordAuto...)
 * is wired in PR #60. All functions are no-ops when the table is missing so
 * existing forks don't break.
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.4.
 */

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import { getSharedDb } from "../db/sharedDb.js";

const TABLE_NAME = "auto_discovered_limits_diepxuan";

function getDb() {
  if (!isDiepXuanEnabled()) return null;
  return getSharedDb();
}

/**
 * Ensure the auto_discovered_limits table exists. Idempotent; safe to call
 * repeatedly. PR #59: do not call from production code — auto init runs in
 * PR #60 to keep this PR behaviour-neutral.
 */
export function initAutoDiscoveredLimitsTable() {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        connectionId TEXT NOT NULL,
        provider      TEXT NOT NULL,
        model         TEXT NOT NULL,
        rpm           INTEGER,
        tpm           INTEGER,
        rph           INTEGER,
        rpd           INTEGER,
        concurrency   INTEGER,
        source        TEXT NOT NULL DEFAULT 'auto-429-detection',
        evidence      TEXT,
        firstSeenAt   INTEGER NOT NULL,
        lastSeenAt    INTEGER NOT NULL,
        hitCount      INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (connectionId, provider, model)
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_adl_provider ON ${TABLE_NAME}(provider, model)`);
  } catch (err) {
    console.warn("[AutoDiscoveredLimits] Failed to create table:", err?.message || err);
  }
}

/**
 * Read auto-discovered limits. Returns null if no record exists (or if the
 * table is missing on old forks).
 *
 * @param {string} connectionId
 * @param {string} provider
 * @param {string} model
 * @returns {{
 *   rpm?: number, tpm?: number, rph?: number, rpd?: number, concurrency?: number,
 *   source: string, evidence: string, firstSeenAt: number, lastSeenAt: number, hitCount: number
 * } | null}
 */
export function getAutoDiscoveredLimits(connectionId, provider, model) {
  if (!isDiepXuanEnabled() || !connectionId) return null;
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare(
      `SELECT rpm, tpm, rph, rpd, concurrency, source, evidence, firstSeenAt, lastSeenAt, hitCount
       FROM ${TABLE_NAME} WHERE connectionId = ? AND provider = ? AND model = ?`
    ).get(connectionId, provider, model);
    if (!row) return null;
    return {
      rpm: row.rpm ?? undefined,
      tpm: row.tpm ?? undefined,
      rph: row.rph ?? undefined,
      rpd: row.rpd ?? undefined,
      concurrency: row.concurrency ?? undefined,
      source: row.source,
      evidence: row.evidence,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      hitCount: row.hitCount,
    };
  } catch (err) {
    // Table doesn't exist on old fork → no-op
    if (err && /no such table/i.test(err.message || "")) return null;
    console.warn("[AutoDiscoveredLimits] Read failed:", err?.message || err);
    return null;
  }
}

/**
 * UPSERT auto-discovered limits into the local cache table.
 *
 * Conflict policy: if a previous record already exists for the same
 * (connectionId, provider, model) AND the new limits are EXACTLY equal to
 * the old ones, we just bump hitCount + update lastSeenAt. If the new
 * limits differ, we KEEP the FIRST observation and log a warning — this
 * protects against flaky extractor parses picking up unrelated numbers
 * (e.g. a per-day counter inside an hourly error message).
 *
 * Returns true on write, false on no-op (caller may log).
 *
 * @param {{
 *   connectionId: string, provider: string, model: string,
 *   limits: { rpm?: number, tpm?: number, rph?: number, rpd?: number, concurrency?: number },
 *   evidence: string,
 * }} args
 * @returns {boolean}
 */
export function recordAutoDiscoveredLimits({ connectionId, provider, model, limits, evidence }) {
  if (!isDiepXuanEnabled() || !connectionId || !provider || !model) return false;
  const db = getDb();
  if (!db) return false;
  // Sanity: at least one numeric field is present
  const has = (v) => Number.isFinite(v) && v > 0;
  const rpm = has(limits.rpm) ? Math.floor(limits.rpm) : null;
  const tpm = has(limits.tpm) ? Math.floor(limits.tpm) : null;
  const rph = has(limits.rph) ? Math.floor(limits.rph) : null;
  const rpd = has(limits.rpd) ? Math.floor(limits.rpd) : null;
  const concurrency = has(limits.concurrency) ? Math.floor(limits.concurrency) : null;
  if (rpm == null && tpm == null && rph == null && rpd == null && concurrency == null) {
    return false; // no usable values
  }

  // Make sure the table exists (first-ever call from a fresh fork)
  try { initAutoDiscoveredLimitsTable(); } catch (_) { /* ignore */ }

  const now = Date.now();
  try {
    const existing = db.prepare(
      `SELECT rpm, tpm, rph, rpd, concurrency, hitCount FROM ${TABLE_NAME}
       WHERE connectionId = ? AND provider = ? AND model = ?`
    ).get(connectionId, provider, model);

    if (!existing) {
      db.prepare(
        `INSERT INTO ${TABLE_NAME}(
           connectionId, provider, model, rpm, tpm, rph, rpd, concurrency,
           source, evidence, firstSeenAt, lastSeenAt, hitCount
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        connectionId, provider, model, rpm, tpm, rph, rpd, concurrency,
        "auto-429-detection",
        String(evidence || "").slice(0, 500),
        now, now,
      );
      return true;
    }

    // Conflict guard: if any observed field differs, log + keep first.
    const changed = (
      (rpm != null && existing.rpm != null && rpm !== existing.rpm) ||
      (tpm != null && existing.tpm != null && tpm !== existing.tpm) ||
      (rph != null && existing.rph != null && rph !== existing.rph) ||
      (rpd != null && existing.rpd != null && rpd !== existing.rpd) ||
      (concurrency != null && existing.concurrency != null && concurrency !== existing.concurrency)
    );
    if (changed) {
      // First observation wins. Bump hitCount anyway so we can spot noisy
      // signals later via the dashboard.
      db.prepare(
        `UPDATE ${TABLE_NAME} SET hitCount = hitCount + 1, lastSeenAt = ?
         WHERE connectionId = ? AND provider = ? AND model = ?`
      ).run(now, connectionId, provider, model);
      return false;
    }

    // Same values — bump hitCount (proves reliable) and refresh lastSeenAt.
    db.prepare(
      `UPDATE ${TABLE_NAME}
       SET hitCount = hitCount + 1, lastSeenAt = ?, evidence = ?
       WHERE connectionId = ? AND provider = ? AND model = ?`
    ).run(now, String(evidence || "").slice(0, 500), connectionId, provider, model);
    return true;
  } catch (err) {
    if (process.env.DIEPXUAN_DEBUG) {
      console.warn("[AutoDiscoveredLimits] write failed:", err?.message || err);
    }
    return false;
  }
}
