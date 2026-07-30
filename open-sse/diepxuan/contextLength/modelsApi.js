/**
 * Provider /v1/models API fetcher — generic for any OpenAI-compatible provider.
 *
 * Reads context_length from each provider's catalog endpoint.
 * Tries common field names: max_model_len, max_context_length, context_length.
 *
 * Strategy:
 *   1. Get models URL from provider registry (validateUrl or baseUrl).
 *   2. For public endpoints (no auth): best-effort background fetch.
 *   3. For authenticated endpoints: use connection credentials when available.
 *   4. Gracefully skip on timeout/failure — never crash.
 *
 * Resolution order (tried in sequence, first match wins):
 *   max_model_len → max_context_length → context_length →
 *   context_window → max_context → context_len → max_total_tokens
 */

import { upsertContextLength, SOURCE_API } from "./cache.js";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const FETCH_TIMEOUT_MS = 8000;

// Common field names for context length across providers.
// Many providers expose this in /v1/models but under different keys.
const CTX_LEN_FIELDS = [
  "max_model_len",
  "max_context_length",
  "context_length",
  "context_window",
  "max_context",
  "context_len",
  "max_total_tokens",
];

/**
 * Lazily import PROVIDERS to avoid circular dependency at module init.
 * Returns a fresh reference on each call (PROVIDERS is stable after boot).
 */
async function getProvidersMap() {
  const { PROVIDERS } = await import("../../providers/index.js");
  return PROVIDERS;
}

/**
 * Get the models endpoint URL for a provider from the registry.
 * Tries validateUrl first, then derives from baseUrl.
 * @param {string} providerId
 * @returns {Promise<string|null>}
 */
async function getModelsUrl(providerId) {
  try {
    const PROVIDERS = await getProvidersMap();
    const config = PROVIDERS[providerId];
    if (!config) return null;

    // 1. validateUrl — most reliable
    if (config.validateUrl) return config.validateUrl;

    // 2. baseUrl — derive /models endpoint
    if (config.baseUrl) {
      const url = config.baseUrl
        .replace(/\/chat\/completions$/, "")
        .replace(/\/messages$/, "")
        .replace(/\/+$/, "");
      return `${url}/models`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse /v1/models response to extract modelId + contextLength pairs.
 * Tries multiple field names common across providers.
 * @param {object} data - Parsed JSON response
 * @param {string} providerId - Provider ID for prefixing model IDs
 * @returns {Array<{modelId: string, contextLength: number}>}
 */
function parseModelsResponse(data, providerId) {
  if (!data) return [];
  const models = data?.data || data?.models || [];
  if (!Array.isArray(models)) return [];

  const results = [];
  for (const m of models) {
    if (!m?.id) continue;

    let contextLength = null;
    for (const field of CTX_LEN_FIELDS) {
      const val = m[field];
      if (typeof val === "number" && Number.isFinite(val) && val > 0) {
        contextLength = val;
        break;
      }
    }
    if (contextLength === null) continue;

    // Prepend provider prefix if not already there
    const modelId = m.id.includes("/") ? m.id : `${providerId}/${m.id}`;
    results.push({ modelId, contextLength });
  }
  return results;
}

/**
 * Fetch context length from a provider's /v1/models endpoint (no auth).
 * Best-effort: silently skips endpoints that require authorization.
 * @param {string} providerId - e.g. "nvidia"
 * @returns {Promise<number>} Number of models updated in cache
 */
export async function fetchProviderContextLengths(providerId) {
  if (!isDiepXuanEnabled() || !providerId) return 0;

  const url = await getModelsUrl(providerId);
  if (!url) return 0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!response.ok) return 0;

    const data = await response.json();
    const parsed = parseModelsResponse(data, providerId);

    let count = 0;
    for (const { modelId, contextLength } of parsed) {
      upsertContextLength(modelId, contextLength, SOURCE_API);
      count++;
    }
    return count;
  } catch {
    clearTimeout(timeoutId);
    return 0;
  }
}

/**
 * Fetch context length from a provider's /v1/models endpoint (with auth).
 * Uses the connection's API key for authorization.
 * Returns live model list enriched with contextLength.
 * @param {object} connection - Connection record with apiKey
 * @returns {Promise<{models: Array<{id: string, contextLength: number}>}|null>}
 */
export async function resolveProviderModelsWithContext(connection) {
  if (!isDiepXuanEnabled()) return null;
  if (!connection?.provider) return null;

  const providerId = connection.provider;
  const url = await getModelsUrl(providerId);
  if (!url) return null;

  const headers = {};

  // Add auth if available (many providers require it for /v1/models)
  if (connection.apiKey) {
    headers["Authorization"] = `Bearer ${connection.apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const parsed = parseModelsResponse(data, providerId);
    if (parsed.length === 0) return null;

    return {
      models: parsed.map((m) => ({
        id: m.modelId.replace(`${providerId}/`, ""),
        contextLength: m.contextLength,
      })),
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
