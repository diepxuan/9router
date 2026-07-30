// Created: 2026-07-24 by 9Router Agent (fork-layer)
// Refactored: 2026-07-30 — config-driven via credentials.runtimeTransport.stripBuiltinTools
//   (provider registry declares strip config per-format transport, not hardcoded TARGETS)
//
// Purpose:
//   Strip tools that would cause MiniMax gateway validation errors:
//   1. `invalid params, function name is empty (2013)` — tools with no `name`
//   2. `invalid tool type` — tools with non-function types (custom, namespace)
//   3. `function is empty` — tools that would produce empty function after wrap
//
// Root cause (logged 2026-07-24 in `requestDetails`):
//   MiniMax M3 gateway only accepts Anthropic-shape tools { name, description, input_schema }.
//   Codex CLI emits tools in various non-standard shapes:
//   - Nameless builtins: { type: "tool_search" } (no name at all)
//   - Non-function types: { type: "custom", name: "apply_patch" }, { type: "namespace", ... }
//   prepareClaudeRequest's non-claude filter strips non-function types but tools
//   without names still pass through and cause 400.
//
// DB snapshot of errors BEFORE this module:
//   minimax-cn 188 errors / 41 success (82%):
//     147 x function name is empty ← 3 nameless builtins
//      25 x invalid tool type     ← non-function types (custom, namespace)
//      12 x function is empty     ← tools with no valid name/function.name
//       4 x account/key/quota
//
// Config declaration:
//   Provider registry declares strip config in the per-format transport entry:
//   open-sse/providers/registry/minimax.js / minimax-cn.js → transports[].stripBuiltinTools
//
// Caller (translator/index.js) reads from credentials.runtimeTransport.stripBuiltinTools
// and passes the config object to this function.

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

/**
 * Strip tools that MiniMax gateway would reject.
 *
 * Reads strip config from `config` argument (declared per-format transport
 * in provider registry), not from hardcoded constants.
 *
 * Filter rules (config-driven):
 *   1. Known nameless builtins (by type — e.g. tool_search/web_search/image_generation)
 *   2. Non-function types (e.g. custom, namespace — MiniMax does not support them)
 *   3. Function-type tools without a valid name (would become empty after wrap)
 *   4. Anthropic-shape tools without a name (same outcome)
 *
 * Pure-shallow mutation: rewrites `body.tools` only.
 * Safe on bodies without tools, clean tools, or when config is null/empty
 * (returns input unchanged).
 *
 * @param {object} body - Request body (mutated in place)
 * @param {string} model - Model ID, checked against config.models
 * @param {object|null} config - Strip config from runtimeTransport.stripBuiltinTools
 * @param {string[]} [config.models] - Models to apply stripping to
 * @param {string[]} [config.namelessTypes] - Type names to strip as nameless builtins
 * @param {string[]} [config.unsupportedTypes] - Type names to strip as unsupported
 * @returns {object} the same body reference
 */
export function stripBuiltinTools(body, model, config) {
  if (!isDiepXuanEnabled()) return body;
  if (!body) return body;

  // No config → no-op (caller provider does not declare stripBuiltinTools)
  if (!config || typeof config !== "object") return body;

  // Model not in configured scope → no-op
  if (Array.isArray(config.models) && !config.models.includes(model)) return body;

  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length === 0) return body;

  const namelessBuiltinTypes = new Set(config.namelessTypes || []);
  const unsupportedToolTypes = new Set(config.unsupportedTypes || []);

  const filtered = tools.filter((t) => {
    if (!t || typeof t !== "object") return true;
    const tType = typeof t.type === "string" ? t.type : "";

    // 1. Strip known nameless builtins (config-driven)
    if (namelessBuiltinTypes.has(tType)) return false;

    // 2. Strip unsupported types (config-driven)
    if (unsupportedToolTypes.has(tType)) return false;

    // 3. Strip function-type tools with no valid name
    //    After wrap, these would produce function: { name: undefined }
    //    which triggers "function is empty (2013)"
    if (tType === "function") {
      const fnName = t.function?.name || t.name;
      if (!fnName || (typeof fnName === "string" && !fnName.trim())) return false;
    }

    // 4. Strip Anthropic-shape tools (no type field) with no name
    if (!tType) {
      const name = t.name || t.function?.name;
      if (!name || (typeof name === "string" && !name.trim())) return false;
    }

    return true;
  });

  if (filtered.length !== tools.length) {
    body.tools = filtered;
    if (filtered.length === 0) delete body.tools;
  }
  return body;
}
