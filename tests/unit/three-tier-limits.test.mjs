import test from "node:test";
import assert from "node:assert/strict";

import {
  getProviderKeyLimits,
  getKeyLimitsFromConnectionObj,
  getResolvedKeyTotalLimits,
  getRegistryKeyModelLimits,
  getKeyModelLimitsFromConnectionObj,
  getResolvedKeyModelLimits,
} from "../../open-sse/diepxuan/limits/index.js";

import {
  acquireQuotaSlot,
  recordRequestOutcome,
} from "../../open-sse/diepxuan/limits/throttle.js";

test("getResolvedKeyTotalLimits reads provider keyLimits", () => {
  const lim = getResolvedKeyTotalLimits({
    provider: "nvidia",
    connection: null,
  });
  // If provider doesn't have keyLimits yet, returns null
  assert.equal(lim, null);
});

test("getResolvedKeyTotalLimits connection overrides provider keyLimits", () => {
  const conn = {
    data: {
      keyLimits: { rpm: 100, tpm: 2_000_000, source: "user-conn" },
    },
  };
  const lim = getResolvedKeyTotalLimits({
    provider: "nvidia",
    connection: conn,
  });
  assert.ok(lim);
  assert.equal(lim.rpm, 100);
  assert.equal(lim.tpm, 2_000_000);
});

test("getResolvedKeyModelLimits reads connection modelLimits[model]", () => {
  const conn = {
    data: {
      modelLimits: {
        "z-ai/glm-5.2": { rpm: 15, source: "conn-model-override" },
      },
    },
  };
  const lim = getResolvedKeyModelLimits({
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    connection: conn,
  });
  assert.ok(lim);
  assert.equal(lim.rpm, 15);
});

test("3-Tier Throttle Enforcement: Key Total Limit blocks OTHER models on same key", async () => {
  const connectionId = "conn_key_total_test_1";
  const conn = {
    data: {
      keyLimits: { rpm: 2, policy: "reject-429" },
    },
  };

  // Model 1 takes 2 slots on key
  recordRequestOutcome({ provider: "testprov", model: "model1", connectionId });
  recordRequestOutcome({ provider: "testprov", model: "model1", connectionId });

  // Model 2 on SAME key must be blocked due to key_total breach
  const res = await acquireQuotaSlot({
    provider: "testprov",
    model: "model2",
    connectionId,
    connection: conn,
  });

  assert.equal(res.acquired, false);
  assert.match(res.reason, /key_total_rpm_exceeded/);
});

test("3-Tier Throttle Enforcement: Key Per-Model Limit blocks ONLY that specific model on key", async () => {
  const connectionId = "conn_key_model_test_2";
  const conn = {
    data: {
      modelLimits: {
        "modelA": { rpm: 1, policy: "reject-429" },
      },
    },
  };

  // modelA takes 1 slot
  recordRequestOutcome({ provider: "testprov", model: "modelA", connectionId });

  // modelA again -> blocked
  const resA = await acquireQuotaSlot({
    provider: "testprov",
    model: "modelA",
    connectionId,
    connection: conn,
  });
  assert.equal(resA.acquired, false);
  assert.match(resA.reason, /key_model_rpm_exceeded/);

  // modelB on same key -> allowed because Key Total has no limit & modelB has no limit
  const resB = await acquireQuotaSlot({
    provider: "testprov",
    model: "modelB",
    connectionId,
    connection: conn,
  });
  assert.equal(resB.acquired, true);
});

test("3-Tier Throttle Enforcement: Model Global Limit blocks ALL keys using that model", async () => {
  const connKey1 = "conn_key1_global_test";
  const connKey2 = "conn_key2_global_test";

  // Use a model with a global registry limit (e.g. z-ai/glm-5.2 has 30 rpm)
  // Fill up 30 requests under connKey1
  for (let i = 0; i < 30; i++) {
    recordRequestOutcome({ provider: "nvidia", model: "z-ai/glm-5.2", connectionId: connKey1 });
  }

  // connKey2 attempts to use z-ai/glm-5.2 -> blocked by model_global_rpm_exceeded
  const resKey2 = await acquireQuotaSlot({
    provider: "nvidia",
    model: "z-ai/glm-5.2",
    connectionId: connKey2,
  });

  assert.equal(resKey2.acquired, false);
  assert.match(resKey2.reason, /model_global_rpm_exceeded/);
});
