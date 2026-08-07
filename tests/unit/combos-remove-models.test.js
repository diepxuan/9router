// diepxuan: Verify POST /api/models/disabled cascades into combosRepo so a
// disabled model is removed from every combo's models[]. Without this, a
// disabled/EOL model stays referenced inside combos and retries waste
// round-trips (matches the bug Sếp hit with NVIDIA deepseek-v4-pro /
// deepseek-v4-flash on 2026-08-07).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-combos-rm-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
  // Init the schema once for this temp dir so combos/kv tables exist.
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

describe("removeModelsFromAllCombos", () => {
  it("removes exact-match ids from every combo", async () => {
    const { createCombo, getCombos, removeModelsFromAllCombos } = await import(
      "@/lib/localDb"
    );

    await createCombo({
      id: "c1",
      name: "alpha",
      kind: "chat",
      models: ["nvidia/deepseek-ai/deepseek-v4-pro", "openai/gpt-5.5", "minimax"],
    });
    await createCombo({
      id: "c2",
      name: "beta",
      kind: "chat",
      models: ["nvidia/deepseek-ai/deepseek-v4-pro", "nvidia/deepseek-ai/deepseek-v4-flash"],
    });
    await createCombo({
      id: "c3",
      name: "gamma",
      kind: "chat",
      models: ["openai/gpt-5.5"],
    });

    const updated = await removeModelsFromAllCombos(
      ["nvidia/deepseek-ai/deepseek-v4-pro", "nvidia/deepseek-ai/deepseek-v4-flash"],
      "nvidia"
    );

    expect(updated).toBe(2); // alpha + beta, gamma untouched
    const combos = await getCombos();
    const byName = Object.fromEntries(combos.map((c) => [c.name, c.models]));
    expect(byName.alpha).toEqual(["openai/gpt-5.5", "minimax"]);
    expect(byName.beta).toEqual([]);
    expect(byName.gamma).toEqual(["openai/gpt-5.5"]);
  });

  it("is no-op when ids list is empty or invalid", async () => {
    const { createCombo, getCombos, removeModelsFromAllCombos } = await import(
      "@/lib/localDb"
    );
    await createCombo({
      id: "c1",
      name: "alpha",
      kind: "chat",
      models: ["gpt-5.5", "minimax"],
    });
    const r1 = await removeModelsFromAllCombos([], "openai");
    const r2 = await removeModelsFromAllCombos(undefined, "openai");
    const r3 = await removeModelsFromAllCombos([null, "", 42], "openai");
    expect(r1).toBe(0);
    expect(r2).toBe(0);
    expect(r3).toBe(0); // all entries invalid, filtered out
    const [c] = await getCombos();
    expect(c.models).toEqual(["gpt-5.5", "minimax"]);

    // Now remove "gpt-5.5" — should update the combo.
    const r4 = await removeModelsFromAllCombos(["gpt-5.5"], "openai");
    expect(r4).toBe(1);
    const [c2] = await getCombos();
    expect(c2.models).toEqual(["minimax"]);
  });

  it("does not match by suffix or by partial path", async () => {
    const { createCombo, getCombos, removeModelsFromAllCombos } = await import(
      "@/lib/localDb"
    );
    await createCombo({
      id: "c1",
      name: "alpha",
      kind: "chat",
      models: [
        "deepseek-ai/deepseek-v4-pro",           // missing nvidia prefix
        "nvidia/deepseek-ai/deepseek-v4-pro",    // exact match target
        "nvidia/deepseek-ai/deepseek-v4-flash",
      ],
    });
    const updated = await removeModelsFromAllCombos(
      ["nvidia/deepseek-ai/deepseek-v4-pro"],
      "nvidia"
    );
    expect(updated).toBe(1);
    const [c] = await getCombos();
    // "deepseek-ai/deepseek-v4-pro" (no prefix) must NOT be removed —
    // exact match only, no prefix inference.
    expect(c.models).toEqual([
      "deepseek-ai/deepseek-v4-pro",
      "nvidia/deepseek-ai/deepseek-v4-flash",
    ]);
  });

  it("skipps combos whose models[] is empty or missing", async () => {
    const { createCombo, getCombos, removeModelsFromAllCombos } = await import(
      "@/lib/localDb"
    );
    await createCombo({
      id: "c1",
      name: "alpha",
      kind: "chat",
      models: [],
    });
    const updated = await removeModelsFromAllCombos(["nvidia/foo"], "nvidia");
    expect(updated).toBe(0);
  });
});
