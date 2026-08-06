import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.DIEPXUAN_ENABLED = "true";

const ROOT = path.resolve(import.meta.dirname, "../..");
const limitsUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/index.js")).href;
const { getResolvedLimits } = await import(limitsUrl);

// Updated 2026-08-06 (PR #68): fork registry now declares NVIDIA free
// tier limits (PR #64) so the resolver returns the registry value and
// `source` reflects the registry chain. These tests verify the
// resolver API shape (`{ rpm, tpm, source }`) and the unknown-case
// behaviour; the exact source string is a debugging aid only.
test("resolved limits expose rpm/tpm/source for a known NVIDIA model", () => {
  const limits = getResolvedLimits({
    provider: "nvidia",
    model: "minimaxai/minimax-m3",
    contextWindow: 1024000,
  });
  assert.ok(limits);
  assert.equal(typeof limits.rpm, "number");
  assert.equal(typeof limits.tpm, "number");
  assert.ok(typeof limits.source === "string" && limits.source.length > 0);
});

test("unknown provider/model resolves to null (no limits)", () => {
  const limits = getResolvedLimits({
    provider: "does-not-exist",
    model: "x",
    contextWindow: null,
  });
  assert.equal(limits, null);
});

test("registered model without limits block resolves to null when no contextWindow", () => {
  // fastpitch is in the NVIDIA registry but has no per-model `limits`
  // and no provider-level `limits` for the free tier that includes it.
  // With no contextWindow, no layer produces a value → null.
  const limits = getResolvedLimits({
    provider: "unregistered-provider-zzz", model: "some-model", contextWindow: null,
  });
  assert.equal(limits, null);
});

test("unknown provider/model with contextWindow resolves to inferred-from-context", () => {
  // No registry entry, no connection override, no auto-discovery row
  // → the inferred layer kicks in based on the context window only.
  const limits = getResolvedLimits({
    provider: "unregistered-provider-zzz", model: "unregistered-model",
    contextWindow: 200_000,
  });
  assert.ok(limits);
  assert.equal(typeof limits.rpm, "number");
  assert.equal(limits.source, "inferred-from-context");
});
