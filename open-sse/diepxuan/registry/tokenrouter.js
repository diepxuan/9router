// DiepXuan fork-layer provider: TokenRouter (tokenrouter.com).
// OpenAI-compatible AI model aggregator/hub. Kept in the fork layer per AGENTS.md §6;
// wired into REGISTRY via a single append in providers/registry/index.js.
//
// Docs: https://tokenrouter.com
// Base URL: https://api.tokenrouter.com/v1  | Auth: Authorization: Bearer <API_KEY>
//
// TokenRouter is a model aggregator gateway. Models are fetched live via /v1/models
// and depend on the API key's permissions.
// Live API response: moonshotai/kimi-k3-free (free Kimi K3 model via Moonshot AI).
export default {
  id: "tokenrouter",
  alias: "tokenrouter",
  aliases: ["trk"],
  uiAlias: "trk",
  category: "apikey",
  authType: "apikey",
  hasFree: true,
  display: {
    name: "TokenRouter",
    icon: "hub",
    color: "#8B5CF6",
    textIcon: "TR",
    website: "https://tokenrouter.com",
    notice: {
      text: "AI model aggregator. Models depend on API key permissions.",
      apiKeyUrl: "https://tokenrouter.com",
    },
  },
  transport: {
    baseUrl: "https://api.tokenrouter.com/v1/chat/completions",
    validateUrl: "https://api.tokenrouter.com/v1/models",
  },
  models: [
    { id: "moonshotai/kimi-k3-free", name: "Kimi K3 Free" },
  ],
  modelsFetcher: { url: "https://api.tokenrouter.com/v1/models", type: "openai" },
  passthroughModels: true,
};
