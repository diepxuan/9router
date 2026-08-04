// DiepXuan fork-layer override for the Gemini provider.
//
// Base `open-sse/providers/registry/gemini.js` is unchanged. This module marks
// the models that are available on Google AI Studio's free tier and adds the
// newer free-tier model ids verified from Google AI pricing docs (2026-08-04).
//
// Wired via d13 in open-sse/providers/registry/index.js -> appended after the
// base entry, the last entry with id="gemini" wins.

import baseGemini from "../../providers/registry/gemini.js";

function isForkEnabled() {
  return process.env.DIEPXUAN_ENABLED !== "false";
}

const FREE_MODEL_IDS = new Set([
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemma-4-31b-it",
]);

// Models missing from the base registry but present in the Google AI free tier.
const ADDITIONAL_FREE_MODELS = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite" },
];

const mergedModels = (baseGemini.models || []).map((model) => ({
  ...model,
  isFree: FREE_MODEL_IDS.has(model.id) ? true : model.isFree,
}));

const seen = new Set(mergedModels.map((model) => model.id));
for (const model of ADDITIONAL_FREE_MODELS) {
  if (!seen.has(model.id)) {
    mergedModels.push({ ...model, isFree: true });
    seen.add(model.id);
  }
}

const freeTierText =
  "Free tier via AI Studio: Gemini 3.6 Flash, Gemini 3.5 Flash, " +
  "Gemini 3.5 Flash-Lite, Gemini 3.1 Flash-Lite, Gemini 3 Flash Preview, " +
  "Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.5 Flash-Lite, Gemma 4.";

const override = {
  ...baseGemini,
  display: {
    ...baseGemini.display,
    notice: {
      ...(baseGemini.display?.notice || {}),
      text: freeTierText,
    },
  },
  searchViaChat: {
    ...(baseGemini.searchViaChat || {}),
    freeTier: freeTierText,
  },
  models: mergedModels,
};

export default isForkEnabled() ? override : baseGemini;
