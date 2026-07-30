// DiepXuan fork-layer provider: AIHubMix (aihubmix.com).
// OpenAI-compatible multi-model gateway with extensive free model tier.
// Kept in the fork layer per AGENTS.md §6;
// wired into REGISTRY via a single append in providers/registry/index.js.
//
// Docs: https://aihubmix.com/models
// Base URL: https://aihubmix.com/v1  | Auth: Authorization: Bearer <API_KEY>
//
// Free model list fetched live from API (2026-07-29): 46 free models.
export default {
  id: "aihubmix",
  alias: "aihubmix",
  aliases: ["ahm"],
  uiAlias: "ahm",
  category: "apikey",
  authType: "apikey",
  hasFree: true,
  display: {
    name: "AIHubMix",
    icon: "layers",
    color: "#3B82F6",
    textIcon: "AH",
    website: "https://aihubmix.com",
    notice: {
      text: "Free tier: 46+ free models including GPT-5.5, Gemini, GLM, Nemotron, MiMo. No credit card needed.",
      apiKeyUrl: "https://aihubmix.com",
    },
  },
  transport: {
    baseUrl: "https://aihubmix.com/v1/chat/completions",
    validateUrl: "https://aihubmix.com/v1/models",
    thinkingFormat: "openai",
  },
  models: [
    // ── Coding Models ──
    { id: "coding-glm-4.6-free", name: "Coding GLM 4.6 (Free)" },
    { id: "coding-glm-4.7-free", name: "Coding GLM 4.7 (Free)" },
    { id: "coding-glm-5-free", name: "Coding GLM 5 (Free)" },
    { id: "coding-glm-5-turbo-free", name: "Coding GLM 5 Turbo (Free)" },
    { id: "coding-glm-5.1-free", name: "Coding GLM 5.1 (Free)" },
    { id: "coding-glm-5.2-free", name: "Coding GLM 5.2 (Free)" },
    { id: "coding-kimi-k3-free", name: "Coding Kimi K3 (Free)" },
    { id: "coding-minimax-m2-free", name: "Coding MiniMax M2 (Free)" },
    { id: "coding-minimax-m2.1-free", name: "Coding MiniMax M2.1 (Free)" },
    { id: "coding-minimax-m2.5-free", name: "Coding MiniMax M2.5 (Free)" },
    { id: "coding-minimax-m2.7-free", name: "Coding MiniMax M2.7 (Free)" },
    { id: "coding-minimax-m3-free", name: "Coding MiniMax M3 (Free)" },
    { id: "k2.6-code-preview-free", name: "K2.6 Code Preview (Free)" },
    { id: "kimi-for-coding-free", name: "Kimi for Coding (Free)" },
    { id: "north-mini-code-free", name: "North Mini Code (Free)" },

    // ── General LLMs ──
    { id: "gemini-3-flash-preview-free", name: "Gemini 3 Flash Preview (Free)" },
    { id: "gemini-3.5-flash-lite-free", name: "Gemini 3.5 Flash Lite (Free)" },
    { id: "gemini-3.6-flash-free", name: "Gemini 3.6 Flash (Free)" },
    { id: "gemma-4-26b-a4b-it-free", name: "Gemma 4 26B (Free)" },
    { id: "gemma-4-31b-it-free", name: "Gemma 4 31B (Free)" },
    { id: "glm-4.7-flash-free", name: "GLM 4.7 Flash (Free)" },
    { id: "gpt-4.1-free", name: "GPT-4.1 (Free)" },
    { id: "gpt-4.1-mini-free", name: "GPT-4.1 Mini (Free)" },
    { id: "gpt-4.1-nano-free", name: "GPT-4.1 Nano (Free)" },
    { id: "gpt-4o-free", name: "GPT-4o (Free)" },
    { id: "gpt-5.5-free", name: "GPT-5.5 (Free)" },
    { id: "gpt-oss-20b-free", name: "GPT-OSS 20B (Free)" },
    { id: "laguna-m.1-free", name: "Laguna M1 (Free)" },
    { id: "laguna-s-2.1-free", name: "Laguna S 2.1 (Free)" },
    { id: "laguna-xs-2.1-free", name: "Laguna XS 2.1 (Free)" },
    { id: "ling-3.0-flash-free", name: "Ling 3.0 Flash (Free)" },
    { id: "mimo-v2-flash-free", name: "MiMo V2 Flash (Free)" },
    { id: "nemotron-3-nano-30b-a3b-free", name: "Nemotron 3 Nano 30B (Free)" },
    { id: "nemotron-3-nano-omni-30b-a3b-reasoning-free", name: "Nemotron 3 Nano Omni (Free)" },
    { id: "nemotron-3-super-120b-a12b-free", name: "Nemotron 3 Super 120B (Free)" },
    { id: "nemotron-3-ultra-550b-a55b-free", name: "Nemotron 3 Ultra 550B (Free)" },
    { id: "nemotron-3.5-content-safety-free", name: "Nemotron 3.5 Content Safety (Free)" },
    { id: "nemotron-nano-12b-v2-vl-free", name: "Nemotron Nano 12B V2 VL (Free)" },
    { id: "nemotron-nano-9b-v2-free", name: "Nemotron Nano 9B V2 (Free)" },
    { id: "qwen3.6-plus-preview-free", name: "Qwen 3.6 Plus Preview (Free)" },
    { id: "xiaomi-mimo-v2-omni-free", name: "Xiaomi MiMo V2 Omni (Free)" },
    { id: "xiaomi-mimo-v2-pro-free", name: "Xiaomi MiMo V2 Pro (Free)" },
    { id: "xiaomi-mimo-v2.5-free", name: "Xiaomi MiMo V2.5 (Free)" },
    { id: "xiaomi-mimo-v2.5-pro-free", name: "Xiaomi MiMo V2.5 Pro (Free)" },

    // ── Image Generation ──
    { id: "gpt-image-2-free", name: "GPT Image 2 (Free)", params: ["n", "size", "quality"], kind: "image" },
  ],
  serviceKinds: ["llm", "image", "imageToText"],
  imageConfig: { baseUrl: "https://aihubmix.com/v1/images/generations" },
  modelsFetcher: { url: "https://aihubmix.com/v1/models", type: "openai-free" },
  passthroughModels: true,
};
