import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    models: parseJson(row.models, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCombos() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM combos ORDER BY createdAt ASC`);
  return rows.map(rowToCombo);
}

export async function getComboById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
  return rowToCombo(row);
}

export async function getComboByName(name) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM combos WHERE name = ?`, [name]);
  return rowToCombo(row);
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    kind: data.kind || null,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [combo.id, combo.name, combo.kind, stringifyJson(combo.models), combo.createdAt, combo.updatedAt]
  );
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    db.run(
      `UPDATE combos SET name = ?, kind = ?, models = ?, updatedAt = ? WHERE id = ?`,
      [merged.name, merged.kind, stringifyJson(merged.models || []), merged.updatedAt, id]
    );
    result = merged;
  });
  return result;
}

/**
 * Rename references to an old combo name inside other combos' models.
 * Used when a combo is renamed so nested combo references follow the new name.
 * @param {string} oldName
 * @param {string} newName
 */
export async function renameComboReferences(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return 0;
  const db = await getAdapter();
  let updated = 0;
  db.transaction(() => {
    const combos = db.all(`SELECT id, name, models FROM combos`).map(rowToCombo);
    for (const combo of combos) {
      if (combo.name === oldName || !Array.isArray(combo.models)) continue;
      const next = [];
      let changed = false;
      for (const m of combo.models) {
        if (m === oldName) {
          if (!next.includes(newName)) next.push(newName);
          changed = true;
        } else {
          next.push(m);
        }
      }
      if (changed) {
        db.run(
          `UPDATE combos SET models = ?, updatedAt = ? WHERE id = ?`,
          [stringifyJson(next), new Date().toISOString(), combo.id]
        );
        updated++;
      }
    }
  });
  return updated;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM combos WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

/**
 * Remove given model ids from every combo's models[]. Atomic transaction.
 *
 * Match rule: exact string equality against each entry of combo.models. No
 * prefix inference — caller is responsible for passing ids in the same form
 * stored in the combo (e.g. "nvidia/deepseek-ai/deepseek-v4-pro" or "minimax").
 *
 * Used to keep combos in sync when a user disables a model via
 * POST /api/models/disabled — so a disabled model does not stay referenced
 * inside combos (would 400 on every retry as if EOL).
 *
 * @param {string[]} ids - model ids to remove (no-op if empty/invalid)
 * @param {string} [providerAlias] - provider alias used purely for logging
 *   context; matching is always exact. Caller may pass null/undefined.
 * @returns {number} count of combos whose models[] was modified.
 */
export async function removeModelsFromAllCombos(ids, providerAlias) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const removeSet = new Set(ids.filter((x) => typeof x === "string" && x));
  if (removeSet.size === 0) return 0;
  const db = await getAdapter();
  let updated = 0;
  let removed = 0;
  db.transaction(() => {
    const combos = db.all(`SELECT id, name, models FROM combos`).map(rowToCombo);
    for (const combo of combos) {
      if (!Array.isArray(combo.models) || combo.models.length === 0) continue;
      const next = combo.models.filter((m) => !removeSet.has(m));
      if (next.length === combo.models.length) continue;
      removed += combo.models.length - next.length;
      db.run(
        `UPDATE combos SET models = ?, updatedAt = ? WHERE id = ?`,
        [stringifyJson(next), new Date().toISOString(), combo.id]
      );
      updated++;
    }
  });
  if (updated > 0) {
    console.log(
      `[combosRepo] removed ${removed} model entries from ${updated} combo(s)` +
      (providerAlias ? ` (triggered by disable on provider "${providerAlias}")` : "")
    );
  }
  return updated;
}
