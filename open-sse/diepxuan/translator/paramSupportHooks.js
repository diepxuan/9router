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
  // NVIDIA NIM: inject max_tokens khi client khong gui
  { provider: "nvidia", injectMaxTokens: 8192 },
];

/**
 * Ap dung fork param rules len body request.
 * Chi tac dong khi provider khop voi rule. No-op cho provider khac.
 * Goi SAU `stripUnsupportedParams()` de fork rules override base rules.
 *
 * @param {string} provider
 * @param {object} body - request body (mutated in place)
 */
export function applyForkParamRules(provider, body) {
  if (!isDiepXuanEnabled()) return;
  if (!provider || !body || typeof body !== "object") return;

  for (const rule of FORK_STRIP_RULES) {
    if (rule.provider && rule.provider !== provider) continue;

    // Strip params
    if (Array.isArray(rule.drop)) {
      for (const key of rule.drop) {
        if (body[key] !== undefined) delete body[key];
      }
    }

    // Inject max_tokens khi thieu
    if (rule.injectMaxTokens &&
        body.max_tokens === undefined &&
        body.max_completion_tokens === undefined) {
      body.max_tokens = rule.injectMaxTokens;
    }
  }
}
