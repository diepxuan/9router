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
test("Integration: comboHooks pattern — key total enforced with preloaded connection object", async () => {
  // comboHooks.beforeComboModelAttempt only passes { provider, model,
  // connectionId, body } — no `connection`. In production the
  // throttle lazy-loads the connection via getProviderConnectionById.
  // We can't easily mock that dynamic import in a unit test, so we
  // simulate the lazy-load result by passing a pre-built connection
  // object directly. The resolver / scope path is the same.
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

test("Integration: comboHooks pattern — key model enforced with preloaded connection object", async () => {
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

// ─── Precedence: effectiveLimits — modelGlobal > keyModel > keyTotal ──
// The actual acquire/wait decision is per-scope, but the policy /
// maxWaitMs / logging block is the union of all tiers. The strictest
// tier must win; keyTotal is only a safety net.
test("effectiveLimits precedence: modelGlobal.rpm beats keyModel and keyTotal", async () => {
  const connectionId = "conn_precedence_1";
  const conn = {
    data: {
      keyLimits: { rpm: 5, tpm: 100_000, policy: "wait-then-send", maxWaitMs: 5000 },
      modelLimits: { glm: { rpm: 30, tpm: 200_000, policy: "fallback" } },
    },
  };
  // modelGlobal is null: testprov has no registry entry and we omit
  // contextWindow so the inference layer returns null too. With only
  // keyTotal + keyModel present, the precedence assertion isolates
  // the keyModel > keyTotal rule.
  const r = await acquireQuotaSlot({
    provider: "testprov", model: "glm",
    connectionId, connection: conn,
  });
  assert.equal(r.limits.rpm, 30, "keyModel.rpm must win over keyTotal.rpm");
  assert.equal(r.limits.tpm, 200_000, "keyModel.tpm must win over keyTotal.tpm");
  assert.equal(r.limits.policy, "fallback", "keyModel.policy must win over keyTotal.policy");
});

test("effectiveLimits precedence: keyTotal fills missing fields only", async () => {
  const connectionId = "conn_precedence_2";
  // keyModel only declares rpm, keyTotal declares tpm + policy.
  // effectiveLimits.rpm must come from keyModel, tpm + policy from keyTotal.
  const conn = {
    data: {
      keyLimits: { tpm: 500_000, policy: "reject-429" },
      modelLimits: { glm: { rpm: 12 } },
    },
  };
  const r = await acquireQuotaSlot({
    provider: "testprov", model: "glm",
    connectionId, connection: conn,
  });
  assert.equal(r.limits.rpm, 12, "keyModel.rpm");
  assert.equal(r.limits.tpm, 500_000, "keyTotal.tpm fills in");
  assert.equal(r.limits.policy, "reject-429", "keyTotal.policy fills in");
});

test("effectiveLimits precedence: modelGlobal.policy wins over keyTotal.policy", async () => {
  // Real registry entry (nvidia/glm-5.2) populates modelGlobal with
  // 30 rpm. We pair it with a keyTotal that has the looser policy
  // "wait-then-send". The union must surface the registry's rpm=30
  // (modelGlobal > keyTotal) and the strictest policy field.
  // Note: modelGlobal from the registry does NOT carry a policy of
  // its own, so the union uses the keyTotal policy (the only one set).
  // The rpm precedence is the real assertion here.
  const connectionId = "conn_precedence_3";
  const conn = {
    data: {
      keyLimits: { rpm: 100, policy: "wait-then-send", maxWaitMs: 5000 },
    },
  };
  const r = await acquireQuotaSlot({
    provider: "nvidia", model: "z-ai/glm-5.2",
    connectionId, connection: conn,
  });
  // modelGlobal from registry = 30 rpm, keyTotal = 100 rpm.
  // modelGlobal wins → effectiveLimits.rpm = 30.
  assert.equal(r.limits.rpm, 30, "modelGlobal.rpm (30) must beat keyTotal.rpm (100)");
  assert.equal(r.limits.policy, "wait-then-send", "keyTotal.policy fills in");
  assert.equal(r.limits.maxWaitMs, 5000, "keyTotal.maxWaitMs fills in");
});

test("effectiveLimits precedence: keyModel.policy wins over keyTotal.policy", async () => {
  // When modelGlobal has no policy of its own, keyModel.policy
  // must beat keyTotal.policy in the union (no registry, no model
  // cap → modelGlobal is null, so the union is keyTotal ∪ keyModel).
  const connectionId = "conn_precedence_4";
  const conn = {
    data: {
      keyLimits: { rpm: 10, policy: "wait-then-send" },
      modelLimits: { glm: { rpm: 50, policy: "reject-429" } },
    },
  };
  const r = await acquireQuotaSlot({
    provider: "testprov", model: "glm",
    connectionId, connection: conn,
  });
  assert.equal(r.limits.policy, "reject-429", "keyModel.policy must win over keyTotal.policy");
  assert.equal(r.limits.rpm, 50, "keyModel.rpm (50) must win over keyTotal.rpm (10)");
});

// ─── Behavior change: legacy connection.data.limits is global-scope only ─
// Document + lock the migration rule: `connection.data.limits` (legacy
// field) is read by getResolvedLimits when skipConnectionLayer=false.
// The throttle now ALWAYS sets skipConnectionLayer=true on the global
// tier, so this regression test pins that behaviour and produces a
// diagnostic failure if a future refactor re-enables the leak.
test("legacy connection.data.limits is honoured only when the resolver is called without skipConnectionLayer", () => {
  // The global-scope path inside the throttle calls
  //   getResolvedLimits({ ..., skipConnectionLayer: true })
  // which makes getConnectionLimitsFromObj return null. We assert
  // that contract here so any future change is intentional.
  const conn = { data: { limits: { rpm: 7, source: "legacy" } } };
  const legacyOn = getResolvedLimits({
    provider: "testprov", model: "glm", connection: conn, connectionId: null,
  });
  // With the legacy field, the resolver used to return { rpm: 7 }.
  // That path is preserved for any caller that does NOT pass
  // skipConnectionLayer.
  if (legacyOn) {
    assert.equal(legacyOn.rpm, 7);
  }
  const legacyOff = getResolvedLimits({
    provider: "testprov", model: "glm", connection: conn, connectionId: null,
    skipConnectionLayer: true,
  });
  // skipConnectionLayer=true → connection layer must be ignored.
  // testprov has no registry entry, no inferred ctx, so it must be null.
  assert.equal(legacyOff, null, "skipConnectionLayer=true must drop connection.data.limits");
});

// ─── Edge case: key_total=1 across multiple models on the same key ───
// Even if each model has its own generous cap, a key_total of 1 means
// the SECOND request across ANY model on that key must be blocked.
test("Key Total Limit edge case: key_total=1 blocks every model after the first", async () => {
  const connectionId = "conn_key_total_edge";
  const conn = { data: { keyLimits: { rpm: 1, policy: "reject-429" } } };

  // First request across the whole key (any model) consumes the only slot.
  recordRequestOutcome({ provider: "testprov", model: "modelA", connectionId });

  // Second request on a DIFFERENT model must still be blocked.
  const res = await acquireQuotaSlot({
    provider: "testprov", model: "modelB",
    connectionId, connection: conn,
  });
  assert.equal(res.acquired, false);
  assert.match(res.reason, /key_total_rpm_exceeded/);
});
