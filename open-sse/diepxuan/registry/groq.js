// DiepXuan fork-layer override for Groq provider.
//
// Base `open-sse/providers/registry/groq.js` is unchanged. This module adds
// DiepXuan-only Groq models and service kinds (TTS, Compound agents, etc.),
// and filters EOL models verified missing from live Groq API on 2026-07-30.
//
// Strategy:
//   1. Start from base registry (single source of truth for Groq basics).
//   2. Filter EOL models (live API says 404 for qwen/qwen3-32b).
//   3. Append new models declared by DiepXuan fork.
//   4. Extend serviceKinds + add ttsConfig.
//
// Wired via d5 in open-sse/providers/registry/index.js → builds PROVIDERS[d5.id]
// ahead of the base registry entry — see `index.js` for wiring details.

import baseGroq from "../../providers/registry/groq.js";

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

// Models verified missing from live Groq API on 2026-07-30:
//   - qwen/qwen3-32b          (EOL — only qwen3.6-27b available)
//   - minimaxai/minimax-m2.7  (not hosted by Groq)
const REMOVED_MODEL_IDS = new Set([
  "qwen/qwen3-32b",
  "minimaxai/minimax-m2.7",
]);

// ── DiepXuan-added models ──
// Grouped by category for readability; order = display order in dashboard.
const DIEPXUAN_MODELS = [
  // ── Production LLMs ──
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
  { id: "qwen/qwen3.6-27b", name: "Qwen3.6 27B" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B" },
  { id: "openai/gpt-oss-safeguard-20b", name: "Safety GPT-OSS 20B" },
  { id: "minimaxai/minimax-m2.7", name: "MiniMax M2.7" },

  // ── Groq Compound Systems (Agentic AI) ──
  { id: "groq/compound", name: "Groq Compound" },
  { id: "groq/compound-mini", name: "Groq Compound Mini" },

  // ── Guard / Moderation ──
  { id: "meta-llama/llama-prompt-guard-2-22m", name: "Llama Prompt Guard 2 (22M)" },
  { id: "meta-llama/llama-prompt-guard-2-86m", name: "Llama Prompt Guard 2 (86M)" },

  // ── Text-to-Speech (TTS) — Orpheus models ──
  { id: "canopylabs/orpheus-v1-english", name: "Orpheus v1 English", kind: "tts" },
  { id: "canopylabs/orpheus-arabic-saudi", name: "Orpheus Arabic Saudi", kind: "tts" },
];

const override = {
  ...baseGroq,
  models: [
    ...(Array.isArray(baseGroq.models) ? baseGroq.models : []).filter(
      (m) => !REMOVED_MODEL_IDS.has(m.id),
    ),
    ...DIEPXUAN_MODELS,
  ],
  serviceKinds: Array.from(new Set([...(baseGroq.serviceKinds || []), "tts"])),
  ttsConfig: {
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    format: "openai",
    defaultModel: "canopylabs/orpheus-v1-english",
  },
};

export default isForkEnabled() ? override : baseGroq;
