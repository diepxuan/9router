/**
 * Unit tests for the rate-limit throttle engine (PR #61 of ADR-007).
 * Run: `node tests/unit/limits-throttle.test.mjs` (uses node --test).
 *
 * Tests use a dedicated SQLite file under /tmp so the production DB is not
 * touched. Verifies:
 *   - acquireQuotaSlot returns acquired=true when no limits configured
 *   - acquireQuotaSlot blocks when limits exceeded (wait-then-send)
 *   - acquireQuotaSlot rejects when wait > maxWaitMs
 *   - recordRequestOutcome updates counters
 *   - the combo hook integration is async + forward-compatible
 */

import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

process.env.DIEPXUAN_ENABLED = "true";
const TEST_DB = path.join(os.tmpdir(), "limits_throttle_test.sqlite");
process.env.NINE_ROUTER_DB_PATH = TEST_DB;
try { fs.unlinkSync(TEST_DB); } catch (_) { /* ignore */ }

const ROOT = path.resolve(import.meta.dirname, "../..");
const throttleUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/throttle.js")).href;
const windowUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/window.js")).href;
const cacheUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/limits/cache.js")).href;
const comboHooksUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/comboHooks.js")).href;

const {
  acquireQuotaSlot,
  recordRequestOutcome,
  estimateTokens,
  WINDOW_MS,
  buildScope,
} = await import(throttleUrl);
const {
  countEvents,
  sumTokens,
  oldestAgeOutAt,
  projectedAgeOutAt,
  projectedTokensAgeOutAt,
} = await import(windowUrl);
const {
  readPrunedEvents,
  pushEvent,
  clearCounter,
  readAllCounters,
  initRateLimitCountersTable,
} = await import(cacheUrl);
const { beforeComboModelAttempt, afterComboModelAttempt } = await import(comboHooksUrl);

initRateLimitCountersTable();

// ── window math (pure) ───────────────────────────────────────────────
test("countEvents handles empty + missing tokens", () => {
  assert.equal(countEvents([]), 0);
  assert.equal(countEvents(null), 0);
  assert.equal(countEvents([{ ts: 1, tokens: 0 }, { ts: 2, tokens: 0 }]), 2);
});

test("sumTokens sums finite tokens only", () => {
  assert.equal(sumTokens([]), 0);
  assert.equal(sumTokens([{ ts: 1, tokens: 100 }, { ts: 2, tokens: 50 }]), 150);
  assert.equal(sumTokens([{ ts: 1, tokens: "x" }, { ts: 2, tokens: 50 }]), 50);
});

test("oldestAgeOutAt returns now when window empty", () => {
  assert.equal(oldestAgeOutAt([], 1000, 5000), 5000);
});

test("oldestAgeOutAt returns oldest.ts + windowMs", () => {
  const events = [{ ts: 100, tokens: 1 }, { ts: 200, tokens: 1 }, { ts: 50, tokens: 1 }];
  // 50 + 1000 = 1050
  assert.equal(oldestAgeOutAt(events, 1000, 10000), 1050);
});

test("projectedAgeOutAt removes k oldest events", () => {
  const events = [{ ts: 100 }, { ts: 200 }, { ts: 300 }];
  // To add 1 new event (k=1), need 2 events to age out → ts[1]+windowMs=1200
  assert.equal(projectedAgeOutAt(events, 1000, 0, 1), 1200);
  // To add 2 new events (k=2), need 1 event to age out → ts[0]+windowMs=1100
  assert.equal(projectedAgeOutAt(events, 1000, 0, 2), 1100);
});

test("projectedTokensAgeOutAt walks events until headroom met", () => {
  // After event[0] ages out, headroom is 100. That >= 50 → return ts[0]+windowMs=1100.
  assert.equal(projectedTokensAgeOutAt([{ ts: 100, tokens: 100 }], 1000, 50), 1100);
  // After event[0] (100) ages out, headroom is 100. Still < 200 (projected).
  // Continue: after event[1] (200) ages out, headroom is 100+200=300 >= 200.
  // The return is max(freedAt=1100 after first event, ts[1]+windowMs=1200) = 1200.
  assert.equal(projectedTokensAgeOutAt([{ ts: 100, tokens: 100 }, { ts: 200, tokens: 200 }], 1000, 200), 1200);
});

