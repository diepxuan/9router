// Created: 2026-07-24 by 9Router Agent (fork-layer)
// Purpose:
//   Strip Codex built-in tools that have no `name` field (and therefore
//   break provider-side validation: MiniMax M3 returns 400
//   "invalid params, function name is empty (2013)").
//
// Root cause (logged 2026-07-24 in `requestDetails`):
//   Codex CLI emits three built-in tools without a function name:
//     - { type: "tool_search" }
//     - { type: "web_search" }
//     - { type: "image_generation" }
//   After `formats/claude.js` filters out tools lacking `type === "function"`
//   (line ~330), the wrapper in `wrapToolsForMinimax.js` re-wraps every
//   survivor into OpenAI-shape but cannot infer a missing name, so the
//   gateway rejects the request. Other Codex-native tools (`apply_patch`
//   and `mcp__codex_apps__*`) reach the wrapper in valid Anthropic-shape,
//   so they survive — the three nameless tools are the only consistent
//   blocker.
//
// Scope:
//   ONLY applies when BOTH `provider === "minimax-cn"` AND `model === "MiniMax-M3"`.
//   Other providers/models pass through untouched — preserves backward
//   compatibility for upstream behavior we are not yet sure about.
//
// Wired from `translator/index.js` BEFORE `wrapToolsForMinimax`.
// CRITICAL: must run before wrapToolsForMinimax because wrap converts the
// `type` field (e.g. "tool_search" → "function"), destroying the identifier
// that this module relies on.

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

// Codex emits these types without a function `name`. Match by `type` field
// exactly so we never strip user-defined tools that happen to share a name.
const NAMELESS_BUILTIN_TYPES = new Set(["tool_search", "web_search", "image_generation"]);

// Active combinations: provider -> Set<model>. Add new entries only after
// reproducing the same upstream error.
const TARGETS = {
  "minimax-cn": new Set(["MiniMax-M3"]),
  "minimax": new Set(["MiniMax-M3", "MiniMax-M2.7"]),
};

/**
 * Strip nameless Codex built-in tool entries from `body.tools`.
 * - Pure-shallow mutation: rewrites `body.tools` only.
 * - Safe on bodies without tools, with already-clean tools, or on other
 *   providers/models (returns input unchanged).
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
    return !NAMELESS_BUILTIN_TYPES.has(tType);
  });

  if (filtered.length !== tools.length) {
    body.tools = filtered;
    if (filtered.length === 0) delete body.tools;
  }
  return body;
}
