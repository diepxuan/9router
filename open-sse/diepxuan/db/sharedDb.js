/**
 * DiepXuan fork-layer: shared singleton SQLite connection.
 *
 * All fork-layer modules that need to read/write data.sqlite SHOULD use
 * this shared instance instead of opening their own `new Database(...)`.
 *
 * Multiple independent connections to the same WAL-mode database cause
 * "Compaction failed: Another write batch or compaction is already active"
 * errors when the main adapter's periodic wal_checkpoint fires while
 * another connection has an open transaction. Using one connection
 * eliminates that class of conflict.
 *
 * ## Strategy: re-use the main adapter's connection
 *
 * The main adapter stores its raw Database instance on
 * `global._dbAdapter.instance.raw` after init. `getSharedDb()` returns
 * that instance directly, so there is only ONE writer connection to
 * data.sqlite — the compaction conflict is eliminated at the source.
 *
 * Before the main adapter has initialised (cold start / early boot) this
 * module falls back to opening its own temporary connection, which gets
 * superseded once the adapter stores its global.
 */

import { createRequire } from "node:module";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

/** @type {import("better-sqlite3").Database|null} */
let _fallbackDb = null;
let _fallbackClosed = false;

// ESM-safe require for optional better-sqlite3 fallback (top-level import
// would crash on Bun or when the native binary is missing).
const _require = createRequire(import.meta.url);

let _DatabaseCtor = null;
let _triedLoad = false;

function getDatabaseCtor() {
  if (!_triedLoad) {
    _triedLoad = true;
    try { _DatabaseCtor = _require("better-sqlite3"); } catch { _DatabaseCtor = null; }
  }
  return _DatabaseCtor;
}

/**
 * Use the main adapter's connection via global._dbAdapter.instance.raw.
 * When the main adapter has not yet loaded (cold-start early boot),
 * open a temporary fallback connection.
 *
 * Returns `null` when DiepXuan is disabled — callers MUST null-check.
 */
export function getSharedDb() {
  if (!isDiepXuanEnabled()) return null;

  // 1. Prefer the main adapter's raw connection — eliminates dual-writer
  //    compaction conflict because there is only ONE writer connection.
  try {
    const mainRaw = global._dbAdapter?.instance?.raw;
    if (mainRaw && typeof mainRaw.prepare === "function") {
      return mainRaw;
    }
  } catch { /* ignore */ }

  // 2. Fallback: own temporary connection (bootstrap / cold start).
  if (_fallbackDb) {
    if (!_fallbackClosed) return _fallbackDb;
    _fallbackDb = null;
    _fallbackClosed = false;
  }

  const Database = getDatabaseCtor();
  if (!Database) {
    if (!_fallbackClosed) {
      console.warn("[DiepXuanSharedDb] better-sqlite3 not available — fallback DB disabled");
      _fallbackClosed = true;
    }
    return null;
  }

  try {
    const dataFile = resolveDataFile();
    _fallbackDb = new Database(dataFile);
    _fallbackDb.pragma("journal_mode = WAL");
    _fallbackDb.pragma("synchronous = NORMAL");
  } catch (err) {
    console.warn("[DiepXuanSharedDb] Failed to open fallback DB:", err?.message || err);
    return null;
  }
  return _fallbackDb;
}

export function closeSharedDb() {
  if (_fallbackDb) {
    try { _fallbackDb.close(); } catch { /* ignore */ }
    _fallbackDb = null;
    _fallbackClosed = true;
  }
}

function resolveDataFile() {
  return (
    process.env.NINE_ROUTER_DB_PATH ||
    (() => {
      const home = process.env.HOME || "/root";
      const candidates = [
        `${home}/.9router/db/data.sqlite`,
        "/root/.9router/db/data.sqlite",
        "/var/lib/9router/db/data.sqlite",
      ];
      for (const c of candidates) {
        try {
          const fs = require("node:fs");
          if (fs.existsSync(c)) return c;
        } catch { /* ignore */ }
      }
      return candidates[0];
    })()
  );
}
