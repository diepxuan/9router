import { getComboByName, createCombo, getCombos, getModelAliases, getProviderNodes } from "@/lib/localDb";
import { parseModel } from "@/sse/services/model.js";
import { isDiepXuanEnabled, isDiepXuanSafeMode } from "@/diepxuan/shared/config/flags.js";
import { resolveModelAliasFromMap } from "open-sse/services/model.js";
import REGISTRY from "open-sse/providers/registry/index.js";

export const DEFAULT_COMBO_NAME = "default";
export const DEFAULT_COMBO_MODELS = ["llmfree"];

const KNOWN_PROVIDER_PREFIXES = new Set();
for (const entry of REGISTRY) {
  KNOWN_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) KNOWN_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) KNOWN_PROVIDER_PREFIXES.add(alias);
}

/**
 * Ensure the fork's default LLM combo exists.
 *
 * This is intentionally called from request/API entry points rather than at
 * DB migration time: it stays in the fork layer and self-heals if the row is
 * removed by an import, a direct DB edit, or a user delete race.
 */
export async function ensureDefaultCombo() {
  if (!isDiepXuanEnabled() || isDiepXuanSafeMode()) return null;

  const existing = await getComboByName(DEFAULT_COMBO_NAME);
  if (existing) return existing;

  try {
    return await createCombo({
      name: DEFAULT_COMBO_NAME,
      kind: null,
      models: [...DEFAULT_COMBO_MODELS],
    });
  } catch (error) {
    const created = await getComboByName(DEFAULT_COMBO_NAME);
    if (created) return created;
    throw error;
  }
}

/**
 * Return combos with `default` pinned first. Other combos keep their existing
 * relative order. Used by API routes so the source of truth is server-side.
 */
export async function getCombosWithDefaultFirst() {
  await ensureDefaultCombo();
  const combos = await getCombos();
  return [
    ...combos.filter((combo) => combo.name === DEFAULT_COMBO_NAME),
    ...combos.filter((combo) => combo.name !== DEFAULT_COMBO_NAME),
  ];
}

/**
 * Decide whether an LLM chat model string can be resolved to a real provider
 * target. This matches the selected "every unresolvable model falls back"
 * rule: unknown provider prefixes, unknown aliases, and missing combos are
 * rewritten to `default`; a known provider is left untouched even when it has
 * no active credential so the existing auth error remains visible.
 */
export async function canResolveModel(modelStr) {
  if (typeof modelStr !== "string" || !modelStr) return false;
  if (!isDiepXuanEnabled() || isDiepXuanSafeMode()) return true;

  const combo = await getComboByName(modelStr);
  if (combo && Array.isArray(combo.models) && combo.models.length > 0) return true;

  const parsed = parseModel(modelStr);
  if (!parsed?.isAlias) {
    if (parsed?.providerAlias && !KNOWN_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      const nodes = await getProviderNodes();
      if (!nodes.some((node) => node?.prefix === parsed.providerAlias)) return false;
    }
    return true;
  }

  const aliases = await getModelAliases();
  return !!resolveModelAliasFromMap(modelStr, aliases);
}

/**
 * Rewrite an invalid LLM chat model request to the `default` combo.
 */
export async function resolveDefaultComboFallback(modelStr) {
  if (await canResolveModel(modelStr)) {
    return { modelStr, fallback: false };
  }
  await ensureDefaultCombo();
  return { modelStr: DEFAULT_COMBO_NAME, fallback: true };
}
