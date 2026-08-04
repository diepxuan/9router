import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.DIEPXUAN_ENABLED = "true";

const ROOT = path.resolve(import.meta.dirname, "../..");
const registryUrl = pathToFileURL(path.join(ROOT, "open-sse/providers/registry/index.js")).href;
const registry = (await import(registryUrl)).default;
const openaiEntries = registry.filter((entry) => entry.id === "openai");
const active = openaiEntries.at(-1);
const ids = new Set(active.models.map((model) => model.id));

test("OpenAI fork registry is wired last", () => {
  assert.equal(openaiEntries.length, 2);
  assert.match(active.models.find((model) => model.id === "gpt-5.6-sol")?.name || "", /GPT-5\.6 Sol/);
});

test("OpenAI fork registry exposes current chat-compatible GPT-5.6 models", () => {
  for (const id of ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"]) {
    assert.equal(ids.has(id), true, id);
  }
});

test("OpenAI fork registry excludes Responses-only or deprecated models", () => {
  for (const id of ["gpt-5-pro", "gpt-5.2-pro", "gpt-5.4-pro", "gpt-5.5-pro", "o1-pro", "gpt-5-chat-latest"]) {
    assert.equal(ids.has(id), false, id);
  }
});
