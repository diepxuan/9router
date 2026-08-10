// DiepXuan fork-layer custom tool bridge.
//
// Codex CLI declares freeform tools as Responses `custom` tools (for example
// apply_patch with a grammar format). Chat Completions providers cannot
// declare that type, so the base request translator converts them into
// function tools. This bridge keeps the custom-tool name in translator-only
// metadata and lets the response translator restore a Responses
// `custom_tool_call` instead of a plain `function_call`.
//
// Scope: only Codex clients routed through a non-Codex provider. Codex-native
// passthrough keeps custom tools unchanged.

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import { detectClientTool } from "../../utils/clientDetector.js";

const CODEX_CUSTOM_TOOL_NAMES = new Set([
  "apply_patch",
]);

export function isCodexClient(headers = {}, body = {}) {
  return detectClientTool(headers, body) === "codex";
}

export function isCustomTool(tool) {
  if (!tool || typeof tool !== "object") return false;
  const name = typeof tool.name === "string" ? tool.name : tool.function?.name;
  return typeof name === "string" && CODEX_CUSTOM_TOOL_NAMES.has(name);
}

export function collectCustomToolNames(body) {
  if (!isDiepXuanEnabled()) return [];
  const names = new Set();
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  for (const tool of tools) {
    if (isCustomTool(tool)) {
      const name = typeof tool.name === "string" ? tool.name : tool.function?.name;
      if (name) names.add(name);
    }
  }
  return [...names];
}

export function unwrapCustomToolArguments(argumentsText) {
  if (typeof argumentsText !== "string") return "";
  try {
    const parsed = JSON.parse(argumentsText);
    if (parsed && typeof parsed === "object" && typeof parsed.input === "string") return parsed.input;
  } catch { /* incomplete or raw freeform input */ }
  return argumentsText;
}

export function wrapCustomToolArguments(input) {
  return JSON.stringify({ input: typeof input === "string" ? input : JSON.stringify(input ?? "") });
}
