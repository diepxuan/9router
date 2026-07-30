import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── helpers ──────────────────────────────────────────────────────────────
function sseChunk(model, content = "hello") {
  return `data: ${JSON.stringify({ model, choices: [{ delta: { content } }] })}\n\n`;
}

function sseDone() {
  return "data: [DONE]\n\n";
}

/** Read entire Response body as text */
async function readResponseText(response) {
  const reader = response.body.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }
  return chunks.join("");
}

// ── env control ──────────────────────────────────────────────────────────
const originalDiepXuanEnabled = process.env.DIEPXUAN_ENABLED;

function restoreEnv() {
  if (originalDiepXuanEnabled === undefined) delete process.env.DIEPXUAN_ENABLED;
  else process.env.DIEPXUAN_ENABLED = originalDiepXuanEnabled;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.DIEPXUAN_ENABLED;
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  restoreEnv();
});

// ── captureOriginalRequestedModel ────────────────────────────────────────
describe("captureOriginalRequestedModel", () => {
  it("captures model from clientRawRequest.body.model", async () => {
    const { captureOriginalRequestedModel } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    const req = { body: { model: "gpt-5.5" } };
    expect(captureOriginalRequestedModel(req, {})).toBe("gpt-5.5");
  });

  it("falls back to body.model when clientRawRequest.body is empty", async () => {
    const { captureOriginalRequestedModel } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    const body = { model: "claude-opus-4-6" };
    expect(captureOriginalRequestedModel({}, body)).toBe("claude-opus-4-6");
  });

  it("returns null when no model is present", async () => {
    const { captureOriginalRequestedModel } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    expect(captureOriginalRequestedModel({}, {})).toBeNull();
    expect(captureOriginalRequestedModel(null, null)).toBeNull();
  });

  it("returns null when DiepXuan is disabled", async () => {
    process.env.DIEPXUAN_ENABLED = "0";
    const { captureOriginalRequestedModel } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    expect(captureOriginalRequestedModel({ body: { model: "gpt-5.5" } }, {})).toBeNull();
  });
});

// ── applyResponseModelOverride ───────────────────────────────────────────
describe("applyResponseModelOverride", () => {
  it("overrides model when upstream model differs", async () => {
    const { applyResponseModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    const resp = { model: "minimax-cn/MiniMax-M3" };
    applyResponseModelOverride(resp, "gpt-5.5");
    expect(resp.model).toBe("gpt-5.5");
  });

  it("does nothing when model already matches", async () => {
    const { applyResponseModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    const resp = { model: "gpt-5.5" };
    applyResponseModelOverride(resp, "gpt-5.5");
    expect(resp.model).toBe("gpt-5.5");
  });

  it("does nothing when originalModel is null", async () => {
    const { applyResponseModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    const resp = { model: "minimax-cn/MiniMax-M3" };
    applyResponseModelOverride(resp, null);
    expect(resp.model).toBe("minimax-cn/MiniMax-M3");
  });

  it("does nothing when translatedResponse is null", async () => {
    const { applyResponseModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    expect(() => applyResponseModelOverride(null, "gpt-5.5")).not.toThrow();
  });

  it("does nothing when model is undefined", async () => {
    const { applyResponseModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    const resp = {};
    applyResponseModelOverride(resp, "gpt-5.5");
    expect(resp.model).toBeUndefined();
  });

  it("is a no-op when DiepXuan is disabled", async () => {
    process.env.DIEPXUAN_ENABLED = "0";
    const { applyResponseModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );
    const resp = { model: "minimax-cn/MiniMax-M3" };
    applyResponseModelOverride(resp, "gpt-5.5");
    expect(resp.model).toBe("minimax-cn/MiniMax-M3");
  });
});

// ── wrapResponseBodyWithModelOverride (streaming) ────────────────────────
describe("wrapResponseBodyWithModelOverride (streaming)", () => {
  it("overrides model in each SSE chunk", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse =
      sseChunk("minimax-cn/MiniMax-M3", "thinking...") +
      sseChunk("minimax-cn/MiniMax-M3", "hello world") +
      sseDone();

    const response = new Response(sse, {
      headers: { "content-type": "text/event-stream" },
    });

    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    expect(text).toContain('"model":"gpt-5.5"');
    expect(text).not.toContain("minimax-cn/MiniMax-M3");
    expect(text).toContain("thinking...");
    expect(text).toContain("hello world");
    expect(text).toContain("[DONE]");
  });

  it("preserves [DONE] sentinel unchanged", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse = sseChunk("minimax-cn/MiniMax-M3") + sseDone();
    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    const doneLines = text.split("\n").filter((l) => l.includes("[DONE]"));
    expect(doneLines.length).toBe(1);
  });

  it("preserves non-data SSE lines (e.g. event:, id:)", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse =
      "event: message_start\n" +
      `data: ${JSON.stringify({ type: "message_start", message: { model: "minimax-cn/MiniMax-M3", role: "assistant" } })}\n\n` +
      sseDone();

    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    expect(text).toContain("event: message_start");
    expect(text).toContain('"model":"gpt-5.5"');
    expect(text).not.toContain("minimax-cn/MiniMax-M3");
  });

  it("overrides obj.message.model (Claude format)", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const chunk = `data: ${JSON.stringify({
      type: "content_block_delta",
      message: { model: "minimax-cn/MiniMax-M3" },
    })}\n\n`;
    const sse = chunk + sseDone();

    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    expect(text).toContain('"model":"gpt-5.5"');
    expect(text).not.toContain("minimax-cn/MiniMax-M3");
  });

  it("returns original response when originalModel is null", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse = sseChunk("minimax-cn/MiniMax-M3");
    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, null);

    // Should be the same object reference (no-op)
    expect(wrapped).toBe(response);
  });

  it("returns original response when body is null", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const wrapped = wrapResponseBodyWithModelOverride(new Response(null), "gpt-5.5");
    expect(wrapped).toBeDefined();
  });

  it("returns original response when DiepXuan is disabled", async () => {
    process.env.DIEPXUAN_ENABLED = "0";
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse = sseChunk("minimax-cn/MiniMax-M3");
    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");

    expect(wrapped).toBe(response);
  });

  it("preserves response status and headers", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const response = new Response(sseChunk("minimax-cn/MiniMax-M3"), {
      status: 200,
      statusText: "OK",
      headers: { "x-custom": "value" },
    });

    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    expect(wrapped.status).toBe(200);
    expect(wrapped.statusText).toBe("OK");
    expect(wrapped.headers.get("x-custom")).toBe("value");
  });

  it("handles multiple SSE events in a single chunk", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    // Two events in one chunk (no blank line separator between them in raw text)
    const sse =
      sseChunk("minimax-cn/MiniMax-M3", "a") +
      sseChunk("minimax-cn/MiniMax-M3", "b") +
      sseDone();

    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    const modelMatches = text.match(/"model":"gpt-5.5"/g);
    expect(modelMatches?.length).toBe(2);
    expect(text).not.toContain("minimax-cn/MiniMax-M3");
  });

  it("handles malformed JSON data lines gracefully", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse =
      "data: {invalid json\n\n" +
      sseChunk("minimax-cn/MiniMax-M3", "ok") +
      sseDone();

    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    // Malformed line passes through untouched
    expect(text).toContain("{invalid json");
    // Valid line is patched
    expect(text).toContain('"model":"gpt-5.5"');
  });

  it("does not touch chunks that already have the correct model", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse = sseChunk("gpt-5.5", "already correct") + sseDone();
    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    expect(text).toContain("already correct");
    expect(text).toContain('"model":"gpt-5.5"');
  });

  it("skips data lines with empty payload", async () => {
    const { wrapResponseBodyWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const sse = "data: \n\n" + sseChunk("minimax-cn/MiniMax-M3") + sseDone();
    const response = new Response(sse);
    const wrapped = wrapResponseBodyWithModelOverride(response, "gpt-5.5");
    const text = await readResponseText(wrapped);

    expect(text).toContain("data: ");
    expect(text).toContain('"model":"gpt-5.5"');
  });
});

