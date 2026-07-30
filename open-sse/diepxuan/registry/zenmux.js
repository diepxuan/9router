// DiepXuan fork-layer provider: ZenMux (zenmux.ai).
// OpenAI-compatible LLM gateway with free model tier.
// Kept in the fork layer per AGENTS.md §6;
// wired into REGISTRY via a single append in providers/registry/index.js.
//
// Docs: https://zenmux.ai/models
// Base URL: https://zenmux.ai/api/v1  | Auth: Authorization: Bearer <API_KEY>
//
// Free models (subject to rate limits):
//   - z-ai/glm-5.2-free          Z.AI GLM 5.2
//   - moonshotai/kimi-k2.7-code-free  Kimi K2.7 Code
//   - stepfun/step-3.7-flash-free Step 3.7 Flash
//   - z-ai/glm-4.7-flash-free    Z.AI GLM 4.7 Flash
//   - z-ai/glm-4.6v-flash-free   Z.AI GLM 4.6V Flash
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
      text: "LLM gateway with 100+ models. Free tier: GLM, Kimi, Stepfun models at zero cost (rate limited).",
      apiKeyUrl: "https://zenmux.ai",
    },
  },
  transport: {
    baseUrl: "https://zenmux.ai/api/v1/chat/completions",
    validateUrl: "https://zenmux.ai/api/v1/models",
    thinkingFormat: "openai",
  },
  models: [
    { id: "z-ai/glm-5.2-free", name: "GLM 5.2 (Free)" },
    { id: "moonshotai/kimi-k2.7-code-free", name: "Kimi K2.7 Code (Free)" },
    { id: "stepfun/step-3.7-flash-free", name: "Step 3.7 Flash (Free)" },
    { id: "z-ai/glm-4.7-flash-free", name: "GLM 4.7 Flash (Free)" },
    { id: "z-ai/glm-4.6v-flash-free", name: "GLM 4.6V Flash (Free)" },
  ],
  modelsFetcher: { url: "https://zenmux.ai/api/v1/models", type: "openai" },
  passthroughModels: true,
};
