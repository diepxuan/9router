// diepxuan: strip Groq-incompatible fields before request reaches Groq API.
//
// Bug: reasoning_content / reasoning / enable_thinking / thinking_budget / thinking
// fields appear in messages[] when a combo request reuses a conversation that
// previously hit a reasoning-capable provider (DeepSeek, Kimi, MiniMax native).
// Groq is OpenAI-compatible and rejects these fields with 400.
//
// This runs in the translator pipeline AFTER injectReasoningContent so any
// injections targeting compatible providers are kept; only the Groq-specific
// strip is applied.

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const GROQ_BLOCKED_FIELDS = [
  "reasoning_content",
  "reasoning",
  "reasoning_details",
  "thinking",
  "enable_thinking",
  "thinking_budget",
  "thinkingConfig",
];

function stripFromMessage(msg) {
  if (!msg || typeof msg !== "object") return msg;
  const next = { ...msg };
  for (const f of GROQ_BLOCKED_FIELDS) {
    if (f in next) delete next[f];
  }
  return next;
}

function stripFromBody(body) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  for (const f of GROQ_BLOCKED_FIELDS) {
    if (f in next && f !== "reasoning_content") delete next[f];
    // Keep reasoning_content at top-level for OpenAI compat (output field).
    // Per-message reasoning_content is the problem Groq rejects.
  }
  // Groq reasoning models only accept none/default for reasoning_effort.
  if (next.reasoning_effort !== undefined
      && next.reasoning_effort !== "none"
      && next.reasoning_effort !== "default") {
    next.reasoning_effort = "default";
  }
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map(stripFromMessage);
  }
  return next;
}

/**
 * Returns true if (provider, model) targets Groq API.
 * Groq OpenAI-compatible endpoint accepts only OpenAI-shape messages.
 */
export function isGroqTarget(provider, _model) {
  return provider === "groq";
}

/**
 * Apply Groq-field strip when the request is destined for Groq.
 * No-op for other providers (lets the existing injector run untouched).
 */
export function stripGroqIncompatibleFields(provider, body) {
  if (!isDiepXuanEnabled()) return body;
  if (!isGroqTarget(provider)) return body;
  return stripFromBody(body);
}

export default stripGroqIncompatibleFields;
