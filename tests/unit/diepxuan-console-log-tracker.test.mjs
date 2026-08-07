/**
 * Unit tests for the console log live activity tracker (PR #72).
 * Run: `node --test tests/unit/diepxuan-console-log-tracker.test.mjs`
 */
import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const trackerUrl = pathToFileURL(
  path.join(ROOT, "src/diepxuan/lib/consoleLogLiveTracker.js"),
).href;

const {
  parseLineForLive,
  getLiveSnapshot,
  registerClient,
  unregisterClient,
  getActiveClientCount,
  _resetForTests,
} = await import(trackerUrl);

// ── Setup: reset state before each test ──────────────────────────────
test.beforeEach(() => _resetForTests());

// ── Client tracking ──────────────────────────────────────────────────
test("registerClient increments activeClients; unregisterClient decrements", () => {
  assert.equal(getActiveClientCount(), 0);
  const id1 = registerClient();
  assert.equal(getActiveClientCount(), 1);
  const id2 = registerClient();
  assert.equal(getActiveClientCount(), 2);
  assert.notEqual(id1, id2, "IDs must be unique");
  unregisterClient(id1);
  assert.equal(getActiveClientCount(), 1);
  unregisterClient(id2);
  assert.equal(getActiveClientCount(), 0);
  // Unknown id is a no-op
  unregisterClient("does-not-exist");
  assert.equal(getActiveClientCount(), 0);
});

test("getLiveSnapshot returns clientCount = active clients", () => {
  registerClient();
  registerClient();
  registerClient();
  const snap = getLiveSnapshot();
  assert.equal(snap.clientCount, 3);
  assert.deepEqual(snap.entries, []);
  assert.equal(snap.activeCombos, 0);
  assert.equal(snap.activeSingles, 0);
});

// ── Combo parsing ────────────────────────────────────────────────────
test("CHAT combo start creates a running entry", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "free-mix" with 4 models (strategy: round-robin, sticky: 1)');
  const snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 1);
  assert.equal(snap.entries.length, 1);
  const entry = snap.entries[0];
  assert.equal(entry.kind, "combo");
  assert.equal(entry.name, "free-mix");
  assert.equal(entry.totalModels, 4);
  assert.equal(entry.status, "running");
  assert.equal(entry.startTime, "12:34:51");
  assert.equal(entry.models.length, 0);
});

test("TTS and IMAGE combos are also recognised", () => {
  parseLineForLive('[12:34:51] [INFO] [TTS] Combo "voice-mix" with 2 models (strategy: fallback)');
  parseLineForLive('[12:34:51] [INFO] [IMAGE] Combo "image-mix" with 3 models (strategy: fallback)');
  const snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 2);
  const names = snap.entries.map((e) => e.name);
  assert.deepEqual(names.sort(), ["image-mix", "voice-mix"]);
});

test("FUSION combo is recognised (no model count)", () => {
  parseLineForLive('[12:34:51] [INFO] [FUSION] Combo "judge-mix" | panel=3 [a, b, c] | judge=x | quorum=2');
  const snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 1);
  assert.equal(snap.entries[0].name, "judge-mix");
  assert.equal(snap.entries[0].totalModels, 0);
});

test("POST /v1/... starts a single request entry", () => {
  parseLineForLive('[12:34:51] [INFO] POST /v1/chat/completions');
  const snap = getLiveSnapshot();
  assert.equal(snap.activeSingles, 1);
  assert.equal(snap.entries[0].kind, "single");
  assert.equal(snap.entries[0].status, "running");
});

// ── Model tracking within a combo ────────────────────────────────────
test("Trying model i/N adds a model with status=trying", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "c" with 2 models');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/2: groq/llama-3.1-8b-instant');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 2/2: mimo-free/mimo-auto');
  const models = getLiveSnapshot().entries[0].models;
  assert.equal(models.length, 2);
  assert.equal(models[0].name, "groq/llama-3.1-8b-instant");
  assert.equal(models[0].status, "trying");
  assert.equal(models[1].name, "mimo-free/mimo-auto");
  assert.equal(models[1].status, "trying");
});

test("Model succeeded marks last trying model as success and completes combo", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "c" with 2 models');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/2: groq/llama-3.1-8b-instant');
  parseLineForLive('[12:34:52] [INFO] [COMBO] Model groq/llama-3.1-8b-instant succeeded');
  const entry = getLiveSnapshot().entries[0];
  assert.equal(entry.models[0].status, "success");
  assert.equal(entry.status, "success");
  assert.ok(entry.completedAt, "completedAt should be set");
});

test("Model failed, trying next marks model as failed but combo still running", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "c" with 2 models');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/2: groq/llama-3.1-8b-instant');
  parseLineForLive('[12:34:52] [WARN] [COMBO] Model groq/llama-3.1-8b-instant failed, trying next');
  const entry = getLiveSnapshot().entries[0];
  assert.equal(entry.models[0].status, "failed");
  assert.equal(entry.status, "running", "combo continues until next model tried");
  assert.equal(entry.completedAt, null);
});

