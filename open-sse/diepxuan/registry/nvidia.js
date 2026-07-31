// DiepXuan fork-layer override for NVIDIA NIM provider.
//
// Base `open-sse/providers/registry/nvidia.js` is unchanged. This module
// applies DiepXuan-only adjustments:
//   1. Remove `minimaxai/minimax-m2.7` — this model moved to Groq hosting
//      (verified via live API on 2026-07-30).
//   2. Add/refresh NVIDIA NIM free model catalog (verified via
//      https://integrate.api.nvidia.com/v1/models on 2026-07-31).
//
// Wired via d6 in open-sse/providers/registry/index.js → appended after
// the base entry, the last entry with id="nvidia" wins.

import baseNvidia from "../../providers/registry/nvidia.js";

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

// Removed from NVIDIA free tier (EOL / moved to other host).
const REMOVED_MODEL_IDS = new Set([
  "minimaxai/minimax-m2.7",
]);

// Additional free models verified from NVIDIA NIM live catalog.
const ADDITIONAL_MODELS = [
  // ── Coding / Agent LLMs ──
  { id: "bigcode/starcoder2-15b", name: "StarCoder2 15B" },
  { id: "deepseek-ai/deepseek-coder-6.7b-instruct", name: "DeepSeek Coder 6.7B" },
  { id: "ibm/granite-8b-code-instruct", name: "Granite 8B Code" },
  { id: "ibm/granite-34b-code-instruct", name: "Granite 34B Code" },
  { id: "meta/codellama-70b", name: "Code Llama 70B" },
  { id: "mistralai/codestral-22b-instruct-v0.1", name: "Codestral 22B" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },

  // ── General LLMs ──
  { id: "01-ai/yi-large", name: "Yi Large" },
  { id: "ai21labs/jamba-1.5-large-instruct", name: "Jamba 1.5 Large" },
  { id: "databricks/dbrx-instruct", name: "DBRX Instruct" },
  { id: "google/gemma-3-4b-it", name: "Gemma 3 4B" },
  { id: "google/gemma-3-12b-it", name: "Gemma 3 12B" },
  { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B" },
  { id: "meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
  { id: "meta/llama-3.2-1b-instruct", name: "Llama 3.2 1B" },
  { id: "meta/llama-3.2-3b-instruct", name: "Llama 3.2 3B" },
  { id: "meta/llama-3.2-11b-vision-instruct", name: "Llama 3.2 11B Vision", params: ["image"], kind: "imageToText" },
  { id: "meta/llama-3.2-90b-vision-instruct", name: "Llama 3.2 90B Vision", params: ["image"], kind: "imageToText" },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
  { id: "mistralai/mistral-7b-instruct-v0.3", name: "Mistral 7B" },
  { id: "mistralai/mistral-large", name: "Mistral Large" },
  { id: "mistralai/mistral-large-2-instruct", name: "Mistral Large 2" },
  { id: "mistralai/mistral-medium-3.5-128b", name: "Mistral Medium 3.5 128B" },
  { id: "mistralai/mixtral-8x22b-v0.1", name: "Mixtral 8x22B" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct", name: "Llama 3.1 Nemotron 70B" },
  { id: "nvidia/llama-3.1-nemotron-nano-8b-v1", name: "Llama 3.1 Nemotron Nano 8B" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1", name: "Nemotron Super 49B v1" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", name: "Nemotron Super 49B v1.5" },
  { id: "nvidia/nemotron-3-nano-30b-a3b", name: "Nemotron 3 Nano 30B" },
  { id: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120B" },
  { id: "nvidia/nemotron-mini-4b-instruct", name: "Nemotron Mini 4B" },
  { id: "nvidia/nemotron-nano-12b-v2-vl", name: "Nemotron Nano 12B V2 VL", params: ["image"], kind: "imageToText" },
  { id: "poolside/laguna-xs-2.1", name: "Laguna XS 2.1" },
  { id: "stepfun-ai/step-3.7-flash", name: "Step 3.7 Flash" },
  { id: "thinkingmachines/inkling", name: "Inkling" },
  { id: "writer/palmyra-creative-122b", name: "Palmyra Creative 122B" },
  { id: "zyphra/zamba2-7b-instruct", name: "Zamba2 7B" },
];

const filteredBase = (baseNvidia.models || []).filter(
  (m) => m && !REMOVED_MODEL_IDS.has(m.id),
);

// Deduplicate by id (fork additions win).
const seen = new Set(filteredBase.map((m) => m.id));
const merged = [...filteredBase];
for (const m of ADDITIONAL_MODELS) {
  if (!seen.has(m.id)) {
    merged.push(m);
    seen.add(m.id);
  }
}

const override = {
  ...baseNvidia,
  models: merged,
};

export default isForkEnabled() ? override : baseNvidia;
