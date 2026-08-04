// DiepXuan fork-layer override for OpenAI provider.
//
// Base `open-sse/providers/registry/openai.js` is unchanged. This module
// refreshes the model list against the live upstream catalog
// (https://api.openai.com/v1/models, verified 2026-08-04) and drops models
// that are not usable via the Chat Completions endpoint this provider wires
// to (transport.baseUrl = /v1/chat/completions).
//
// Classification (verified by live probes on 2026-08-04):
//   - REMOVED (Responses-only, 404 "not a chat model"):
//     gpt-5-pro, gpt-5.2-pro, gpt-5.4-pro, gpt-5.5-pro, o1-pro
//   - REMOVED (Responses-only, 404 "not supported in v1/chat/completions"):
//     gpt-5.1-codex, gpt-5.2-codex, gpt-5.3-codex
//   - REMOVED (deprecated upstream, 404):
//     gpt-5-chat-latest
//   - ADDED (new chat models): gpt-5.6, gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra
//   - Tools + reasoning_effort quirk: gpt-5.4*, gpt-5.5, gpt-5.6-* reject
//     requests that carry BOTH `tools` and `reasoning_effort` (!="none")
//     with HTTP 400. Handled in paramSupportHooks.js (strip effort when tools
//     present for these models), NOT here — the models themselves work fine.
//
// Wired via d10 in open-sse/providers/registry/index.js — appended after the
// base entry, the last entry with id="openai" wins.

import baseOpenai from "../../providers/registry/openai.js";
import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";

// Non-chat / deprecated upstream as of 2026-08-04 — remove from chat registry.
const REMOVED_MODEL_IDS = new Set([
  "gpt-5-pro",
  "gpt-5.2-pro",
  "gpt-5.4-pro",
  "gpt-5.5-pro",
  "o1-pro",
  "gpt-5.1-codex",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5-chat-latest",
]);

// New chat models verified live on 2026-08-04 (in upstream /v1/models but
// missing from base registry).
const ADDITIONAL_MODELS = [
  { id: "gpt-5.5", name: "GPT-5.5" },       // in upstream; ensure present
  { id: "gpt-5.6", name: "GPT-5.6" },           // official alias -> gpt-5.6-sol
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
];

const filteredBase = (baseOpenai.models || []).filter(
  (m) => m && !REMOVED_MODEL_IDS.has(m.id),
);

// Deduplicate by id (fork additions win over nothing — base lacks them).
const seen = new Set(filteredBase.map((m) => m.id));
const merged = [...filteredBase];
for (const m of ADDITIONAL_MODELS) {
  if (!seen.has(m.id)) {
    merged.push(m);
    seen.add(m.id);
  }
}

const override = {
  ...baseOpenai,
  models: merged,
};

export default isDiepXuanEnabled() ? override : baseOpenai;
