import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.DIEPXUAN_ENABLED = "true";

const ROOT = path.resolve(import.meta.dirname, "../..");
const limitsUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/index.js")).href;
const { getResolvedLimits } = await import(limitsUrl);

test("inferred limits expose rpm/tpm/source for a known NVIDIA model", () => {
  const limits = getResolvedLimits({
    provider: "nvidia",
    model: "minimaxai/minimax-m3",
    contextWindow: 1024000,
  });
  assert.ok(limits);
  assert.equal(typeof limits.rpm, "number");
  assert.equal(typeof limits.tpm, "number");
  assert.equal(limits.source, "inferred-from-context");
});

test("unknown provider/model resolves to null (no limits)", () => {
  const limits = getResolvedLimits({
    provider: "does-not-exist",
    model: "x",
    contextWindow: null,
  });
  assert.equal(limits, null);
});

test("known model without limits block resolves to null unless inferred", () => {
  const limits = getResolvedLimits({
    provider: "nvidia",
    model: "fastpitch",
    contextWindow: null,
  });
  assert.equal(limits, null);
});
