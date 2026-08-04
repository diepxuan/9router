import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.DIEPXUAN_ENABLED = "true";

const ROOT = path.resolve(import.meta.dirname, "../..");
const url = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/translator/paramSupportHooks.js")).href;
const { applyForkParamRules } = await import(url);

test("tokenrouter clamps medium to high", () => {
  const body = { reasoning_effort: "medium" };
  applyForkParamRules("tokenrouter", body);
  assert.equal(body.reasoning_effort, "high");
});

test("tokenrouter keeps allowed low/high/max", () => {
  for (const v of ["low", "high", "max"]) {
    const body = { reasoning_effort: v };
    applyForkParamRules("tokenrouter", body);
    assert.equal(body.reasoning_effort, v);
  }
});

test("nvidia strips text and injects max_tokens", () => {
  const body = { text: { verbosity: "low" } };
  applyForkParamRules("nvidia", body);
  assert.equal(body.text, undefined);
  assert.equal(body.max_tokens, 8192);
});

test("tokenrouter flattens assistant array content to string", () => {
  const body = {
    messages: [
      { role: "assistant", content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }] },
      { role: "assistant", content: [] },
    ],
  };
  applyForkParamRules("tokenrouter", body);
  assert.equal(body.messages[0].content, "hello world");
  assert.equal(body.messages[1].content, "");
});

test("tokenrouter leaves string assistant content unchanged", () => {
  const body = { messages: [{ role: "assistant", content: "plain" }] };
  applyForkParamRules("tokenrouter", body);
  assert.equal(body.messages[0].content, "plain");
});

test("openai strips Responses-only text param for Chat Completions", () => {
  const body = { text: { verbosity: "low" }, reasoning_effort: "medium" };
  applyForkParamRules("openai", body, "gpt-5.5");
  assert.equal(body.text, undefined);
  assert.equal(body.reasoning_effort, "medium");
});

test("openai forces reasoning_effort none for gpt-5.4/5.5/5.6 tool calls", () => {
  for (const model of ["gpt-5.4", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6", "gpt-5.6-sol"]) {
    const body = { tools: [{ type: "function" }], reasoning_effort: "medium" };
    applyForkParamRules("openai", body, model);
    assert.equal(body.reasoning_effort, "none", model);
  }
});

test("openai leaves reasoning_effort unchanged for compatible gpt-5.2 tool calls", () => {
  const body = { tools: [{ type: "function" }], reasoning_effort: "medium" };
  applyForkParamRules("openai", body, "gpt-5.2");
  assert.equal(body.reasoning_effort, "medium");
});

test("openai strips reasoning_effort from gpt-4 chat requests", () => {
  const body = { tools: [{ type: "function" }], reasoning_effort: "medium" };
  applyForkParamRules("openai", body, "gpt-4.1");
  assert.equal(body.reasoning_effort, undefined);
});
