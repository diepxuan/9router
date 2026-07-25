/**
 * DiepXuan fork-layer hook: wrap Claude-shape tools back to OpenAI-shape
 * for provider "minimax-cn" (api.minimaxi.com/anthropic/v1/messages).
 *
 * Root cause (logged 2026-07-24):
 *   Anthropic-shape tools (flat: { name, description, input_schema }) are
 *   accepted by the native Claude API. The MiniMax M3 gateway however
 *   exposes a Claude-compatible endpoint that, in practice, insists on
 *   OpenAI-shape tools wrapped as { type: "function", function: {...} }.
 *   Sending flat tools returns:
 *     400 "invalid params, function is empty (2013)"
 *
 * Translator prepareClaudeRequest (formats/claude.js) strips the OpenAI
 * wrapper and writes Anthropic-shape. Before the request leaves for
 * minimax-cn, this hook unwraps it back so the gateway can recognize the
 * tool type. Other non-Claude providers (kiro, anthropic-prefix) keep
 * Anthropic shape.
 */
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const TARGETS = new Set(["minimax-cn", "minimax"]);

/**
 * Convert Anthropic-shape tools to OpenAI-shape { type:"function", function:{...} }.
 * Pure — safe for already-OpenAI-shape tools (returns a shallow clone).
 *
 * @param {Array<object>} tools - Anthropic-shape or OpenAI-shape tools
 * @returns {Array<object>} openai-shape tools
 */
export function anthropicToolsToOpenAI(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!tool) return tool;
    // Already OpenAI-shape (has wrapper or `type !== "function"` baked in)
    if (tool.type === "function" && tool.function) return { ...tool };
    if (tool.function) return { type: "function", function: { ...tool.function } };
    // Anthropic-shape: promote to OpenAI-shape wrapper
    const { type, cache_control, ...rest } = tool;
    return {
      type: "function",
      function: {
        name: rest.name,
        description: rest.description,
        parameters: rest.input_schema || rest.parameters || { type: "object", properties: {} },
      },
    };
  });
}

/**
 * Rewrite tools array in body so that they're OpenAI-shape when provider is
 * minimax-cn or minimax. Other providers pass through.
 * Mutates `body` in place.
 * @param {object} body
 * @param {string} provider
 * @returns {object}
 */
export function wrapToolsForMinimax(body, provider) {
  if (!isDiepXuanEnabled()) return body;
  if (!body || !provider || !TARGETS.has(provider)) return body;
  if (!Array.isArray(body.tools) || body.tools.length === 0) return body;
  body.tools = anthropicToolsToOpenAI(body.tools);
  return body;
}
