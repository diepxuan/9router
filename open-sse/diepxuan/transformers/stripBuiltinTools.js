// Created: 2026-07-24 by 9Router Agent (fork-layer)
// Purpose:
//   Strip tools that would cause MiniMax gateway validation errors:
//   1. `invalid params, function name is empty (2013)` — tools with no `name`
//   2. `invalid tool type` — tools with non-function types (custom, namespace)
//   3. `function is empty` — tools that would produce empty function after wrap
//
// Root cause (logged 2026-07-24 in `requestDetails`):
//   MiniMax M3 gateway only accepts tools with { type: "function", function: { name, ... } }.
//   Codex CLI emits tools in various non-standard shapes:
//   - Nameless builtins: { type: "tool_search" } (no name at all)
//   - Non-function types: { type: "custom", name: "apply_patch" }, { type: "namespace", ... }
//   After prepareClaudeRequest filters type!=="function", wrapToolsForMinimax
//   re-wraps survivors into OpenAI-shape but cannot salvage missing names
//   or unsupported types.
//
// DB snapshot of errors BEFORE this module:
//   minimax-cn 188 errors / 41 success (82%):
//     147 x function name is empty ← 3 nameless builtins
//      25 x invalid tool type     ← non-function types (custom, namespace)
//      12 x function is empty     ← tools with no valid name/function.name
//       4 x account/key/quota
//
// Scope:
//   Target providers/models from TARGETS. Other providers/models pass through.
//
// Wired from `translator/index.js` BEFORE `wrapToolsForMinimax`.
// CRITICAL: must run before wrapToolsForMinimax because wrap converts the
// `type` field (e.g. "tool_search" → "function"), destroying the identifier
// that this module relies on.

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

// Codex emits these types without a function `name`. Match by `type` field
// exactly so we never strip user-defined tools that happen to share a name.
const NAMELESS_BUILTIN_TYPES = new Set(["tool_search", "web_search", "image_generation"]);

// MiniMax only supports type="function". Other types (custom, namespace, etc.)
// cause "invalid tool type" errors.
const UNSUPPORTED_TOOL_TYPES = new Set(["custom", "namespace"]);

// Active combinations: provider -> Set<model>. Add new entries only after
// reproducing the same upstream error.
const TARGETS = {
  "minimax-cn": new Set(["MiniMax-M3"]),
  "minimax": new Set(["MiniMax-M3", "MiniMax-M2.7"]),
};

/**
 * Strip tools that MiniMax gateway would reject.
 * Filters out:
 *   1. Known nameless builtins (by type — tool_search/web_search/image_generation)
 *   2. Non-function types (custom, namespace — MiniMax does not support them)
 *   3. Function-type tools without a valid name (would become empty after wrap)
 *
 * Pure-shallow mutation: rewrites `body.tools` only.
 * Safe on bodies without tools, clean tools, or non-target providers/models
 * (returns input unchanged).
 *
 * @param {object} body
 * @param {string} provider
 * @param {string} model
 * @returns {object} the same body reference (mutated in place)
 */
export function stripBuiltinTools(body, provider, model) {
  if (!isDiepXuanEnabled()) return body;
  if (!body || !provider || !model) return body;
  const models = TARGETS[provider];
  if (!models || !models.has(model)) return body;

  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length === 0) return body;

  const filtered = tools.filter((t) => {
    if (!t || typeof t !== "object") return true;
    const tType = typeof t.type === "string" ? t.type : "";

    // 1. Strip known nameless builtins (tool_search, web_search, image_generation)
    if (NAMELESS_BUILTIN_TYPES.has(tType)) return false;

    // 2. Strip unsupported types (custom, namespace) — MiniMax rejects them
    if (UNSUPPORTED_TOOL_TYPES.has(tType)) return false;

    // 3. Strip function-type tools with no valid name
    //    After wrap, these would produce function: { name: undefined }
    //    which triggers "function is empty (2013)"
    if (tType === "function") {
      const fnName = t.function?.name || t.name;
      if (!fnName || (typeof fnName === "string" && !fnName.trim())) return false;
    }

    // 4. Strip Anthropic-shape tools (no type field) with no name
    //    These also produce function: { name: undefined } after wrap
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
