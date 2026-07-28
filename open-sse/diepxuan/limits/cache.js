/**
 * DiepXuan fork-layer: persistent sliding-window counters for rate limits.
 * PR #61 of ADR-007.
 *
 * Each row = one (scope, window) pair. `scope` is "{connectionId}:{provider}/{model}"
 * — we namespace per connection so 2 NVIDIA keys don't trample each other.
 * `window` is "rpm" | "tpm" | "rph" | "rpd". `windowMs` is the actual
 * duration (60_000 / 60_000 / 3_600_000 / 86_400_000). `events` is a JSON
 * array of { ts, tokens }.
 *
 * Why SQLite instead of in-memory: 9Router restarts (CapRover deploy, dev
 * session) must not lose throttle state. The events list is bounded
 * (auto-prune on every read keeps it small).
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.6.
 */

import Database from "better-sqlite3";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const TABLE_NAME = "rate_limit_counters_diepxuan";

/** @type {import("better-sqlite3").Database|null} */
let _db = null;

function getDb() {
  if (_db) return _db;
  if (!isDiepXuanEnabled()) return null;
  try {
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
    console.warn("[RateLimitCounters] Failed to open DB:", err?.message || err);
    return null;
  }
  return _db;
}

/**
 * Idempotent table create. Called lazily from any read/write.
 */
export function initRateLimitCountersTable() {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        scope      TEXT NOT NULL,
        window     TEXT NOT NULL,
        windowMs   INTEGER NOT NULL,
        events     TEXT NOT NULL DEFAULT '[]',
        updatedAt  INTEGER NOT NULL,
        PRIMARY KEY (scope, window)
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_rlc_scope ON ${TABLE_NAME}(scope)`);
  } catch (err) {
    console.warn("[RateLimitCounters] Failed to create table:", err?.message || err);
  }
}

/**
 * @param {string} scope
 * @param {string} window - rpm | tpm | rph | rpd
 * @param {number} windowMs
 * @returns {Array<{ts:number,tokens:number}>}
 */
function readEvents(db, scope, window) {
  try {
    const row = db.prepare(
      `SELECT events FROM ${TABLE_NAME} WHERE scope = ? AND window = ?`
    ).get(scope, window);
    if (!row) return [];
    const arr = JSON.parse(row.events);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    if (err && /no such table/i.test(err.message || "")) return [];
    return [];
  }
}

function writeEvents(db, scope, window, windowMs, events) {
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO ${TABLE_NAME}(scope, window, windowMs, events, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scope, window) DO UPDATE SET
         events = excluded.events,
         windowMs = excluded.windowMs,
         updatedAt = excluded.updatedAt`
    ).run(scope, window, windowMs, JSON.stringify(events), now);
  } catch (err) {
    if (err && /no such table/i.test(err.message || "")) initRateLimitCountersTable();
  }
}

/**
 * Read the current event list for a scope/window, pruning events older
 * than `windowMs`. The result is read-only — caller must call
 * `pushEvent` / `clear` to mutate.
 *
 * @param {string} scope
 * @param {string} window
 * @param {number} windowMs
 * @returns {Array<{ts:number,tokens:number}>}
 */
export function readPrunedEvents(scope, window, windowMs) {
  if (!isDiepXuanEnabled()) return [];
  const db = getDb();
  if (!db) return [];
  initRateLimitCountersTable();
  const all = readEvents(db, scope, window);
  if (all.length === 0) return all;
  const cutoff = Date.now() - windowMs;
  const pruned = all.filter((e) => e && Number.isFinite(e.ts) && e.ts >= cutoff);
  if (pruned.length !== all.length) {
    writeEvents(db, scope, window, windowMs, pruned);
  }
  return pruned;
}

/**
 * Push a new event and persist the pruned list.
 * @param {string} scope
 * @param {string} window
 * @param {number} windowMs
 * @param {number} ts
 * @param {number} [tokens=0]
 */
export function pushEvent(scope, window, windowMs, ts, tokens = 0) {
  if (!isDiepXuanEnabled()) return;
  const db = getDb();
  if (!db) return;
  initRateLimitCountersTable();
  const events = readPrunedEvents(scope, window, windowMs);
  events.push({ ts, tokens: Number.isFinite(tokens) ? tokens : 0 });
  writeEvents(db, scope, window, windowMs, events);
}

/**
 * Clear all events for a scope/window. Used by the tests and as an escape
 * hatch from the dashboard (future).
 */
export function clearCounter(scope, window) {
  if (!isDiepXuanEnabled()) return;
  const db = getDb();
  if (!db) return;
  initRateLimitCountersTable();
  try {
    db.prepare(`DELETE FROM ${TABLE_NAME} WHERE scope = ? AND window = ?`).run(scope, window);
  } catch (err) {
    if (err && /no such table/i.test(err.message || "")) return;
  }
}

/**
 * Read counters for all 4 windows of a scope at once. Returns a plain
 * object with `rpm`, `tpm`, `rph`, `rpd` keys, each holding the
 * pre-pruned event list (or [] when missing).
 *
 * @param {string} scope
 * @returns {{ rpm: Array, tpm: Array, rph: Array, rpd: Array }}
 */
export function readAllCounters(scope) {
  return {
    rpm: readPrunedEvents(scope, "rpm", 60_000),
    tpm: readPrunedEvents(scope, "tpm", 60_000),
    rph: readPrunedEvents(scope, "rph", 3_600_000),
    rpd: readPrunedEvents(scope, "rpd", 86_400_000),
  };
}
