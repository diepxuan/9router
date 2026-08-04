// DiepXuan fork-layer provider: LLMGateway (llmgateway.io).
// OpenAI-compatible LLM gateway with free model tier.
// Kept in fork layer per AGENTS.md §6; wired into REGISTRY via a single append in providers/registry/index.js.
//
// Docs: https://docs.llmgateway.io
// Base URL: https://api.llmgateway.io/v1  | Auth: Authorization: Bearer <API_KEY>
//
// Free tier (verified via https://api.llmgateway.io/v1/models on 2026-08-04):
//   - auto                       (zero-cost routing model)
//   - claude-haiku-4-5-free      (zero-cost Anthropic Claude Haiku 4.5)
//   - custom                     (user-defined custom model)
// Pricing page states 3 free models, rate limited (20 reqs/min on free models).
// Additional paid models are fetched live from /v1/models.
export default {
  id: "llmgateway",
  alias: "llmgateway",
  aliases: ["llm"],
  uiAlias: "llm",
  category: "apikey",
  authType: "apikey",
  hasFree: true,
  display: {
    name: "LLMGateway",
    icon: "hub",
    color: "#F97316",
    textIcon: "LG",
    website: "https://llmgateway.io",
    notice: {
      text: "OpenAI-compatible gateway, 200+ models, free tier with rate limits.",
      apiKeyUrl: "https://llmgateway.io",
    },
  },
  transport: {
    baseUrl: "https://api.llmgateway.io/v1/chat/completions",
    validateUrl: "https://api.llmgateway.io/v1/models",
  },
  models: [
    { id: "auto", name: "Auto (Free)" },
    { id: "claude-haiku-4-5-free", name: "Claude Haiku 4.5 (Free)" },
    { id: "custom", name: "Custom (Free)" },
  ],
  modelsFetcher: { url: "https://api.llmgateway.io/v1/models", type: "openai" },
  passthroughModels: true,
};
