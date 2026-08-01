import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.DIEPXUAN_ENABLED = "true";
process.env.NINE_ROUTER_DB_PATH = path.join(os.tmpdir(), `9router-ctx-priority-${Date.now()}.sqlite`);

const ROOT = path.resolve(import.meta.dirname, "../..");
const idxUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/contextLength/index.js")).href;
const cacheUrl = pathToFileURL(path.join(ROOT, "open-sse/diepxuan/contextLength/cache.js")).href;

const {
  initContextLengthCache,
  upsertContextLength,
  SOURCE_ERROR,
  SOURCE_STATIC,
} = await import(cacheUrl);

const {
  getContextLengthSync,
  getContextLengthBatchCached,
  getStaticContextLength,
} = await import(idxUrl);

initContextLengthCache();

const MODEL = "nvidia/deepseek-ai/deepseek-v4-pro";

test("static MODEL_INFO returns 1M for deepseek-v4-pro", () => {
  assert.equal(getStaticContextLength(MODEL), 1048576);
});

test("error cache entry does not override static 1M", () => {
  initContextLengthCache();
  upsertContextLength(MODEL, 262144, SOURCE_ERROR);
  assert.equal(getContextLengthSync(MODEL), 1048576);
});

test("batch lookup prefers static over error cache entry", () => {
  const map = getContextLengthBatchCached([MODEL, "unknown/model"]);
  assert.equal(map.get(MODEL)?.contextLength, 1048576);
  assert.equal(map.get(MODEL)?.source, SOURCE_STATIC);
  assert.equal(map.has("unknown/model"), false);
});
