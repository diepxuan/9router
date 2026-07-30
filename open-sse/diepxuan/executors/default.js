// DiepXuan fork-layer wrapper cho DefaultExecutor.
//
// Ghi de `transformRequest()` de ap dung fork param rules sau khi base rules chay.
// Khi `DIEPXUAN_ENABLED=false`, fallback ve base executor byte-for-byte.
//
// Wire trong `open-sse/executors/index.js`:
//   "default": new (isDiepXuanEnabled() ? DiepxuanDefaultExecutor : DefaultExecutor)()

import { DefaultExecutor } from "../../executors/default.js";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import { applyForkParamRules } from "../translator/paramSupportHooks.js";

export class DiepxuanDefaultExecutor extends DefaultExecutor {
  constructor(provider) {
    super(provider);
  }

  /**
   * Ghi de: chay base transformRequest, sau do ap dung fork param rules.
   */
  transformRequest(model, body) {
    const result = super.transformRequest(model, body);
    if (result && typeof result === "object") {
      applyForkParamRules(this.provider, result);
    }
    return result;
  }
}

/**
 * Factory function de tao executor voi fork override.
 * Dung trong `executors/index.js` de tranh `new (cond ? A : B)()` syntax.
 */
export function createDefaultExecutor(provider) {
  if (!isDiepXuanEnabled()) return new DefaultExecutor(provider);
  return new DiepxuanDefaultExecutor(provider);
}
