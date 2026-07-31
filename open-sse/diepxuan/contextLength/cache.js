/**
 * Context Length Cache — SQLite-backed, fork-layer only.
 * Stores { modelId -> context_length } for all providers.
 *
 * Uses the shared DiepXuan DB singleton (open-sse/diepxuan/db/sharedDb.js)
 * instead of opening its own connection. Multiple independent connections
 * to the same WAL-mode database cause "Compaction failed" errors when the
 * main adapter's periodic wal_checkpoint fires concurrently.
 */

import { getSharedDb } from "../db/sharedDb.js";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const SOURCE_API = "api";
const SOURCE_ERROR = "error";
const SOURCE_STATIC = "static";

// Cache TTL: 24 hours for API source, never expire for error/static
const API_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const TABLE_NAME = "model_context_info_diepxuan";

/**
 * Get the shared database connection.
 */
function getDb() {
  return getSharedDb();
}

/**
 * Ensure the context_info table exists. Called once on init.
 */
export function initContextLengthCache() {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        model_id      TEXT PRIMARY KEY,
        context_length INTEGER NOT NULL,
        source        TEXT NOT NULL DEFAULT 'static',
        updated_at    INTEGER NOT NULL
      )
    `);
  } catch (err) {
    console.warn("[ContextLength] Failed to create table:", err?.message || err);
  }
}

/**
 * Get cached context length for a single model.
 * @param {string} modelId - Full model ID, e.g. "nvidia/minimaxai/minimax-m2.7"
 * @returns {{ contextLength: number, source: string, updatedAt: number } | null}
 */
export function getCachedContextLength(modelId) {
  if (!modelId) return null;
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare(
      `SELECT context_length, source, updated_at FROM ${TABLE_NAME} WHERE model_id = ?`
    ).get(modelId);
    if (!row) return null;

    // Invalidate stale API entries
    if (row.source === SOURCE_API) {
      const ageMs = Date.now() - row.updated_at;
      if (ageMs > API_CACHE_TTL_MS) return null;
    }

    return {
      contextLength: row.context_length,
      source: row.source,
      updatedAt: row.updated_at
    };
  } catch (err) {
    return null;
  }
}

/**
 * Upsert context length for a model.
 * Source priority: api > static > error.
 * Error-derived values only fill when no curated (api/static) value exists,
 * because provider error text can reflect account/deployment limits rather
 * than the model's actual context length.
 * @param {string} modelId
 * @param {number} contextLength
 * @param {"api"|"error"|"static"} source
 */
export function upsertContextLength(modelId, contextLength, source) {
  if (!isDiepXuanEnabled()) return;
  if (!modelId || typeof contextLength !== "number" || contextLength <= 0) return;
  const db = getDb();
  if (!db) return;

  try {
    const existing = db.prepare(
      `SELECT context_length, source FROM ${TABLE_NAME} WHERE model_id = ?`
    ).get(modelId);

    if (existing) {
      // Priority: api > static > error. A lower-priority source must never
      // overwrite a higher-priority source (same source always refreshes).
      const priority = { [SOURCE_API]: 3, [SOURCE_STATIC]: 2, [SOURCE_ERROR]: 1 };
      if (source !== existing.source
          && (priority[source] || 0) < (priority[existing.source] || 0)) {
        return;
      }
    }

    db.prepare(`
      INSERT INTO ${TABLE_NAME} (model_id, context_length, source, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET
        context_length = excluded.context_length,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).run(modelId, contextLength, source, Date.now());
  } catch (err) {
    console.warn("[ContextLength] upsert failed:", err?.message || err);
  }
}

/**
 * Get context length for multiple models at once (batch).
 * @param {string[]} modelIds
 * @returns {Map<string, { contextLength: number, source: string, updatedAt: number }>}
 */
export function getCachedContextLengthBatch(modelIds) {
  const result = new Map();
  if (!modelIds?.length) return result;
  const db = getDb();
  if (!db) return result;

  try {
    const placeholders = modelIds.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT model_id, context_length, source, updated_at FROM ${TABLE_NAME} WHERE model_id IN (${placeholders})`
    ).all(...modelIds);

    const now = Date.now();
    for (const row of rows) {
      if (row.source === SOURCE_API && (now - row.updated_at) > API_CACHE_TTL_MS) continue;
      result.set(row.model_id, {
        contextLength: row.context_length,
        source: row.source,
        updatedAt: row.updated_at
      });
    }
  } catch (err) {
    // ignore
  }
  return result;
}

/**
 * Clear all cached entries (for testing).
 */
export function clearContextLengthCache() {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`DELETE FROM ${TABLE_NAME}`);
  } catch (err) {
    // ignore
  }
}

export { SOURCE_API, SOURCE_ERROR, SOURCE_STATIC };