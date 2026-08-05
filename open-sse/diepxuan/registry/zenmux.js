// DiepXuan fork-layer provider: ZenMux (zenmux.ai).
// OpenAI-compatible LLM gateway with free model tier.
// Kept in the fork layer per AGENTS.md §6;
// wired into REGISTRY via a single append in providers/registry/index.js.
//
// Docs: https://zenmux.ai/models?supported_protocol=chat.completions&price_filter=free
// Base URL: https://zenmux.ai/api/v1  | Auth: Authorization: Bearer <API_KEY>
//
// Free models verified via live API (2026-08-05):
//   - deepseek/deepseek-v4-flash-free   DeepSeek V4 Flash 0731 (Free, 1M ctx)
//   - z-ai/glm-4.7-flash-free          GLM 4.7 Flash (Free, 200k ctx)
//   - z-ai/glm-4.6v-flash-free         GLM 4.6V Flash (Free, 200k ctx, multimodal input)
export default {
  id: "zenmux",
  alias: "zenmux",
  aliases: ["zm"],
  uiAlias: "zm",
  category: "apikey",
  authType: "apikey",
  hasFree: true,
  display: {
    name: "ZenMux",
    icon: "alt_route",
    color: "#06B6D4",
    textIcon: "ZM",
    website: "https://zenmux.ai",
    notice: {
      text: "LLM gateway with 100+ models. Free tier (chat.completions): DeepSeek V4 Flash 0731, DeepSeek V4 Flash, Ling 3.0 Flash, GLM 4.7 Flash, GLM 4.6V Flash.",
      apiKeyUrl: "https://zenmux.ai",
    },
  },
  transport: {
    baseUrl: "https://zenmux.ai/api/v1/chat/completions",
    validateUrl: "https://zenmux.ai/api/v1/models",
    thinkingFormat: "openai",
  },
  models: [
    { id: "deepseek/deepseek-v4-flash-free", name: "DeepSeek V4 Flash 0731 (Free)", isFree: true },
    { id: "inclusionai/ling-3.0-flash", name: "inclusionAI Ling 3.0 Flash (Free)", isFree: true },
    { id: "z-ai/glm-4.7-flash-free", name: "GLM 4.7 Flash (Free)", isFree: true },
    { id: "z-ai/glm-4.6v-flash-free", name: "GLM 4.6V Flash (Free)", isFree: true },
  ],
  modelsFetcher: { url: "https://zenmux.ai/api/v1/models", type: "openai" },
  passthroughModels: true,
};
