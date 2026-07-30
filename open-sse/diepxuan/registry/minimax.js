// DiepXuan fork-layer override for MiniMax provider.
//
// Base `open-sse/providers/registry/minimax.js` is unchanged. This module
// applies DiepXuan-only adjustments:
//   1. Add `stripBuiltinTools` config to the `transports[].format="claude"` entry.
//      Codex CLI emits 3 builtin tools (tool_search, web_search, image_generation)
//      without names — MiniMax Claude endpoint rejects them with 400.
//
// Wired via d8 in open-sse/providers/registry/index.js → appended after
// the base entry, the last entry with id="minimax" wins.

import baseMinimax from "../../providers/registry/minimax.js";

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

function deepCloneTransports(transports) {
  if (!Array.isArray(transports)) return transports;
  return transports.map((t) => ({ ...t }));
}

const override = {
  ...baseMinimax,
  ...(Array.isArray(baseMinimax.transports)
    ? {
        transports: baseMinimax.transports.map((t) => {
          if (t.format === "claude") {
            return {
              ...t,
              stripBuiltinTools: {
                models: ["MiniMax-M3", "MiniMax-M2.7"],
                namelessTypes: ["tool_search", "web_search", "image_generation"],
                unsupportedTypes: ["custom", "namespace"],
              },
            };
          }
          return { ...t };
        }),
      }
    : {}),
};

export default isForkEnabled() ? override : baseMinimax;
