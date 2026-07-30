// DiepXuan fork-layer override for Qoder provider.
//
// Base `open-sse/providers/registry/qoder.js` is unchanged. This module
// applies DiepXuan-only adjustments:
//   1. Un-deprecate Qoder (remove deprecated flag and risk notice).
//   2. Add hasFree: true for free-tier eligibility.
//   3. Uncomment all tiered models (auto, ultimate, performance, etc.).
//   4. Add explicit frontier model entries with descriptive names.
//
// Rationale: Qoder is actively maintained as a free provider in
// DiepXuan's setup. Upstream marked it deprecated, but the API still
// works and provides useful free-tier LLM access.
//
// Wired via d7 in open-sse/providers/registry/index.js → appended after
// the base entry, the last entry with id="qoder" wins.

import baseQoder from "../../providers/registry/qoder.js";

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

const DIEPXUAN_MODELS = [
  // ── Tiered Models ──
  { id: "auto", name: "Qoder Auto" },
  { id: "ultimate", name: "Qoder Ultimate" },
  { id: "performance", name: "Qoder Performance" },
  { id: "efficient", name: "Qoder Efficient" },
  { id: "lite", name: "Qoder Lite" },

  // ── Frontier Models ──
  { id: "qmodel_latest", name: "Qwen 3.7 Max (Qoder)" },
  { id: "dmodel", name: "DeepSeek V4 Pro (Qoder)" },
  { id: "dfmodel", name: "DeepSeek V4 Flash (Qoder)" },
  { id: "gm51model", name: "GLM 5.1 (Qoder)" },
  { id: "kmodel", name: "Kimi K2.6 (Qoder)" },
  { id: "mmodel", name: "MiniMax M2.7 (Qoder)" },
];

const override = {
  ...baseQoder,
  hasFree: true,
  display: {
    ...baseQoder.display,
    deprecated: false,
    deprecationNotice: undefined,
    notice: {
      ...(baseQoder.display?.notice || {}),
      text: "Free tier: Lite model (0 credits) — autofalls back when credits exhausted. Slower during peak hours, no multimodal support.",
    },
  },
  models: [
    ...DIEPXUAN_MODELS,
  ],
};

export default isForkEnabled() ? override : baseQoder;
