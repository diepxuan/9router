/**
 * Unit tests for the auto-discovery write path (PR #60 of ADR-007).
 * Run: `node tests/unit/limits-auto-discovery.test.mjs` (uses node --test).
 *
 * Tests use a dedicated SQLite file under /tmp so the production DB is not
 * touched. Verifies:
 *   - recordAutoDiscoveredLimits UPSERTs new entries
 *   - duplicate inserts bump hitCount
 *   - conflicting values keep first observation (no overwrite)
 *   - the hook extracts limits from a 429 response and writes them
 */

import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

process.env.DIEPXUAN_ENABLED = "true";
const TEST_DB = path.join(os.tmpdir(), "limits_auto_discovery_test.sqlite");
process.env.NINE_ROUTER_DB_PATH = TEST_DB;
try { fs.unlinkSync(TEST_DB); } catch (_) { /* ignore */ }

const ROOT = path.resolve(import.meta.dirname, "../..");
const autoDiscUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/autoDiscovery.js")).href;
const hookUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/autoDiscoverHook.js")).href;
const errorParserUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/errorParser.js")).href;

const {
  getAutoDiscoveredLimits,
  recordAutoDiscoveredLimits,
  initAutoDiscoveredLimitsTable,
} = await import(autoDiscUrl);
const { maybeRecordLimitsFromUpstreamError } = await import(hookUrl);
const { extractLimitsFromError } = await import(errorParserUrl);

// Initialise table once
initAutoDiscoveredLimitsTable();

test("recordAutoDiscoveredLimits inserts a fresh row", () => {
  const wrote = recordAutoDiscoveredLimits({
    connectionId: "conn-1",
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    limits: { rpm: 40, tpm: 1_000_000 },
    evidence: "Requests limit = 40 / minute",
  });
  assert.equal(wrote, true);
  const got = getAutoDiscoveredLimits("conn-1", "nvidia", "z-ai/glm-5.2");
  assert.equal(got.rpm, 40);
  assert.equal(got.tpm, 1_000_000);
  assert.equal(got.hitCount, 1);
  assert.equal(got.source, "auto-429-detection");
  assert.match(got.evidence, /Requests limit/);
});

test("duplicate insert with same values bumps hitCount", () => {
  recordAutoDiscoveredLimits({
    connectionId: "conn-2",
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    limits: { rpm: 30 },
    evidence: "ev 1",
  });
  recordAutoDiscoveredLimits({
    connectionId: "conn-2",
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    limits: { rpm: 30 },
    evidence: "ev 2",
  });
  const got = getAutoDiscoveredLimits("conn-2", "nvidia", "z-ai/glm-5.2");
  assert.equal(got.rpm, 30);
  assert.equal(got.hitCount, 2);
  assert.match(got.evidence, /ev 2/);
});

test("conflicting values keep first observation (no overwrite)", () => {
  recordAutoDiscoveredLimits({
    connectionId: "conn-3",
    provider: "openai",
    model: "gpt-4o",
    limits: { rpm: 60 },
    evidence: "first obs",
  });
  // Second observation with different rpm — should NOT overwrite
  const wrote = recordAutoDiscoveredLimits({
    connectionId: "conn-3",
    provider: "openai",
    model: "gpt-4o",
    limits: { rpm: 500 },
    evidence: "second obs",
  });
  assert.equal(wrote, false);
  const got = getAutoDiscoveredLimits("conn-3", "openai", "gpt-4o");
  assert.equal(got.rpm, 60, "first observation wins");
  assert.equal(got.hitCount, 2, "hitCount still bumped for diagnostics");
});

test("no-op when limits is empty", () => {
  const wrote = recordAutoDiscoveredLimits({
    connectionId: "conn-4",
    provider: "x",
    model: "y",
    limits: {},
    evidence: "",
  });
  assert.equal(wrote, false);
  assert.equal(getAutoDiscoveredLimits("conn-4", "x", "y"), null);
});

test("extractLimitsFromError + autoDiscoverHook end-to-end (NVIDIA body)", () => {
  const wrote = maybeRecordLimitsFromUpstreamError({
    status: 429,
    response: null,
    body: "Requests limit = 50 / minute exceeded",
    connectionId: "conn-5",
    provider: "minimax",
    model: "MiniMax-M3",
  });
  assert.equal(wrote, true);
  const got = getAutoDiscoveredLimits("conn-5", "minimax", "MiniMax-M3");
  assert.equal(got.rpm, 50);
});

test("autoDiscoverHook extracts from response.headers (OpenAI shape)", () => {
  const fakeHeaders = {
    entries() { return Object.entries(this); },
    "x-ratelimit-limit-requests": "80",
    "x-ratelimit-limit-tokens": "200000",
  };
  const wrote = maybeRecordLimitsFromUpstreamError({
    status: 429,
    response: { headers: fakeHeaders },
    body: null,
    connectionId: "conn-6",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
  });
  assert.equal(wrote, true);
  const got = getAutoDiscoveredLimits("conn-6", "anthropic", "claude-sonnet-4-5");
  assert.equal(got.rpm, 80);
  assert.equal(got.tpm, 200000);
});

test("autoDiscoverHook returns false on 200 OK (no recording)", () => {
  const wrote = maybeRecordLimitsFromUpstreamError({
    status: 200,
    response: null,
    body: "ok",
    connectionId: "conn-7",
    provider: "nvidia",
    model: "z-ai/glm-5.2",
  });
  assert.equal(wrote, false);
  assert.equal(getAutoDiscoveredLimits("conn-7", "nvidia", "z-ai/glm-5.2"), null);
});

test("autoDiscoverHook no-op without connectionId", () => {
  const wrote = maybeRecordLimitsFromUpstreamError({
    status: 429,
    response: null,
    body: "Requests limit = 10 / minute",
    connectionId: null,
    provider: "nvidia",
    model: "z-ai/glm-5.2",
  });
  assert.equal(wrote, false);
});

test("extractLimitsFromError (sanity, re-exported)", () => {
  const r = extractLimitsFromError({ status: 429, body: "60 requests per hour" });
  assert.equal(r.rph, 60);
});
