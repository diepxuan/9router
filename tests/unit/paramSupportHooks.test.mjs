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
