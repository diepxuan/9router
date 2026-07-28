/**
 * Unit tests for the limit resolution engine (fork-layer DiepXuan).
 * Run: `node tests/unit/limits-resolution.test.mjs`
 *
 * No external deps. Uses the real registry so we exercise the actual
 * resolution paths. Imports via absolute file paths to bypass the `@/`
 * alias (which only resolves under Next.js / bundler).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.DIEPXUAN_ENABLED = "true";

const ROOT = path.resolve(import.meta.dirname, "../..");
const limitsUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/index.js")).href;

const {
  getProviderLimits,
  getModelLimits,
  getConnectionLimitsFromObj,
  getResolvedLimits,
  mergeLimits,
  extractLimitsFromError,
  inferLimitsFromContext,
} = await import(limitsUrl);

// ── Provider / model registry reads ───────────────────────────────────
test("getProviderLimits returns null for providers without limits block", () => {
  assert.equal(getProviderLimits("nvidia"), null);
  assert.equal(getProviderLimits("does-not-exist"), null);
});

test("getModelLimits returns null for models without limits field", () => {
  assert.equal(getModelLimits("nvidia", "z-ai/glm-5.2"), null);
  assert.equal(getModelLimits("nvidia", "does-not-exist"), null);
});

// ── Connection limits parsing ─────────────────────────────────────────
test("getConnectionLimitsFromObj parses JSON-stringified data", () => {
  const conn = { data: JSON.stringify({ apiKey: "sk-x", limits: { rpm: 50, tpm: 2_000_000, source: "user" } }) };
  assert.deepEqual(getConnectionLimitsFromObj(conn), { rpm: 50, tpm: 2_000_000, source: "user" });
});

test("getConnectionLimitsFromObj accepts already-parsed object", () => {
  const conn = { data: { limits: { rpm: 10 } } };
  assert.deepEqual(getConnectionLimitsFromObj(conn), { rpm: 10 });
});

test("getConnectionLimitsFromObj returns null for bad/missing data", () => {
  assert.equal(getConnectionLimitsFromObj({ data: "not-json" }), null);
  assert.equal(getConnectionLimitsFromObj({ data: JSON.stringify({ apiKey: "x" }) }), null);
  assert.equal(getConnectionLimitsFromObj(null), null);
  assert.equal(getConnectionLimitsFromObj({}), null);
});

// ── mergeLimits precedence ────────────────────────────────────────────
test("mergeLimits takes first-defined field per key (highest priority wins)", () => {
  // First arg = highest priority ("high" connection override).
  // Subsequent args descend in priority.
  const m = mergeLimits(
    { rpm: 50, source: "high" },
    { rpm: 10, tpm: 100, source: "mid" },
    { rpm: 5, source: "low" },
  );
  assert.equal(m.rpm, 50, "high priority rpm wins");
  assert.equal(m.tpm, 100, "mid priority tpm fills the gap");
  assert.equal(m.source, "high <- mid <- low");
});

test("mergeLimits carries policy and maxWaitMs", () => {
  const m = mergeLimits(
    { rpm: 30, maxWaitMs: 30000 },
    { policy: "wait-then-send" },
  );
  assert.equal(m.rpm, 30);
  assert.equal(m.policy, "wait-then-send");
  assert.equal(m.maxWaitMs, 30000);
});

test("mergeLimits returns null when all layers are empty", () => {
  assert.equal(mergeLimits(null, {}, undefined), null);
});

// ── extractLimitsFromError: header variants ───────────────────────────
test("extractLimitsFromError reads OpenAI x-ratelimit-* headers", () => {
  const r = extractLimitsFromError({
    status: 429,
    headers: { "x-ratelimit-limit-requests": "40", "x-ratelimit-limit-tokens": "1,000,000" },
  });
  assert.equal(r.rpm, 40);
  assert.equal(r.tpm, 1_000_000);
  assert.match(r.evidence, /x-ratelimit-limit-requests: 40/);
  assert.match(r.evidence, /x-ratelimit-limit-tokens: 1,000,000/);
});

test("extractLimitsFromError reads Anthropic anthropic-ratelimit-* headers", () => {
  const r = extractLimitsFromError({
    status: 429,
    headers: { "anthropic-ratelimit-requests-limit": "50", "anthropic-ratelimit-tokens-limit": "100000" },
  });
  assert.equal(r.rpm, 50);
  assert.equal(r.tpm, 100000);
});

test("extractLimitsFromError is case-insensitive on headers", () => {
  const r = extractLimitsFromError({ status: 429, headers: { "X-RateLimit-Limit-Requests": "10" } });
  assert.equal(r.rpm, 10);
});

// ── extractLimitsFromError: body regex ─────────────────────────────────
test("extractLimitsFromError parses NVIDIA-style 'Requests limit = N / unit'", () => {
  const r = extractLimitsFromError({
    status: 429,
    body: { error: { message: "Requests limit = 40 / minute exceeded" } },
  });
  assert.equal(r.rpm, 40);
});

test("extractLimitsFromError parses 'Tokens limit = N / unit'", () => {
  const r = extractLimitsFromError({
    status: 429,
    body: "Tokens limit = 1,000,000 / minute exceeded",
  });
  assert.equal(r.tpm, 1_000_000);
});

test("extractLimitsFromError parses 'N requests per hour|day'", () => {
  const rpd = extractLimitsFromError({ status: 429, body: "100 requests per day exceeded" });
  assert.equal(rpd.rpd, 100);
  const rph = extractLimitsFromError({ status: 429, body: "60 requests per hour" });
  assert.equal(rph.rph, 60);
});

test("extractLimitsFromError parses JSON usage_per_unit fields", () => {
  const r = extractLimitsFromError({
    status: 429,
    body: '{"usage": {"requests_per_minute": 30, "tokens_per_hour": 200000}}',
  });
  assert.equal(r.rpm, 30);
  assert.equal(r.tph, 200000);
});

// ── extractLimitsFromError: status guard ───────────────────────────────
test("extractLimitsFromError only fires on 429/403", () => {
  assert.equal(extractLimitsFromError({ status: 200, headers: { "x-ratelimit-limit-requests": "10" } }), null);
  assert.equal(extractLimitsFromError({ status: 500 }), null);
  assert.equal(extractLimitsFromError({ status: 429, headers: {}, body: "" }), null);
});

// ── inferLimitsFromContext ─────────────────────────────────────────────
test("inferLimitsFromContext uses context window tiers (paid tier)", () => {
  assert.deepEqual(
    inferLimitsFromContext({ contextWindow: 1_000_000, isFreeTier: false }),
    { rpm: 30, tpm: 1_000_000, source: "inferred-from-context" }
  );
  assert.deepEqual(
    inferLimitsFromContext({ contextWindow: 250_000, isFreeTier: false }),
    { rpm: 40, tpm: 500_000, source: "inferred-from-context" }
  );
  assert.deepEqual(
    inferLimitsFromContext({ contextWindow: 50_000, isFreeTier: false }),
    { rpm: 80, tpm: 100_000, source: "inferred-from-context" }
  );
});

test("inferLimitsFromContext halves rpm for free tier", () => {
  const paid = inferLimitsFromContext({ contextWindow: 1_000_000, isFreeTier: false });
  const free = inferLimitsFromContext({ contextWindow: 1_000_000, isFreeTier: true });
  assert.equal(paid.rpm, 30);
  assert.equal(free.rpm, 15);
  assert.ok(free.rpm >= 5, "free tier rpm floor is 5");
});

test("inferLimitsFromContext returns null on invalid input", () => {
  assert.equal(inferLimitsFromContext({ contextWindow: 0 }), null);
  assert.equal(inferLimitsFromContext({ contextWindow: -1 }), null);
  assert.equal(inferLimitsFromContext({}), null);
});

// ── getResolvedLimits: full chain ──────────────────────────────────────
test("getResolvedLimits returns null when no layer provides limits", () => {
  assert.equal(
    getResolvedLimits({ provider: "nvidia", model: "z-ai/glm-5.2", connectionId: null }),
    null
  );
});

test("getResolvedLimits falls back to inference when no registry declared", () => {
  const r = getResolvedLimits({
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    connectionId: null,
    contextWindow: 1_000_000,
    isFreeTier: true,
  });
  assert.equal(r.rpm, 15);
  assert.equal(r.tpm, 1_000_000);
});

test("getResolvedLimits: connection override beats all other layers", () => {
  const conn = { data: JSON.stringify({ limits: { rpm: 99, source: "user-config" } }) };
  const r = getResolvedLimits({
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    connectionId: null,
    connection: conn,
    contextWindow: 1_000_000,
    isFreeTier: true,
  });
  // Connection rpm (99) wins over inferred (15)
  assert.equal(r.rpm, 99);
  // Connection source + inferred source both recorded
  assert.match(r.source, /user-config/);
});
