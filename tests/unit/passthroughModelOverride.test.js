/**
 * Tests: passthrough response model override
 *
 * Scenario: combo "gpt-5.5" routes to nvidia/minimaxai/minimax-m3.
 * Both source (OpenAI) and target (NVIDIA, OpenAI-compatible) formats are the
 * same, so the stream goes through PASSTHROUGH mode (no translation).
 *
 * The passthrough handler in createSSEStream must override the `model` field
 * in every SSE chunk so the upstream model name ("minimaxai/minimax-m3" or
 * whatever NVIDIA returns) is replaced with the combo name ("gpt-5.5").
 *
 * Without this override, Codex CLI reads the response model field for its
 * `modelname[>` delimiter and leaks internal provider names.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// IMPORTANT: Use static import for the module under test so vitest applies
// its resolve.alias transform pipeline. Dynamic await import() inside it()
// blocks bypasses vitest's alias resolution for transitive dependencies.

// Mock external deps before the static import (vi.mock is hoisted by vitest)
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../open-sse/utils/debugLog.js", () => ({
  dbg: vi.fn(),
  isDebugEnabled: false,
}));

import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";

// ── helpers ──────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sseChunk(model, content = "hello") {
  return `data: ${JSON.stringify({
    model,
    choices: [{ index: 0, delta: { content } }],
  })}\n\n`;
}

function sseChunkWithReasoning(model, reasoning = "", content = "") {
  return `data: ${JSON.stringify({
    model,
    choices: [{ index: 0, delta: { content, reasoning_content: reasoning } }],
  })}\n\n`;
}

function sseFinishChunk(model, content = "") {
  return `data: ${JSON.stringify({
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: "stop" }],
  })}\n\n`;
}

function sseDone() {
  return "data: [DONE]\n\n";
}

/**
 * Feed SSE text to a passthrough TransformStream and collect the output.
 * Uses ReadableStream.pipeThrough() which is the production usage pattern
 * (the handler pipes provider Response.body through the transform stream).
 */
