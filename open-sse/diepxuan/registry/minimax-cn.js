// DiepXuan fork-layer override for MiniMax (China) provider.
//
// Base `open-sse/providers/registry/minimax-cn.js` is unchanged. This module
// applies DiepXuan-only adjustments:
//   1. Add `stripBuiltinTools` config to the `transports[].format="claude"` entry.
//      Same reason as minimax — Codex CLI nameless tools rejected by MiniMax China
//      Claude endpoint.
//
// Wired via d9 in open-sse/providers/registry/index.js → appended after
// the base entry, the last entry with id="minimax-cn" wins.

import baseMinimaxCn from "../../providers/registry/minimax-cn.js";

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

const override = {
  ...baseMinimaxCn,
  ...(Array.isArray(baseMinimaxCn.transports)
    ? {
        transports: baseMinimaxCn.transports.map((t) => {
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

export default isForkEnabled() ? override : baseMinimaxCn;
