// diepxuan: Groq-specific executor override.
//
// Groq API is OpenAI-compatible but rejects these fields that may be
// injected by upstream providers (DeepSeek, Kimi, MiniMax native) when a
// combo fallback reuses a conversation:
//
//   - reasoning_content (in messages[].reasoning_content)
//   - reasoning (in messages[].reasoning)
//   - thinking, enable_thinking, thinking_budget (Qwen shape)
//   - reasoning_details, thinkingConfig (Gemini shape)
//
// The base DefaultExecutor (file has no fork marker) cannot be edited
// directly per AGENTS.md §6, so this fork-layer executor extends it and
// overrides transformRequest to strip the offending fields BEFORE the
// upstream call. Wire-up is via open-sse/executors/index.js fork dispatch.

import { DefaultExecutor } from "../../executors/default.js";
import { stripGroqIncompatibleFields } from "../transformers/stripGroqIncompatible.js";

const GROQ_BLOCKED_MSG_FIELDS = [
  "reasoning_content",
  "reasoning",
  "reasoning_details",
  "thinking",
  "enable_thinking",
  "thinking_budget",
  "thinkingConfig",
];

// Top-level fields that Groq API rejects (model-dependent). Stripped from
// the request body before send. Verified via live API tests 2026-07-30.
const GROQ_BLOCKED_BODY_FIELDS = [
  "metadata",       // not supported with any Groq model
  "store",          // not supported with any Groq model
  "logit_bias",     // not supported with reasoning models (qwen3.6-27b, etc)
  "n",              // Groq only allows n=1; n>1 returns 400
  "text",           // Groq rejects top-level text: {"verbosity":"low"}
];

function stripMessageFields(msg) {
  if (!msg || typeof msg !== "object") return msg;
  const next = { ...msg };
  for (const f of GROQ_BLOCKED_MSG_FIELDS) {
    if (f in next) delete next[f];
  }
  // Groq rejects tool_calls[].function.arguments missing entirely (400).
  // OpenAI spec allows omitted arguments; Groq requires empty string.
  if (Array.isArray(next.tool_calls)) {
    next.tool_calls = next.tool_calls.map((tc) => {
      if (!tc || typeof tc !== "object") return tc;
      const fn = tc.function;
      if (!fn || typeof fn !== "object") return tc;
      if (typeof fn.arguments !== "string") {
        // Coerce non-string arguments to "{}". Groq rejects missing/empty;
        // JSON.stringify(undefined) returns undefined which would still leave
        // the field missing — explicitly set "{}" instead.
        try {
          const stringified = JSON.stringify(fn.arguments ?? {});
          fn.arguments = (typeof stringified === "string") ? stringified : "{}";
        } catch {
          fn.arguments = "{}";
        }
      }
      return tc;
    });
  }
  return next;
}

export class GroqExecutor extends DefaultExecutor {
  constructor() {
    super("groq");
  }

  transformRequest(model, body) {
    // 1. Run base transform (json schema fallback, quirks, stripUnsupportedParams,
    //    injectReasoningContent — last one is a no-op for groq since the provider
    //    has no reasoningInject rule and the model rules don't match Groq models).
    let transformed = super.transformRequest(model, body);

    // 2. Strip fields that Groq API does not understand per-message and
    //    inject missing tool_calls[].function.arguments="" (Groq rejects).
    if (transformed && Array.isArray(transformed.messages)) {
      transformed = { ...transformed, messages: transformed.messages.map(stripMessageFields) };
    }

    // 3. Strip fields that Groq API does not understand at the top level
    //    (reasoning_content, thinking, enable_thinking, ...).
    transformed = stripGroqIncompatibleFields(this.provider, transformed);

    // 3. Strip top-level body fields Groq rejects (model-dependent).
    if (transformed && typeof transformed === "object") {
      for (const f of GROQ_BLOCKED_BODY_FIELDS) {
        if (f in transformed) {
          // Clamp n to 1 instead of removing, since removing n entirely is
          // also fine (default is 1) but some callers rely on the field.
          if (f === "n" && transformed[f] === 1) continue;
          delete transformed[f];
        }
      }
    }

    return transformed;
  }
}

export default GroqExecutor;