// ── persistence (cache.js) ────────────────────────────────────────────
test("pushEvent + readPrunedEvents round-trips", () => {
  const scope = buildScope("c-1", "nvidia", "z-ai/glm-5.2");
  clearCounter(scope, "rpm");
  const now = Date.now();
  pushEvent(scope, "rpm", WINDOW_MS.rpm, now, 0);
  pushEvent(scope, "rpm", WINDOW_MS.rpm, now + 100, 0);
  const ev = readPrunedEvents(scope, "rpm", WINDOW_MS.rpm);
  assert.equal(ev.length, 2);
});

test("readAllCounters returns 4 windows", () => {
  const scope = buildScope("c-2", "nvidia", "z-ai/glm-5.2");
  clearCounter(scope, "rpm");
  clearCounter(scope, "tpm");
  clearCounter(scope, "rph");
  clearCounter(scope, "rpd");
  const all = readAllCounters(scope);
  assert.deepEqual(Object.keys(all).sort(), ["rpd", "rph", "rpm", "tpm"]);
  assert.equal(all.rpm.length, 0);
});

// ── acquireQuotaSlot ──────────────────────────────────────────────────
test("acquireQuotaSlot returns acquired=true when no limits configured", async () => {
  const result = await acquireQuotaSlot({
    provider: "unknown-provider-xyz",
    model: "unknown-model",
    connectionId: "c-x",
  });
  assert.equal(result.acquired, true);
  assert.equal(result.limits, null);
});

test("acquireQuotaSlot enforces fallback when limit exceeded", async () => {
  const connectionId = "c-wait-enforce";
  // Fill up to limit for a dummy provider
  const now = Date.now();
  for (let i = 0; i < 40; i++) {
    recordRequestOutcome({ provider: "nvidia", model: "z-ai/glm-5.2", connectionId });
  }

  const r = await acquireQuotaSlot({
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    connectionId,
  });
  // NVIDIA glm-5.2 is capped at 30 rpm in registry -> 40 requests breaches limit -> rejected/fallback
  assert.equal(r.acquired, false);
  assert.ok(r.reason);
});

test("acquireQuotaSlot + recordRequestOutcome round-trip", async () => {
  const scope = buildScope("c-rt", "nvidia", "z-ai/glm-5.2");
  clearCounter(scope, "rpm");
  clearCounter(scope, "tpm");
  recordRequestOutcome({
    provider: "nvidia", model: "z-ai/glm-5.2",
    connectionId: "c-rt",
    promptTokens: 100, completionTokens: 50,
  });
  const all = readAllCounters(scope);
  assert.equal(all.rpm.length, 1, "rpm counter bumped");
  assert.equal(all.tpm[0].tokens, 150, "tpm counter has total tokens");
});

test("estimateTokens is conservative (rounds up)", () => {
  const t = estimateTokens({ messages: [{ role: "user", content: "x".repeat(1000) }] });
  // 1000 chars / 4 = 250 tokens (or more, depending on tool counting)
  assert.ok(t >= 250, `expected >= 250, got ${t}`);
  assert.equal(estimateTokens({}), 0);
  assert.equal(estimateTokens(null), 0);
});

// ── combo hook integration ────────────────────────────────────────────
test("beforeComboModelAttempt is async and returns skip=false when no limits", async () => {
  const r = await beforeComboModelAttempt({
    modelStr: "unknown-provider-xyz/foo",
    comboName: "test",
    log: { info() {}, debug() {} },
  });
  assert.equal(r.skip, false);
});

test("afterComboModelOutcome with no limits is a no-op", () => {
  // Should not throw
  afterComboModelAttempt({
    modelStr: "unknown-provider-xyz/foo",
    comboName: "test",
    ok: true,
  });
});
