// DiepXuan fork-layer provider: Agnes AI (Sapiens AI).
// OpenAI-compatible gateway. Kept in the fork layer per AGENTS.md §6;
// wired into REGISTRY via a single append in providers/registry/index.js.
//
// Docs: https://agnes-ai.com/en/docs/overview
// Base URL: https://apihub.agnes-ai.com/v1  | Auth: Authorization: Bearer <API_KEY>
//
// Model availability verified live via GET /v1/models + real calls (2026-07-23):
//   - agnes-2.0-flash        text/vision  -> POST /v1/chat/completions   (200 OK)
//   - agnes-image-2.0-flash  image        -> POST /v1/images/generations (200 OK)
//   - agnes-image-2.1-flash  image        -> POST /v1/images/generations (listed live)
//   - agnes-1.5-flash        NOT AVAILABLE (503 model_not_found) -> omitted on purpose
//   - agnes-video-v2.0       video (async POST /v1/videos + poll video_id) -> deferred,
//     needs a dedicated executor (shape differs from videoCore's Grok Imagine proxy).
export default {
  id: "agnes",
  alias: "agnes",
  aliases: ["agnes-ai"],
  uiAlias: "agnes",
  category: "apikey",
  authType: "apikey",
  display: {
    name: "Agnes AI",
    icon: "smart_toy",
    color: "#6D28D9",
    textIcon: "AG",
    website: "https://agnes-ai.com",
    notice: {
      text: "OpenAI-compatible multimodal gateway by Sapiens AI. LLM + image supported; video deferred.",
      apiKeyUrl: "https://platform.agnes-ai.com",
    },
  },
  transport: {
    baseUrl: "https://apihub.agnes-ai.com/v1/chat/completions",
    validateUrl: "https://apihub.agnes-ai.com/v1/models",
    thinkingFormat: "openai",
  },
  models: [
    { id: "agnes-2.0-flash", name: "Agnes 2.0 Flash" },
    { id: "agnes-image-2.0-flash", name: "Agnes Image 2.0 Flash", params: ["n", "size"], kind: "image" },
    { id: "agnes-image-2.1-flash", name: "Agnes Image 2.1 Flash", params: ["n", "size"], kind: "image" },
  ],
  serviceKinds: ["llm", "image"],
  imageConfig: { baseUrl: "https://apihub.agnes-ai.com/v1/images/generations" },
};
