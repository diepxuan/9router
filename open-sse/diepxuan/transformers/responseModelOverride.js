// Created: 2026-07-26 by 9Router Agent (fork-layer)
// Purpose:
//   Override the `model` field in upstream responses with the combo name the
//   client originally requested, so Codex CLI does not leak internal
//   provider/model names via its `modelname[>` delimiter.
//
// Root cause (logged 2026-07-26 in `requestDetails`):
//   1. Client calls combo (e.g. model="gpt-5.5") that resolves to
//      "minimax-cn/MiniMax-M3".
//   2. `body.model` is overwritten to `${provider}/${model}` before dispatch.
//   3. Upstream provider echoes its own model name in the response.
//   4. Translator forwards that name verbatim to the client.
//   5. Codex CLI uses the response model name to render the stream delimiter
//      `modelname[>` — leaking the internal provider/model name.
//
// Fix strategy (fork-layer hook — no base-file signature changes):
//   - `captureOriginalRequestedModel(...)` extracts the combo name from
//     `clientRawRequest.body.model` or `body.model` BEFORE any override.
//   - `applyResponseModelOverride(responseObj, originalModel)` patches a
//     non-streaming JSON Response in place.
//   - `wrapResponseBodyWithModelOverride(response, originalModel)` wraps a
//     streaming Response.body (ReadableStream) with a TransformStream that
//     parses each SSE chunk, overrides the `model` field, and re-emits it.
//
// Scope:
//   Only runs when the request went through a combo (captured originalModel
//   differs from the resolved upstream model). For non-combo requests the
//   captured model equals the resolved one, so the override is a no-op and
//   we short-circuit.

import { isDiepXuanEnabled } from "../../../src/diepxuan/shared/config/flags.js";
import { dbg } from "../../utils/debugLog.js";
import { stripCodexModelMarkers } from "./stripCodexModelMarkers.js";

export function captureOriginalRequestedModel(clientRawRequest, body) {
  if (!isDiepXuanEnabled()) {
    dbg("RESP-MODEL-OVR", "skip: DIEPXUAN disabled");
    return null;
  }
  const captured = clientRawRequest?.body?.model || body?.model || null;
  dbg("RESP-MODEL-OVR", `capture originalModel=${captured}`);
  return captured;
}

export function applyResponseModelOverride(translatedResponse, originalModel) {
  if (!isDiepXuanEnabled()) return;
  if (!originalModel || !translatedResponse) return;
  if (translatedResponse.model === originalModel) return;
  if (translatedResponse.model !== undefined) {
    dbg("RESP-MODEL-OVR", `override non-streaming: ${translatedResponse.model} → ${originalModel}`);
    translatedResponse.model = originalModel;
  }
}

export async function wrapNonStreamingResponseWithModelOverride(response, originalModel) {
  if (!isDiepXuanEnabled()) return response;
  if (!originalModel) return response;
  if (!response) return response;

  try {
    const cloned = response.clone();
    const obj = await cloned.json();
    const before = obj?.model;
    applyResponseModelOverride(obj, originalModel);
    if (before && obj.model !== before) {
      dbg("RESP-MODEL-OVR", `non-streaming override applied: ${before} → ${obj.model}`);
    }
    return new Response(JSON.stringify(obj), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return response;
  }
}

export function wrapResponseBodyWithModelOverride(response, originalModel) {
  if (!isDiepXuanEnabled()) return response;
  if (!originalModel) return response;
  if (!response || !response.body) return response;

  dbg("RESP-MODEL-OVR", `wrap streaming response for originalModel=${originalModel}`);

  const originalBody = response.body;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let patchCount = 0;

  const transform = new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      const { result, patched } = overrideModelInSseText(text, originalModel);
      patchCount += patched;
      // Strip any Codex model delimiter markers that upstream generated.
      controller.enqueue(encoder.encode(stripCodexModelMarkers(result)));
    },
    flush() {
      if (patchCount > 0) {
        dbg("RESP-MODEL-OVR", `streaming override complete: ${patchCount} chunks patched`);
      }
    },
  });

  return new Response(originalBody.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function overrideModelInSseText(sseText, originalModel) {
  if (!sseText || sseText.indexOf("data:") === -1) return { result: sseText, patched: 0 };

  const lines = sseText.split("\n");
  let buffer = [];
  const out = [];
  let patched = 0;

  const flushEvent = () => {
    if (buffer.length === 0) return;
    const newBuf = [];
    for (const line of buffer) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload === "[DONE]" || payload === "") {
          newBuf.push(line);
          continue;
        }
        try {
          const obj = JSON.parse(payload);
          const changed = overrideModelInObject(obj, originalModel);
          if (changed) {
            patched++;
            dbg("RESP-MODEL-OVR", `SSE chunk patched: model=${originalModel}`);
            newBuf.push(`data: ${JSON.stringify(obj)}`);
          } else {
            newBuf.push(line);
          }
        } catch {
          newBuf.push(line);
        }
      } else {
        newBuf.push(line);
      }
    }
    out.push(newBuf.join("\n"));
    buffer = [];
  };

  for (const line of lines) {
    if (line === "") {
      flushEvent();
      out.push("");
    } else {
      buffer.push(line);
    }
  }
  flushEvent();

  return { result: out.join("\n"), patched };
}

function overrideModelInObject(obj, originalModel) {
  if (!obj || typeof obj !== "object") return false;
  let changed = false;

  if (typeof obj.model === "string" && obj.model !== originalModel) {
    dbg("RESP-MODEL-OVR", `obj.model: ${obj.model} → ${originalModel}`);
    obj.model = originalModel;
    changed = true;
  }
  if (obj.message && typeof obj.message.model === "string" && obj.message.model !== originalModel) {
    dbg("RESP-MODEL-OVR", `obj.message.model: ${obj.message.model} → ${originalModel}`);
    obj.message.model = originalModel;
    changed = true;
  }
  if (obj.response && typeof obj.response.model === "string" && obj.response.model !== originalModel) {
    dbg("RESP-MODEL-OVR", `obj.response.model: ${obj.response.model} → ${originalModel}`);
    obj.response.model = originalModel;
    changed = true;
  }
  return changed;
}
