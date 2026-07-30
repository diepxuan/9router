import { isDiepXuanEnabled } from "@/diepxuan/shared/config/flags.js";

export const CODEX_SUBAGENT_DESCRIPTION = "9Router subagent for delegated coding and exploration tasks";

export function extendCodexSubagentConfig(config) {
  if (!isDiepXuanEnabled()) return config || {};
  return {
    description: CODEX_SUBAGENT_DESCRIPTION,
    ...config,
  };
}

