// diepxuan: Verify the fork always keeps an LLM combo named `default`
// (models ["llmfree"]) and routes unresolvable chat models to it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-default-combo-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
  const { getAdapter } = await import("@/lib/db/driver.js");
  const { runMigrationOnce } = await import("@/lib/db/migrate.js");
  const adapter = await getAdapter();
  await runMigrationOnce(adapter);
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

async function loadHelper() {
  return import("@/diepxuan/lib/defaultCombo.js");
}

describe("ensureDefaultCombo", () => {
  it("creates default with llmfree when DB has no combos", async () => {
    const { getCombos } = await import("@/lib/localDb");
    const { ensureDefaultCombo, DEFAULT_COMBO_MODELS } = await loadHelper();

    const created = await ensureDefaultCombo();
    expect(created.name).toBe("default");
    expect(created.models).toEqual(DEFAULT_COMBO_MODELS);

    const all = await getCombos();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("default");
    expect(all[0].models).toEqual(["llmfree"]);
  });

  it("does not overwrite an existing default combo", async () => {
    const { createCombo, getCombos } = await import("@/lib/localDb");
    const { ensureDefaultCombo } = await loadHelper();

    await createCombo({
      name: "default",
      kind: null,
      models: ["custom/default-chain"],
    });

    const existing = await ensureDefaultCombo();
    expect(existing.models).toEqual(["custom/default-chain"]);
    expect(await getCombos()).toHaveLength(1);
  });

  it("recreates default after it is deleted outside the API", async () => {
    const { createCombo, getCombos, deleteCombo, getComboByName } = await import("@/lib/localDb");
    const { ensureDefaultCombo } = await loadHelper();

    const combo = await createCombo({ name: "default", kind: null, models: ["llmfree"] });
    await deleteCombo(combo.id);
    expect(await getComboByName("default")).toBeNull();

    const recreated = await ensureDefaultCombo();
    expect(recreated.name).toBe("default");
    expect(recreated.models).toEqual(["llmfree"]);
    expect(await getCombos()).toHaveLength(1);
  });
});

describe("resolveDefaultComboFallback", () => {
  it("keeps known combos and known provider/model strings", async () => {
    const { createCombo } = await import("@/lib/localDb");
    const { resolveDefaultComboFallback } = await loadHelper();

    await createCombo({ name: "known-combo", kind: null, models: ["openai/gpt-5.5"] });

    expect(await resolveDefaultComboFallback("known-combo")).toEqual({ modelStr: "known-combo", fallback: false });
    expect(await resolveDefaultComboFallback("openai/gpt-5.5")).toEqual({ modelStr: "openai/gpt-5.5", fallback: false });
  });

  it("rewrites missing combos and unknown aliases to default", async () => {
    const { resolveDefaultComboFallback } = await loadHelper();

    expect(await resolveDefaultComboFallback("missing-combo")).toEqual({ modelStr: "default", fallback: true });
    expect(await resolveDefaultComboFallback("totally-unknown-alias")).toEqual({ modelStr: "default", fallback: true });
  });

  it("rewrites unknown provider prefixes to default", async () => {
    const { resolveDefaultComboFallback } = await loadHelper();
    expect(await resolveDefaultComboFallback("not-a-real-provider/model-x")).toEqual({ modelStr: "default", fallback: true });
  });
});
