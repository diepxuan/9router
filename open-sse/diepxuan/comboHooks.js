/**
 * Combo hook layer (fork extension).
 *
 * Two extensions layered on top of the upstream combo logic:
 *   1. Fail-count skip tracker (PR #54 / 2026-07-24) — skip a model that
 *      has failed >= MAX_FAILS times consecutively in this combo.
 *   2. Rate-limit throttle (ADR-007 PR #61) — honour RPM/TPM/RPH/RPD
 *      limits either by waiting (wait-then-send) or by skipping the
 *      attempt (fallback / reject-429).
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.5.
 */

import { recordComboModelResult, shouldSkipModelInCombo } from "./comboFailTracker.js";
import { isDiepXuanEnabled } from "../../src/diepxuan/shared/config/flags.js";
// diepxuan: rate-limit throttle engine (ADR-007 PR #61).
import { acquireQuotaSlot, recordRequestOutcome, estimateTokens } from "./limits/throttle.js";
// diepxuan: context length estimation (combo skip when ctx too small).
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
 * Before each combo model attempt, check both the fail-skip tracker
 * (pre-existing) and the rate-limit throttle (PR #61). The throttle may
 * return a positive waitMs — we sleep that long then proceed. If the
 * wait exceeds the model's maxWaitMs (or the default 90s cap), we skip
 * and let the combo try the next model.
 *
 * NOTE: this function is now async. The only caller (combo.js) was
 * already inside an async for-loop, so a simple `await` in front of the
 * existing call site is the only change required there.
 *
 * @param {object} args
 * @param {string} args.modelStr      - "provider/model"
 * @param {string} args.comboName
 * @param {object} [args.log]
 * @param {object} [args.body]        - request body (for TPM estimate)
 * @param {string} [args.connectionId]
 * @returns {Promise<{skip:boolean, reason?:string, waitMs?:number}>}
 */
export async function beforeComboModelAttempt({ modelStr, comboName, log, body, connectionId }) {
  if (!isDiepXuanEnabled()) return { skip: false };

  if (shouldSkipComboModel(modelStr, comboName)) {
    log?.debug?.("COMBO", "Skipping " + modelStr + " (fail count exceeded)");
    return { skip: true, reason: "fail_count_exceeded" };
  }

  // Parse "provider/model"
  const slash = modelStr.indexOf("/");
  const provider = slash > 0 ? modelStr.slice(0, slash) : "";
  const model = slash > 0 ? modelStr.slice(slash + 1) : modelStr;
  if (!provider || !model) return { skip: false };

  // diepxuan: estimate context usage and skip model when it cannot fit.
  // Avoids waiting for upstream 400/context-length errors before fallback.
  const estimatedTokens = estimateTokens(body);
  const modelCtx = getContextLengthSync(modelStr)
    || getCapabilitiesForModel(provider, model).contextWindow
    || 0;
  if (modelCtx > 0 && estimatedTokens > modelCtx) {
    log?.info?.("COMBO", `Skipping ${modelStr} (ctx too small: ${estimatedTokens} > ${modelCtx})`);
    return { skip: true, reason: "context_too_large" };
  }

  const result = await acquireQuotaSlot({
    provider, model, connectionId, body,
  });

  if (!result.acquired) {
    const waitS = Math.round((result.waitMs || 0) / 1000);
    log?.info?.("COMBO", "Skipping " + modelStr + " (" + (result.reason || "quota") + "; wait=" + waitS + "s)");
    return { skip: true, reason: result.reason, waitMs: result.waitMs };
  }

  if (result.waitMs && result.waitMs > 0) {
    const waitS = Math.round(result.waitMs / 1000);
    log?.info?.("COMBO", "Throttling " + modelStr + " (" + (result.reason || "quota") + "; wait=" + waitS + "s)");
    await new Promise((r) => setTimeout(r, result.waitMs));
  }

  return { skip: false };
}

export function afterComboModelAttempt({ modelStr, comboName, ok, promptTokens = 0, completionTokens = 0, connectionId }) {
  recordComboModelOutcome(modelStr, comboName, ok);
  // diepxuan: feed the rate-limit counter on every attempt (success or
  // fail) so a permanently broken upstream can't be hot-spammed.
  if (ok) {
    const slash = modelStr.indexOf("/");
    const provider = slash > 0 ? modelStr.slice(0, slash) : "";
    const model = slash > 0 ? modelStr.slice(slash + 1) : modelStr;
    recordRequestOutcome({
      provider, model, connectionId,
      promptTokens, completionTokens,
    });
  }
}
