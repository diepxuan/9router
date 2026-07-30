// diepxuan: Groq provider registry override (fork-layer extension).
//
// Base `open-sse/providers/registry/groq.js` lists models that no longer
// exist on Groq API. Verified via https://api.groq.com/openai/v1/models
// on 2026-07-30:
//
//   Missing models (live API says 404):
//     - qwen/qwen3-32b           (EOL — only qwen3.6-27b available)
//     - minimaxai/minimax-m2.7    (no longer hosted by Groq)
//
// We append an "alias" entry to keep the provider id "groq" working but
// expose only the live model list. This file is imported by the fork-layer
// wrapper around the base registry; upstream registry is unchanged.

import baseGroq from "../../providers/registry/groq.js";

const REMOVED_MODEL_IDS = new Set([
  "qwen/qwen3-32b",
  "minimaxai/minimax-m2.7",
]);

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

const filtered = {
  ...baseGroq,
  models: Array.isArray(baseGroq.models)
    ? baseGroq.models.filter((m) => !REMOVED_MODEL_IDS.has(m.id))
    : baseGroq.models,
};

export default isForkEnabled() ? filtered : baseGroq;
