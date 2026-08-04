import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.DIEPXUAN_ENABLED = "true";

const ROOT = path.resolve(import.meta.dirname, "../..");
const registryUrl = pathToFileURL(path.join(ROOT, "open-sse/providers/registry/index.js")).href;
const registry = (await import(registryUrl)).default;
const geminiEntries = registry.filter((entry) => entry.id === "gemini");
const active = geminiEntries.at(-1);
const byId = new Map(active.models.map((model) => [model.id, model]));

test("Gemini fork registry is wired last", () => {
  assert.equal(geminiEntries.length, 2);
  assert.equal(byId.has("gemini-3.6-flash"), true);
});

test("Gemini fork registry marks free-tier models", () => {
  for (const id of [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
  ]) {
    assert.equal(byId.get(id)?.isFree, true, id);
  }
});

test("Gemini fork registry does not mark paid preview as free", () => {
  assert.notEqual(byId.get("gemini-3.1-pro-preview")?.isFree, true);
});
