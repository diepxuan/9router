/**
 * Combo hook layer (fork extension).
 *
 * Two extensions layered on top of the upstream combo logic:
 *   1. Fail-count skip tracker (PR #54 / 2026-07-24) — skip a model that
 *      has failed >= MAX_FAILS times consecutively in this combo.
 *   2. Context-length skip — skip a model whose context window cannot
 *      fit the estimated prompt tokens (avoids waiting for upstream
 *      400/context-length errors before fallback).
 *
 * Rate-limit throttle engine (ADR-007) was removed in PR #68 re-scope;
 * see MEMORY.md §4 nợ kỹ thuật row "Rate-limit engine (ADR-007)".
 */

import { recordComboModelResult, shouldSkipModelInCombo } from "./comboFailTracker.js";
import { isDiepXuanEnabled } from "../../src/diepxuan/shared/config/flags.js";
import { getContextLengthSync } from "./contextLength/index.js";
import { getCapabilitiesForModel } from "../providers/capabilities.js";

export function shouldSkipComboModel(modelStr, comboName) {
  if (!isDiepXuanEnabled()) return false;
  return shouldSkipModelInCombo(modelStr, comboName);
}

export function recordComboModelOutcome(modelStr, comboName, success) {
  if (!isDiepXuanEnabled()) return;
  recordComboModelResult(modelStr, comboName, success);
}

/**
 * Estimate prompt tokens from a request body. Counts message text + tool
 * definitions and divides by 4 (rough heuristic for English). Returns 0
 * when input is missing.
 */
function estimateTokens(body) {
  if (!body || typeof body !== "object") return 0;
  let chars = 0;
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      if (typeof m?.content === "string") chars += m.content.length;
      else if (Array.isArray(m?.content)) {
        for (const c of m.content) {
          if (typeof c?.text === "string") chars += c.text.length;
        }
      }
    }
  }
  if (Array.isArray(body.input)) {
    for (const m of body.input) {
      if (typeof m?.content === "string") chars += m.content.length;
      else if (Array.isArray(m?.content)) {
        for (const c of m.content) {
          if (typeof c?.text === "string") chars += c.text.length;
        }
      }
    }
  }
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      if (typeof t?.function?.name === "string") chars += t.function.name.length;
      if (typeof t?.function?.description === "string") chars += t.function.description.length;
      if (t?.function?.parameters) chars += JSON.stringify(t.function.parameters).length;
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * Before each combo model attempt, check the fail-skip tracker and the
 * context-length guard. The context guard prevents waiting for an
 * upstream 400/context-length error when the model already cannot fit.
 *
 * @param {object} args
 * @param {string} args.modelStr      - "provider/model"
 * @param {string} args.comboName
 * @param {object} [args.log]
 * @param {object} [args.body]        - request body (for token estimate)
 * @returns {Promise<{skip:boolean, reason?:string}>}
 */
export async function beforeComboModelAttempt({ modelStr, comboName, log, body }) {
  if (!isDiepXuanEnabled()) return { skip: false };

  if (shouldSkipComboModel(modelStr, comboName)) {
    log?.debug?.("COMBO", "Skipping " + modelStr + " (fail count exceeded)");
    return { skip: true, reason: "fail_count_exceeded" };
  }

  const slash = modelStr.indexOf("/");
  const provider = slash > 0 ? modelStr.slice(0, slash) : "";
  const model = slash > 0 ? modelStr.slice(slash + 1) : modelStr;
  if (!provider || !model) return { skip: false };

  const estimatedTokens = estimateTokens(body);
  const modelCtx = getContextLengthSync(modelStr)
    || getCapabilitiesForModel(provider, model).contextWindow
    || 0;
  if (modelCtx > 0 && estimatedTokens > modelCtx) {
    log?.info?.("COMBO", `Skipping ${modelStr} (ctx too small: ${estimatedTokens} > ${modelCtx})`);
    return { skip: true, reason: "context_too_large" };
  }

  return { skip: false };
}

export function afterComboModelAttempt({ modelStr, comboName, ok }) {
  recordComboModelOutcome(modelStr, comboName, ok);
}
