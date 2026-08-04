// DiepXuan fork-layer override for Kilo Code.
//
// Base `open-sse/providers/registry/kilocode.js` is unchanged. This module
// keeps the existing Kilo OAuth/auth flow but surfaces the provider as a
// free-tier capable source and seeds current free hosted models.
//
// Free model catalog verified from https://api.kilo.ai/api/gateway/models
// on 2026-08-05 (12 models). The live `modelsFetcher` still refreshes the full catalog;
// these seeds matter when the fetcher is unavailable or a login has not yet
// loaded the account-specific model list.
//
// Wired via d12 in open-sse/providers/registry/index.js, appended after the
// base entry so the last entry with id="kilocode" wins.

import baseKilocode from "../../providers/registry/kilocode.js";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

// Price-catalog free hosted models from Kilo Gateway / OpenRouter.
const FREE_HOSTED_MODELS = [
  { id: "kilo-auto/free", name: "Auto Free" },
  { id: "openrouter/free", name: "OpenRouter Free Router" },
  { id: "cohere/north-mini-code:free", name: "North Mini Code (Free)" },
  { id: "inclusionai/ling-3.0-flash:free", name: "Ling 3.0 Flash (Free)" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron 3 Nano Omni (Free)" },
  { id: "nvidia/nemotron-3.5-content-safety:free", name: "Nemotron 3.5 Content Safety (Free)" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super (Free)" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra (Free)" },
  { id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 (Free)" },
  { id: "poolside/laguna-xs-2.1:free", name: "Laguna XS 2.1 (Free)" },
  { id: "stepfun/step-3.7-flash:free", name: "Step 3.7 Flash (Free)" },
  { id: "tencent/hy3:free", name: "Hy3 (Free)" },
];

const seen = new Set((baseKilocode.models || []).map((model) => model.id));
const mergedModels = [...(baseKilocode.models || [])];
for (const model of FREE_HOSTED_MODELS) {
  if (!seen.has(model.id)) {
    mergedModels.push(model);
    seen.add(model.id);
  }
}

const override = {
  ...baseKilocode,
  hasFree: true,
  models: mergedModels,
  display: {
    ...baseKilocode.display,
    notice: {
      ...baseKilocode.display?.notice,
      text: "OAuth Kilo Cloud. Free hosted models via Kilo Gateway/OpenRouter; may route to NVIDIA free endpoints so keep sensitive prompts out.",
    },
  },
};

export default isDiepXuanEnabled() ? override : baseKilocode;
