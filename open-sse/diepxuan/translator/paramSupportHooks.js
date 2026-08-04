// DiepXuan fork-layer: param support hook cho NVIDIA NIM.
//
// Bo sung rules xu ly param ma base `stripUnsupportedParams` khong co.
// Duoc goi tu `DiepxuanDefaultExecutor.transformRequest()` sau khi base rules chay.
//
// Rules hien tai:
//   1. NVIDIA NIM reject unknown top-level params nhu `text: {"verbosity":"low"}`
//      (duoc gui boi mot so AI coding tools). Strip truoc dispatch de tranh 400.
//   2. NVIDIA NIM require explicit max_tokens; khong co thi API truncate response
//      xuong 1-20 tokens (NVIDIA default la 0). Inject 8192 lam safe default.

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

const FORK_STRIP_RULES = [
  // NVIDIA NIM: strip `text` param
  { provider: "nvidia", drop: ["text"] },
  // OpenAI Chat Completions: `text: {"verbosity":...}` chi hop le tren
  // Responses API (/v1/responses). Mot so client inject "text" khi dich sang
  // chat/completions -> OpenAI 400 "Unknown parameter: text". Strip de tranh 400.
  { provider: "openai", drop: ["text"] },
  // OpenAI gpt-5.4*/5.5/5.6: function tools + reasoning_effort(!=none) -> 400.
  // Probe 2026-08-04: gpt-5.6* still errors when the field is omitted, so set none.
  { provider: "openai", setIfTools: { reasoning_effort: "none" }, modelMatch: /^gpt-5\.(4|5|6)/ },
  // OpenAI legacy non-reasoning (gpt-4o, gpt-4.1, gpt-4-turbo) rejects reasoning_effort param entirely.
  { provider: "openai", drop: ["reasoning_effort"], modelMatch: /^gpt-4/ },
  // NVIDIA NIM: inject max_tokens khi client khong gui
  { provider: "nvidia", injectMaxTokens: 8192 },
  // TokenRouter Kimi K3 Free only accepts low/high/max and string content.
  { provider: "tokenrouter", clampReasoningEffort: ["low", "high", "max"], defaultReasoningEffort: "high" },
  { provider: "tokenrouter", flattenAssistantContent: true },
];

/**
 * Ap dung fork param rules len body request.
 * Chi tac dong khi provider khop voi rule. No-op cho provider khac.
 * Goi SAU `stripUnsupportedParams()` de fork rules override base rules.
 *
 * @param {string} provider
 * @param {object} body - request body (mutated in place)
 */
export function applyForkParamRules(provider, body, model = body?.model) {
  if (!isDiepXuanEnabled()) return;
  if (!provider || !body || typeof body !== "object") return;

  for (const rule of FORK_STRIP_RULES) {
    if (rule.provider && rule.provider !== provider) continue;
    if (rule.modelMatch && !(typeof model === "string" && rule.modelMatch.test(model))) continue;

    // Strip params
    if (Array.isArray(rule.drop)) {
      for (const key of rule.drop) {
        if (body[key] !== undefined) delete body[key];
      }
    }

    // Mutate params only when tool definitions are present.
    if (Array.isArray(body.tools) && body.tools.length > 0) {
      if (Array.isArray(rule.dropIfTools)) {
        for (const key of rule.dropIfTools) {
          if (body[key] !== undefined) delete body[key];
        }
      }
      if (rule.setIfTools && typeof rule.setIfTools === "object") {
        Object.assign(body, rule.setIfTools);
      }
    }

    // Inject max_tokens khi thieu
    if (rule.injectMaxTokens &&
        body.max_tokens === undefined &&
        body.max_completion_tokens === undefined) {
      body.max_tokens = rule.injectMaxTokens;
    }

    // Clamp reasoning_effort to provider-allowed values
    if (Array.isArray(rule.clampReasoningEffort) && body.reasoning_effort !== undefined) {
      if (!rule.clampReasoningEffort.includes(body.reasoning_effort)) {
        body.reasoning_effort = rule.defaultReasoningEffort || rule.clampReasoningEffort[0];
      }
    }

    // TokenRouter rejects assistant messages with array content parts;
    // flatten text parts to a plain string.
    if (rule.flattenAssistantContent && Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
        const text = msg.content
          .filter((p) => p && p.type === "text" && typeof p.text === "string")
          .map((p) => p.text)
          .join("");
        msg.content = text;
      }
    }
  }
}
