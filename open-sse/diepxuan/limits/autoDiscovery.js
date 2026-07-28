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

import Database from "better-sqlite3";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const TABLE_NAME = "auto_discovered_limits_diepxuan";

/** @type {import("better-sqlite3").Database|null} */
let _db = null;

function getDb() {
  if (_db) return _db;
  if (!isDiepXuanEnabled()) return null;
  try {
    // Lazy import — only resolves under the Next.js bundler (jsconfig.json
    // paths: "@/*" → "./src/*"). For raw `node` callers (unit tests,
    // scripts) we open the DB at the default path manually.
    const dataFile = process.env.NINE_ROUTER_DB_PATH
      || (function findDefault() {
          const home = process.env.HOME || "/root";
          const candidates = [
            `${home}/.9router/db/data.sqlite`,
            "/root/.9router/db/data.sqlite",
            "/var/lib/9router/db/data.sqlite",
          ];
          for (const c of candidates) {
            try {
              // eslint-disable-next-line global-require
              const fs = require("node:fs");
              if (fs.existsSync(c)) return c;
            } catch (_) { /* ignore */ }
          }
          return candidates[0];
        })();
    _db = new Database(dataFile);
    _db.pragma("journal_mode = WAL");
    _db.pragma("synchronous = NORMAL");
  } catch (err) {
    console.warn("[AutoDiscoveredLimits] Failed to open DB:", err?.message || err);
    return null;
  }
  return _db;
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
 * UPSERT auto-discovered limits. Implementation lives in PR #60 — declared
 * here so the public API stays stable across PRs.
 *
 * @param {{
 *   connectionId: string, provider: string, model: string,
 *   limits: { rpm?: number, tpm?: number, rph?: number, rpd?: number, concurrency?: number },
 *   evidence: string,
 * }} args
 * @returns {boolean} true if written, false on conflict or no-op
 */
export function recordAutoDiscoveredLimits({ connectionId, provider, model, limits, evidence }) {
  if (!isDiepXuanEnabled() || !connectionId) return false;
  // Defer to PR #60 (write path needs init + insert). PR #59 keeps this as a
  // documented stub so callers can wire without crashing.
  void provider; void model; void limits; void evidence;
  return false;
}