// ── wrapNonStreamingResponseWithModelOverride ────────────────────────────
describe("wrapNonStreamingResponseWithModelOverride", () => {
  it("overrides model in non-streaming JSON response", async () => {
    const { wrapNonStreamingResponseWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const body = { model: "minimax-cn/MiniMax-M3", choices: [{ message: { content: "hi" } }] };
    const response = new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });

    const wrapped = await wrapNonStreamingResponseWithModelOverride(response, "gpt-5.5");
    const json = await wrapped.json();

    expect(json.model).toBe("gpt-5.5");
  });

  it("returns original response when originalModel is null", async () => {
    const { wrapNonStreamingResponseWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const response = new Response(JSON.stringify({ model: "minimax-cn/MiniMax-M3" }));
    const wrapped = await wrapNonStreamingResponseWithModelOverride(response, null);

    expect(wrapped).toBe(response);
  });

  it("returns original response when DiepXuan is disabled", async () => {
    process.env.DIEPXUAN_ENABLED = "0";
    const { wrapNonStreamingResponseWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const response = new Response(JSON.stringify({ model: "minimax-cn/MiniMax-M3" }));
    const wrapped = await wrapNonStreamingResponseWithModelOverride(response, "gpt-5.5");

    expect(wrapped).toBe(response);
  });

  it("preserves response status and headers", async () => {
    const { wrapNonStreamingResponseWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const response = new Response(JSON.stringify({ model: "minimax-cn/MiniMax-M3" }), {
      status: 200,
      headers: { "x-request-id": "abc" },
    });

    const wrapped = await wrapNonStreamingResponseWithModelOverride(response, "gpt-5.5");
    expect(wrapped.status).toBe(200);
    expect(wrapped.headers.get("x-request-id")).toBe("abc");
  });

  it("returns original response on invalid JSON", async () => {
    const { wrapNonStreamingResponseWithModelOverride } = await import(
      "../../open-sse/diepxuan/transformers/responseModelOverride.js"
    );

    const response = new Response("not json");
    const wrapped = await wrapNonStreamingResponseWithModelOverride(response, "gpt-5.5");

    expect(wrapped).toBe(response);
  });
});
