import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDiepXuanEnabled = process.env.DIEPXUAN_ENABLED;
const originalDiepXuanSafeMode = process.env.DIEPXUAN_SAFE_MODE;

function restoreEnv() {
  if (originalDiepXuanEnabled === undefined) delete process.env.DIEPXUAN_ENABLED;
  else process.env.DIEPXUAN_ENABLED = originalDiepXuanEnabled;

  if (originalDiepXuanSafeMode === undefined) delete process.env.DIEPXUAN_SAFE_MODE;
  else process.env.DIEPXUAN_SAFE_MODE = originalDiepXuanSafeMode;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.DIEPXUAN_ENABLED;
  delete process.env.DIEPXUAN_SAFE_MODE;
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  restoreEnv();
});

describe("DiepXuan feature flags", () => {
  it("enables DiepXuan hooks by default when DIEPXUAN_ENABLED is unset", async () => {
    const { isDiepXuanEnabled } = await import("@/diepxuan/shared/config/flags.js");
    expect(isDiepXuanEnabled()).toBe(true);
  });

  it("disables DiepXuan hooks when DIEPXUAN_ENABLED=0", async () => {
    process.env.DIEPXUAN_ENABLED = "0";

    const { isDiepXuanEnabled } = await import("@/diepxuan/shared/config/flags.js");
    expect(isDiepXuanEnabled()).toBe(false);
  });

  it("enables safe mode only when DIEPXUAN_SAFE_MODE is truthy", async () => {
    const { isDiepXuanSafeMode } = await import("@/diepxuan/shared/config/flags.js");
    expect(isDiepXuanSafeMode()).toBe(false);

    process.env.DIEPXUAN_SAFE_MODE = "1";
    expect(isDiepXuanSafeMode()).toBe(true);
  });
});

describe("DiepXuan combo fail tracker hook", () => {
  it("beforeComboModelAttempt skips and logs a model after repeated failures", async () => {
    const {
      beforeComboModelAttempt,
      recordComboModelOutcome,
    } = await import("../../open-sse/diepxuan/comboHooks.js");
    const { resetComboFailTracker } = await import("../../open-sse/diepxuan/comboFailTracker.js");

    const comboName = `before-combo-${Date.now()}`;
    const model = "provider/model";
    const log = { debug: vi.fn() };

    resetComboFailTracker(comboName);
    expect(await beforeComboModelAttempt({ modelStr: model, comboName, log })).toEqual({ skip: false });

    recordComboModelOutcome(model, comboName, false);
    recordComboModelOutcome(model, comboName, false);
    recordComboModelOutcome(model, comboName, false);

    expect(await beforeComboModelAttempt({ modelStr: model, comboName, log })).toEqual({ skip: true, reason: "fail_count_exceeded" });
    expect(log.debug).toHaveBeenCalledWith("COMBO", `Skipping ${model} (fail count exceeded)`);
  });

  it("afterComboModelAttempt records failures and success resets the skip state", async () => {
    const {
      afterComboModelAttempt,
      beforeComboModelAttempt,
    } = await import("../../open-sse/diepxuan/comboHooks.js");
    const { resetComboFailTracker } = await import("../../open-sse/diepxuan/comboFailTracker.js");

    const comboName = `after-combo-${Date.now()}`;
    const model = "provider/model";

    resetComboFailTracker(comboName);
    afterComboModelAttempt({ modelStr: model, comboName, ok: false });
    afterComboModelAttempt({ modelStr: model, comboName, ok: false });
    expect(await beforeComboModelAttempt({ modelStr: model, comboName })).toEqual({ skip: false });

    afterComboModelAttempt({ modelStr: model, comboName, ok: false });
    expect(await beforeComboModelAttempt({ modelStr: model, comboName })).toEqual({ skip: true, reason: "fail_count_exceeded" });

    afterComboModelAttempt({ modelStr: model, comboName, ok: true });
    expect(await beforeComboModelAttempt({ modelStr: model, comboName })).toEqual({ skip: false });
  });

  it("skips a combo model after repeated failures and resets on success", async () => {
    const {
      recordComboModelOutcome,
      shouldSkipComboModel,
    } = await import("../../open-sse/diepxuan/comboHooks.js");
    const { resetComboFailTracker } = await import("../../open-sse/diepxuan/comboFailTracker.js");

    const comboName = `test-combo-${Date.now()}`;
    const model = "provider/model";

    resetComboFailTracker(comboName);
    expect(shouldSkipComboModel(model, comboName)).toBe(false);

    recordComboModelOutcome(model, comboName, false);
    recordComboModelOutcome(model, comboName, false);
    expect(shouldSkipComboModel(model, comboName)).toBe(false);

    recordComboModelOutcome(model, comboName, false);
    expect(shouldSkipComboModel(model, comboName)).toBe(true);

    recordComboModelOutcome(model, comboName, true);
    expect(shouldSkipComboModel(model, comboName)).toBe(false);
  });

  it("does not skip or record failures when DiepXuan is disabled", async () => {
    process.env.DIEPXUAN_ENABLED = "0";

    const {
      recordComboModelOutcome,
      shouldSkipComboModel,
    } = await import("../../open-sse/diepxuan/comboHooks.js");
    const { resetComboFailTracker } = await import("../../open-sse/diepxuan/comboFailTracker.js");

    const comboName = `disabled-combo-${Date.now()}`;
    const model = "provider/model";

    resetComboFailTracker(comboName);
    recordComboModelOutcome(model, comboName, false);
    recordComboModelOutcome(model, comboName, false);
    recordComboModelOutcome(model, comboName, false);

    expect(shouldSkipComboModel(model, comboName)).toBe(false);
  });
});
