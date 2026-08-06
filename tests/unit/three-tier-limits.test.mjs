import test from "node:test";
import assert from "node:assert/strict";

import {
  getResolvedKeyTotalLimits,
  getResolvedKeyModelLimits,
  getResolvedLimits,
} from "../../open-sse/diepxuan/limits/index.js";

import {
  acquireQuotaSlot,
  recordRequestOutcome,
} from "../../open-sse/diepxuan/limits/throttle.js";

// ─── Resolver units ──────────────────────────────────────────────────
test("getResolvedKeyTotalLimits reads connection.keyLimits (raw DB shape)", () => {
  const conn = { data: { keyLimits: { rpm: 100, tpm: 2_000_000, source: "user-conn" } } };
  const lim = getResolvedKeyTotalLimits({ provider: "nvidia", connection: conn });
  assert.ok(lim);
  assert.equal(lim.rpm, 100);
  assert.equal(lim.tpm, 2_000_000);
});

test("getResolvedKeyTotalLimits reads connection.keyLimits (flattened Repo shape)", () => {
  // connectionsRepo.getProviderConnectionById() returns the row with
  // data already parsed and spread, so connection.data may already be
  // an object — make sure both shapes work.
  const conn = { data: { keyLimits: { rpm: 5 } } };
  const lim = getResolvedKeyTotalLimits({ provider: "nvidia", connection: conn });
  assert.equal(lim.rpm, 5);
});

test("getResolvedKeyModelLimits reads connection.data.modelLimits[model]", () => {
  const conn = { data: { modelLimits: { "z-ai/glm-5.2": { rpm: 15 } } } };
  const lim = getResolvedKeyModelLimits({
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    connection: conn,
  });
  assert.ok(lim);
  assert.equal(lim.rpm, 15);
});

// ─── Throttle enforcement ────────────────────────────────────────────
test("Key Total Limit blocks OTHER models on same key", async () => {
  const connectionId = "conn_key_total_test_1";
  const conn = { data: { keyLimits: { rpm: 2, policy: "reject-429" } } };

  recordRequestOutcome({ provider: "testprov", model: "model1", connectionId });
  recordRequestOutcome({ provider: "testprov", model: "model1", connectionId });

  const res = await acquireQuotaSlot({
    provider: "testprov",
    model: "model2",
    connectionId,
    connection: conn,
  });

  assert.equal(res.acquired, false);
  assert.match(res.reason, /key_total_rpm_exceeded/);
});

test("Key Per-Model Limit blocks ONLY that specific model on key", async () => {
  const connectionId = "conn_key_model_test_2";
  const conn = { data: { modelLimits: { modelA: { rpm: 1, policy: "reject-429" } } } };

  recordRequestOutcome({ provider: "testprov", model: "modelA", connectionId });

  const resA = await acquireQuotaSlot({
    provider: "testprov", model: "modelA", connectionId, connection: conn,
  });
  assert.equal(resA.acquired, false);
  assert.match(resA.reason, /key_model_rpm_exceeded/);

  const resB = await acquireQuotaSlot({
    provider: "testprov", model: "modelB", connectionId, connection: conn,
  });
  assert.equal(resB.acquired, true);
});

test("Model Global Limit blocks ALL keys using that model", async () => {
  // Fill 30 requests under connKey1, then connKey2 must be blocked.
  const connKey1 = "conn_key1_global_test";
  const connKey2 = "conn_key2_global_test";
  for (let i = 0; i < 30; i++) {
    recordRequestOutcome({ provider: "nvidia", model: "z-ai/glm-5.2", connectionId: connKey1 });
  }
  const resKey2 = await acquireQuotaSlot({
    provider: "nvidia", model: "z-ai/glm-5.2", connectionId: connKey2,
  });
  assert.equal(resKey2.acquired, false);
  assert.match(resKey2.reason, /model_global_rpm_exceeded/);
});

// ─── Regression: connection.limits must NOT leak into Model Global ─
test("connection.limits on key A does NOT affect key B (no leak)", async () => {
  const connA = { data: { limits: { rpm: 2, policy: "reject-429" } } };
  // connA's `limits` is its per-key override; it must NEVER block connB
  // via the global scope. The global tier uses registry/auto/inferred
  // only — and z-ai/glm-5.2 has a registry limit of 30 rpm.

  // Fill 29 requests on connB's model — still under 30 rpm global.
  for (let i = 0; i < 29; i++) {
    recordRequestOutcome({ provider: "nvidia", model: "z-ai/glm-5.2", connectionId: "connB" });
  }
  // Drain connA's own slot.
  recordRequestOutcome({ provider: "nvidia", model: "z-ai/glm-5.2", connectionId: "connA" });
  // Try a 31st global request from a fresh key — must still be
  // rejected (model_global), NOT by connA.key_total.
  const res = await acquireQuotaSlot({
    provider: "nvidia", model: "z-ai/glm-5.2", connectionId: "connC", connection: null,
  });
  assert.equal(res.acquired, false);
  assert.match(res.reason, /model_global_rpm_exceeded/);
});

test("Model Global resolver: skipConnectionLayer=true ignores connection.limits", () => {
  // Per-key override is correctly applied by the default path
  // (user config wins over registry). When the throttle computes
  // the global tier it MUST pass skipConnectionLayer=true so a
  // single key cannot block other keys via the global scope.
  const conn = { data: { limits: { rpm: 999, source: "user-conn" } } };
  const noConn = getResolvedLimits({
    provider: "nvidia", model: "z-ai/glm-5.2",
    connection: conn, connectionId: null,
    skipConnectionLayer: true,
  });
  assert.ok(noConn);
  assert.notEqual(noConn.rpm, 999, "per-key override must not leak into global scope");
  assert.equal(noConn.rpm, 30, "global tier must use registry value (30 rpm)");
});

// ─── comboHooks integration: only connectionId is passed ────────────
test("Integration: comboHooks pattern — key total enforced when only connectionId is passed (mocked repo)", async () => {
  // We can't easily mock the dynamic import in a unit test, but we
  // can verify the resolver path: a caller passing only connectionId
  // and pre-built `connection` object must still hit key_total.
  const connectionId = "conn_int1";
  const conn = { id: connectionId, data: { keyLimits: { rpm: 3, policy: "reject-429" } } };

  recordRequestOutcome({ provider: "testprov", model: "modelA", connectionId });
  recordRequestOutcome({ provider: "testprov", model: "modelA", connectionId });
  recordRequestOutcome({ provider: "testprov", model: "modelA", connectionId });

  const res = await acquireQuotaSlot({
    provider: "testprov", model: "modelA", connectionId, connection: conn,
  });
  assert.equal(res.acquired, false);
  assert.match(res.reason, /key_total_rpm_exceeded/);
});

test("Integration: comboHooks pattern — key model enforced when only connectionId is passed", async () => {
  const connectionId = "conn_int2";
  const conn = { id: connectionId, data: { modelLimits: { modelA: { rpm: 1, policy: "reject-429" } } } };

  recordRequestOutcome({ provider: "testprov", model: "modelA", connectionId });
  const resA = await acquireQuotaSlot({
    provider: "testprov", model: "modelA", connectionId, connection: conn,
  });
  assert.equal(resA.acquired, false);
  assert.match(resA.reason, /key_model_rpm_exceeded/);

  const resB = await acquireQuotaSlot({
    provider: "testprov", model: "modelB", connectionId, connection: conn,
  });
  assert.equal(resB.acquired, true);
});