test("Model failed (no fallback) marks model as failed_final and completes combo", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "c" with 1 model');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/1: only/model');
  parseLineForLive('[12:34:52] [WARN] [COMBO] Model only/model failed (no fallback)');
  const entry = getLiveSnapshot().entries[0];
  assert.equal(entry.models[0].status, "failed_final");
  assert.ok(entry.completedAt);
});

test("Model threw error applies same semantics as failed", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "c" with 2 models');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/2: foo');
  parseLineForLive('[12:34:52] [WARN] [COMBO] Model foo threw error, trying next');
  const entry = getLiveSnapshot().entries[0];
  assert.equal(entry.models[0].status, "failed");
});

test("All models failed marks combo as failed and completes", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "c" with 2 models');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/2: a');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 2/2: b');
  parseLineForLive('[12:34:52] [WARN] [COMBO] All models failed | too many errors (30s)');
  const entry = getLiveSnapshot().entries[0];
  assert.equal(entry.status, "failed");
  assert.ok(entry.completedAt);
});

// ── Single request lifecycle ─────────────────────────────────────────
test("PENDING END marks single as success and completes it", () => {
  parseLineForLive('[12:34:51] [INFO] POST /v1/chat/completions');
  parseLineForLive('[12:34:55] [INFO] [PENDING] END');
  const entry = getLiveSnapshot().entries[0];
  assert.equal(entry.status, "success");
  assert.ok(entry.completedAt);
});

// ── Stack-based scoping: later combo attempts go to later combo ────
test("Nested combos: 2 combos started back-to-back, stack pop on complete", () => {
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "comboA" with 2 models');
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "comboB" with 2 models');
  // Now both A and B are pushed; B is top of stack.
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/2: B-model1');
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 2/2: B-model2');
  parseLineForLive('[12:34:52] [INFO] [COMBO] Model B-model2 succeeded'); // completes B
  parseLineForLive('[12:34:52] [INFO] [COMBO] Trying model 1/2: A-model1'); // now A is top
  parseLineForLive('[12:34:52] [INFO] [COMBO] Trying model 2/2: A-model2');
  parseLineForLive('[12:34:53] [WARN] [COMBO] Model A-model2 failed (no fallback)'); // completes A (failed_final)
  const snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 0, "both combos complete");
  const entries = snap.entries.sort((a, b) => a.name.localeCompare(b.name));
  const comboA = entries.find((e) => e.name === "comboA");
  const comboB = entries.find((e) => e.name === "comboB");
  assert.equal(comboA.status, "running", "comboA still running (failed_final on last model keeps it running until All models failed)");
  assert.equal(comboB.status, "success");
  // Verify scoping: B has 2 models named B-*, A has 2 models named A-*
  assert.deepEqual(comboB.models.map((m) => m.name), ["B-model1", "B-model2"]);
  assert.deepEqual(comboA.models.map((m) => m.name), ["A-model1", "A-model2"]);
});

// ── Snapshot ordering ────────────────────────────────────────────────
test("activeCombos / activeSingles counts reflect running entries", () => {
  // Stack-based scope: single request starts on top of the running combo,
  // so complete the single first (PENDING END pops it) before continuing
  // the combo. This matches the LIFO scope model documented in the tracker.
  parseLineForLive('[12:34:51] [INFO] [CHAT] Combo "A" with 1 model');
  parseLineForLive('[12:34:51] [INFO] POST /v1/chat/completions');
  let snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 1);
  assert.equal(snap.activeSingles, 1);

  // Complete single via PENDING END
  parseLineForLive('[12:34:55] [INFO] [PENDING] END');
  snap = getLiveSnapshot();
  assert.equal(snap.activeSingles, 0);
  assert.equal(snap.activeCombos, 1, "combo still active");

  // Now combo A is top of stack again; complete it via no-fallback
  parseLineForLive('[12:34:51] [INFO] [COMBO] Trying model 1/1: A-m1');
  parseLineForLive('[12:34:52] [WARN] [COMBO] Model A-m1 failed (no fallback)');
  snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 0, "combo A completed");
});

// ── Malformed / unrelated lines are no-ops ───────────────────────────
test("Unrelated lines do not crash and do not change state", () => {
  parseLineForLive('[12:34:51] [INFO] some random log line');
  parseLineForLive('');
  parseLineForLive('garbage');
  const snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 0);
  assert.equal(snap.activeSingles, 0);
  assert.equal(snap.entries.length, 0);
});

// ── Snapshot includes recent completed (up to 20) ───────────────────
test("Completed entries appear in snapshot but counted as 0 active", () => {
  // Create + complete 5 combos
  for (let i = 0; i < 5; i++) {
    parseLineForLive(`[12:34:5${i}] [INFO] [CHAT] Combo "c${i}" with 1 model`);
    parseLineForLive(`[12:34:5${i}] [INFO] [COMBO] Trying model 1/1: m${i}`);
    parseLineForLive(`[12:34:5${i}] [WARN] [COMBO] Model m${i} failed (no fallback)`);
  }
  const snap = getLiveSnapshot();
  assert.equal(snap.activeCombos, 0);
  assert.equal(snap.entries.length, 5, "all 5 completed entries returned");
  for (const e of snap.entries) {
    assert.ok(e.completedAt);
    assert.equal(e.kind, "combo");
  }
});
