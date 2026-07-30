// DiepXuan fork-layer override for NVIDIA NIM provider.
//
// Base `open-sse/providers/registry/nvidia.js` is unchanged. This module
// applies DiepXuan-only adjustments:
//   1. Remove `minimaxai/minimax-m2.7` — this model moved to Groq hosting
//      (verified via live API on 2026-07-30; NVIDIA's endpoint returns 404
//      or timeouts for m2.7).
//
// Wired via d6 in open-sse/providers/registry/index.js → appended after
// the base entry, the last entry with id="nvidia" wins.

import baseNvidia from "../../providers/registry/nvidia.js";

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

const override = {
  ...baseNvidia,
  models: (baseNvidia.models || []).filter(
    (m) => m && m.id !== "minimaxai/minimax-m2.7",
  ),
};

export default isForkEnabled() ? override : baseNvidia;