async function runPassthrough(transform, sseTexts) {
  const source = new ReadableStream({
    start(controller) {
      for (const text of sseTexts) {
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  const dest = source.pipeThrough(transform);
  const reader = dest.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return chunks.join("");
}

// ── env ──────────────────────────────────────────────────────────────────

const originalDiepXuanEnabled = process.env.DIEPXUAN_ENABLED;

function restoreEnv() {
  if (originalDiepXuanEnabled === undefined) delete process.env.DIEPXUAN_ENABLED;
  else process.env.DIEPXUAN_ENABLED = originalDiepXuanEnabled;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DIEPXUAN_ENABLED;
});

afterEach(() => {
  vi.clearAllMocks();
  restoreEnv();
});

// ── tests ────────────────────────────────────────────────────────────────

describe("createPassthroughStreamWithLogger — model override", () => {
  it("overrides model field in SSE chunks when responseModel is set", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia",  null,
      "minimaxai/minimax-m3", "test-1",
      { messages: [{ role: "user", content: "hello" }] },
      null, null, "gpt-5.5"
    );

    const text = await runPassthrough(transform, [
      sseChunk("minimaxai/minimax-m3", "thinking..."),
      sseChunk("minimaxai/minimax-m3", "hello world"),
      sseDone(),
    ]);

    // Every SSE chunk's model field should be overridden
    const matches = [...text.matchAll(/"model":"gpt-5\.5"/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);

    // Upstream model name must NOT appear anywhere
    expect(text).not.toContain("minimaxai/minimax-m3");

    // Content is preserved
    expect(text).toContain("thinking...");
    expect(text).toContain("hello world");

    // [DONE] sentinel preserved
    expect(text).toContain("[DONE]");
  });

  it("overrides model even in thinking/reasoning chunks", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-2",
      { messages: [{ role: "user", content: "think" }] },
      null, null, "gpt-5.5"
    );

    const text = await runPassthrough(transform, [
      sseChunkWithReasoning("minimaxai/minimax-m3", "Let me analyze..."),
      sseChunkWithReasoning("minimaxai/minimax-m3", "", "The answer is 42"),
      sseDone(),
    ]);

    // Reasoning content preserved
    expect(text).toContain("Let me analyze...");
    expect(text).toContain("The answer is 42");

    // Model overridden
    const matches = [...text.matchAll(/"model":"gpt-5\.5"/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(text).not.toContain("minimaxai/minimax-m3");
  });

  it("overrides model in finish chunk with usage injection", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-3",
      { messages: [{ role: "user", content: "finish" }] },
      null, null, "gpt-5.5"
    );

    const text = await runPassthrough(transform, [
      sseChunk("minimaxai/minimax-m3", "building"),
      sseFinishChunk("minimaxai/minimax-m3", "done"),
      sseDone(),
    ]);

    // Finish chunk's model should also be overridden
    expect(text).not.toContain("minimaxai/minimax-m3");
    const matches = [...text.matchAll(/"model":"gpt-5\.5"/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("[DONE]");
  });

  it("does NOT override model when responseModel is null (non-combo path)", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-4",
      { messages: [{ role: "user", content: "hi" }] },
      null, null, null  // responseModel = null
    );

    const text = await runPassthrough(transform, [
      sseChunk("minimaxai/minimax-m3", "raw data"),
      sseDone(),
    ]);

    // When responseModel is null, upstream model passes through unchanged
    expect(text).toContain("minimaxai/minimax-m3");
    expect(text).toContain("raw data");
  });

  it("handles multiple SSE events in a single raw chunk", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "nvidia/llama-3.1-8b", "test-5",
      { messages: [{ role: "user", content: "bulk" }] },
      null, null, "claude-opus-4-6"
    );

    const bulk =
      sseChunk("nvidia/llama-3.1-8b", "a") +
      sseChunk("nvidia/llama-3.1-8b", "b") +
      sseDone();

    const text = await runPassthrough(transform, [bulk]);

    const matches = [...text.matchAll(/"model":"claude-opus-4-6"/g)];
    expect(matches.length).toBe(2);
    expect(text).not.toContain("nvidia/llama-3.1-8b");
  });

  it("handles chunk-boundary split: second event starts in next write", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-6",
      { messages: [{ role: "user", content: "split" }] },
      null, null, "gpt-5.5"
    );

    // SSE event split across two chunks (simulating real TCP chunking)
    const firstHalf = `data: ${JSON.stringify({
      model: "minimaxai/minimax-m3",
      choices: [{ index: 0, delta: { content: "first" } }],
    })}\n`;
    const secondHalf = `\n`; // blank line completes the event

    const text = await runPassthrough(transform, [firstHalf, secondHalf, sseDone()]);

    // Model overridden
    expect(text).toContain('"model":"gpt-5.5"');
    expect(text).not.toContain("minimaxai/minimax-m3");
    expect(text).toContain("first");
    expect(text).toContain("[DONE]");
  });

  it("preserves non-data SSE lines (event:, id:, etc.)", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-7",
      { messages: [{ role: "user", content: "event" }] },
      null, null, "gpt-5.5"
    );

    const text = await runPassthrough(transform, [
      "event: message_start\n" + sseChunk("minimaxai/minimax-m3", "payload"),
      sseDone(),
    ]);

    // Event line preserved
    expect(text).toContain("event: message_start");
    // Data line model overridden
    expect(text).toContain('"model":"gpt-5.5"');
    expect(text).not.toContain("minimaxai/minimax-m3");
  });

  it("skips non-JSON data lines gracefully", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-8",
      { messages: [{ role: "user", content: "error" }] },
      null, null, "gpt-5.5"
    );

    const text = await runPassthrough(transform, [
      "data: {not valid json}\n\n",
      sseChunk("minimaxai/minimax-m3", "valid"),
      sseDone(),
    ]);

    // Malformed line skipped entirely (not forwarded to client)
    expect(text).not.toContain("not valid json");
    // Valid chunk model overridden
    expect(text).toContain('"model":"gpt-5.5"');
    expect(text).not.toContain("minimaxai/minimax-m3");
  });

  it("forwards incomplete buffer data through flush handler (model not overridden here)", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-9",
      { messages: [{ role: "user", content: "flush" }] },
      null, null, "gpt-5.5"
    );

    // Write a chunk that ends without newline — forces buffer to flush path
    const incomplete = `data: ${JSON.stringify({
      model: "minimaxai/minimax-m3",
      choices: [{ index: 0, delta: { content: "trailing" }, finish_reason: "stop" }],
    })}`;

    const text = await runPassthrough(transform, [incomplete]);

    // Flush handler forwards buffer as-is without model override.
    // The outer wrap (wrapResponseBodyWithModelOverride) is the safety
    // net for incomplete chunks that reach the flush path.
    expect(text).toContain("trailing");
    expect(text).toContain("minimaxai/minimax-m3");
  });

  it("does not duplicate usage on simple content chunks", async () => {
    const transform = createPassthroughStreamWithLogger(
      "nvidia", null, "minimaxai/minimax-m3", "test-10",
      { messages: [{ role: "user", content: "usage" }] },
      null, null, "gpt-5.5"
    );

    const text = await runPassthrough(transform, [
      sseChunk("minimaxai/minimax-m3", "a"),
      sseChunk("minimaxai/minimax-m3", "b"),
      sseDone(),
    ]);

    // Each chunk should appear exactly once
    const aCount = (text.match(/content":"a"/g) || []).length;
    const bCount = (text.match(/content":"b"/g) || []).length;
    expect(aCount).toBe(1);
    expect(bCount).toBe(1);
  });
});
