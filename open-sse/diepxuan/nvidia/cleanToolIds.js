/**
 * DiepXuan fork-layer hook: sanitize tool_call ids for NVIDIA NIM.
 *
 * Root cause (logged 2026-07-23):
 *   NVIDIA NIM (integrate.api.nvidia.com) returns:
 *     400 BadRequestError "Tool call id was 1kiyrc8_1 but must be a-z, A-Z,
 *                         0-9, with a length of 9."
 *
 * The base ensureToolCallIds() only enforces Anthropic pattern
 * /^[a-zA-Z0-9_-]+$/ (allows underscore + hyphen, no length cap), which is
 * too permissive for NVIDIA's stricter rule.
 *
 * This hook runs *after* ensureToolCallIds() in translateRequest, applies a
 * stricter [a-zA-Z0-9]{9} regex, and replaces any non-conforming id with a
 * deterministic 9-char alphanumeric id derived from position + tool name.
 *
 * Scope: only when the destination provider is "nvidia".
 * No-op when DIEPXUAN_ENABLED=false or for non-NVIDIA providers.
 */

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const NVIDIA_PROVIDER_IDS = new Set(["nvidia"]);
const NVIDIA_TOOL_ID_PATTERN = /^[a-zA-Z0-9]{9}$/;
const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Deterministic 9-char alphanumeric id. Hashes position+name into a stable
 * string so retries + caches keep the same id across calls.
 */
function makeNvidiaToolId(msgIndex, tcIndex, toolName) {
  const seed = `${msgIndex}:${tcIndex}:${toolName || ""}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 9; i++) {
    out += ALNUM[(h + i * 7) % ALNUM.length];
  }
  return out;
}

function isNvidiaProvider(provider) {
  return provider && NVIDIA_PROVIDER_IDS.has(provider);
}

/**
 * Rewrite tool_call ids so they match NVIDIA's strict pattern.
 * Mutates `body` in place. Returns the same body.
 * @param {object} body - request body (OpenAI chat completions shape)
 * @returns {object}
 */
export function sanitizeToolCallIdsForNvidia(body, provider) {
  if (!isDiepXuanEnabled()) return body;
  if (!isNvidiaProvider(provider)) return body;
  if (!body || !Array.isArray(body.messages)) return body;

  // Map old -> new tool_call_ids so tool responses reference the same
  // rewritten id as their corresponding assistant tool_calls.
  const idMap = new Map();

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (let j = 0; j < msg.tool_calls.length; j++) {
        const tc = msg.tool_calls[j];
        if (!tc.id || !NVIDIA_TOOL_ID_PATTERN.test(tc.id)) {
          const oldId = tc.id;
          const newId = makeNvidiaToolId(i, j, tc.function?.name);
          tc.id = newId;
          if (oldId) idMap.set(oldId, newId);
        }
      }
    }
    if (msg.role === "tool" && msg.tool_call_id && !NVIDIA_TOOL_ID_PATTERN.test(msg.tool_call_id)) {
      // Use mapped id so the tool response stays linked to its assistant tool_call.
      // Only fall back to positional hash when no mapping exists.
      msg.tool_call_id = idMap.get(msg.tool_call_id) || makeNvidiaToolId(i, 0, null);
    }
  }
  return body;
}
