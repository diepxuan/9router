import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const modUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/transformers/stripCodexModelMarkers.js")).href;
const { stripCodexModelMarkers, stripCodexModelMarkersFromBody } = await import(modUrl);

// Build marker with char codes so shell/browser tooling cannot mangle the
// literal  sequence.
const MARKER = String.fromCharCode(93, 60, 93) + "minimax" + String.fromCharCode(91, 62, 91); // 
const TRAILING_BRACKET = String.fromCharCode(91); // [

test("strips a single Codex model delimiter marker", () => {
  assert.equal(stripCodexModelMarkers("x " + MARKER + " y"), "x  y");
});

test("strips marker followed by newline and trailing bracket", () => {
  assert.equal(stripCodexModelMarkers("x " + MARKER + "\n" + TRAILING_BRACKET + " y"), "x  y");
});

test("strips multiple markers", () => {
  assert.equal(stripCodexModelMarkers("a " + MARKER + " b " + MARKER + " c"), "a  b  c");
});

test("returns input unchanged when no marker", () => {
  const s = "plain text";
  assert.equal(stripCodexModelMarkers(s), s);
});

test("strips markers from body messages string and content array", () => {
  const body = {
    messages: [
      { role: "assistant", content: "a " + MARKER + " b" },
      { role: "user", content: [{ type: "text", text: "c " + MARKER + "\n" + TRAILING_BRACKET + " d" }] },
    ],
  };
  stripCodexModelMarkersFromBody(body);
  assert.equal(body.messages[0].content, "a  b");
  assert.equal(body.messages[1].content[0].text, "c  d");
});

test("returns body unchanged for non-object input", () => {
  assert.equal(stripCodexModelMarkersFromBody(null), null);
  assert.equal(stripCodexModelMarkersFromBody("x"), "x");
});
