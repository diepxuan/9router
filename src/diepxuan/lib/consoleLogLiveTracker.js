/**
 * DiepXuan fork-layer: console log live activity tracker.
 *
 * Tracks real-time state parsed from the global console log buffer:
 *   - activeClients: count of SSE stream clients currently connected
 *   - activeCombos: Map<key, {kind, name, started, models, status}>
 *     Keys: "combo:<name>:<ts>", "single:<ts>:<counter>"
 *
 * Pattern recognition reuses what EnhancedConsoleLog.jsx already parses.
 *
 * Race fix (PR #72 review): a previous version used `lastRunning()` which
 * could mis-attribute a "Trying model i/N" line to the wrong combo when
 * multiple combos run concurrently. This version uses a **scope stack**:
 *   - RE_CHAT_COMBO / RE_FUSION_COMBO → push combo name onto stack
 *   - RE_ALL_FAILED (combo scope only) → pop
 *   - RE_END (single scope) → pop
 *   - RE_TRYING / RE_SUCCEEDED / RE_FAILED_* / RE_THREW → apply to
 *     stack.top() (whichever scope is currently active)
 *
 * Concurrency rule: state assumes ONE log stream per process. Multiple
 * processes / workers each have their own globalThis state — the
 * snapshot is per-process. SSE clients see the snapshot of whichever
 * worker serves them.
 *
 * Garbage collection:
 *   - activeCombos entries are pruned after 5 minutes of inactivity
 *   - activeClients Set is auto-managed by stream route lifecycle
 *
 * State lives in globalThis to survive Next.js hot reload (same pattern
 * as consoleLogBuffer._consoleLogBufferState).
 */

if (!globalThis._diepxuanConsoleLogLiveState) {
  globalThis._diepxuanConsoleLogLiveState = {
    activeClients: new Set(),
    activeCombos: new Map(),
    nextClientId: 1,
    gcTimer: null,
    // Scope stack — names of combos/singles currently being processed.
    // Top of stack = the "current" scope for RE_TRYING/SUCCEEDED/FAILED.
    scopeStack: [],
  };
}

const state = globalThis._diepxuanConsoleLogLiveState;

// GC: prune activeCombos entries older than TTL
const GC_INTERVAL_MS = 30_000;
const ENTRY_TTL_MS = 5 * 60 * 1000;

function ensureGc() {
  if (state.gcTimer) return;
  state.gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of state.activeCombos) {
      if (entry.completedAt && now - entry.completedAt > ENTRY_TTL_MS) {
        state.activeCombos.delete(key);
      }
    }
  }, GC_INTERVAL_MS);
  state.gcTimer.unref?.();
}

// ── Active clients tracking ──────────────────────────────────────────
export function registerClient() {
  ensureGc();
  const id = `cli-${state.nextClientId++}`;
  state.activeClients.add(id);
  return id;
}

export function unregisterClient(id) {
  state.activeClients.delete(id);
}

export function getActiveClientCount() {
  return state.activeClients.size;
}

// ── Log line parsing (high-frequency; must be cheap) ─────────────────
//
// Recognised patterns (must match production log format):
//   [12:34:51] [INFO] [CHAT] Combo "name" with N models (strategy: ...)
//   [12:34:51] [INFO] [TTS] Combo "name" with N models ...
//   [12:34:51] [INFO] [IMAGE] Combo "name" with N models ...
//   [12:34:51] [INFO] [FUSION] Combo "name" | panel=N [...]
//   [12:34:51] [INFO] POST /v1/...                 (single request start)
//   [12:34:51] [INFO] [COMBO] Trying model i/N: provider/model
//   [12:34:51] [INFO] [COMBO] Model X succeeded
//   [12:34:51] [WARN] [COMBO] Model X failed, trying next
//   [12:34:51] [WARN] [COMBO] Model X failed (no fallback)
//   [12:34:51] [WARN] [COMBO] Model X threw error, trying next
//   [12:34:51] [WARN] [COMBO] All models failed | ...
//   [12:34:51] [INFO] [PENDING] END                (single request end)

const RE_CHAT_COMBO = /\[(?:CHAT|TTS|IMAGE)\]\s+Combo "([^"]+)"\s+with\s+(\d+)\s+models?/;
const RE_FUSION_COMBO = /\[FUSION\]\s+Combo "([^"]+)"/;
const RE_SINGLE_START = /POST\s+\/v\d+\//;
const RE_TRYING = /\[COMBO\]\s+Trying model\s+\d+\/(\d+):\s+(.+)/;
const RE_SUCCEEDED = /\[COMBO\]\s+Model\s+(.+?)\s+succeeded/;
const RE_FAILED_TRYING = /\[COMBO\]\s+Model\s+(.+?)\s+failed, trying next/;
const RE_FAILED_NO_FALLBACK = /\[COMBO\]\s+Model\s+(.+?)\s+failed \(no fallback\)/;
const RE_THREW = /\[COMBO\]\s+Model\s+(.+?)\s+threw error, trying next/;
const RE_ALL_FAILED = /\[COMBO\]\s+All models failed/;
const RE_END = /\[PENDING\]\s+END/;
const RE_TS = /^\[(\d{2}:\d{2}:\d{2})\]/;

function ts(line) {
  const m = line.match(RE_TS);
  return m ? m[1] : null;
}

function newKey(prefix, tsLabel) {
  return `${prefix}:${tsLabel || "?"}:${state.activeCombos.size}:${Date.now() % 100000}`;
}

function getEntryByKey(key) {
  return state.activeCombos.get(key);
}

function topEntry() {
  // Walk scope stack top-down until we find an entry that still exists
  for (let i = state.scopeStack.length - 1; i >= 0; i--) {
    const entry = state.activeCombos.get(state.scopeStack[i]);
    if (entry && entry.status === "running" && !entry.completedAt) return entry;
  }
  return null;
}

function markModel(entry, name, status) {
  let target = entry.models.find((m) => m.name === name);
  if (!target) {
    target = [...entry.models].reverse().find((m) => m.status === "trying");
    if (target) target.name = name;
  }
  if (target) target.status = status;
}

export function parseLineForLive(line) {
  ensureGc();

  // ── Combo start (CHAT/TTS/IMAGE) ──────────────────────────────────
  let m = line.match(RE_CHAT_COMBO);
  if (m) {
    const [, name, totalStr] = m;
    const total = parseInt(totalStr, 10);
    const key = newKey("combo:" + name, ts(line));
    if (!state.activeCombos.has(key)) {
      // diepxuan: requestId groups nested combos under the same top-level request.
      // First entry pushed to an empty stack is the root; nested entries inherit root.key.
      const requestId = state.scopeStack.length === 0 ? key : state.scopeStack[0];
      state.activeCombos.set(key, {
        key,
        kind: "combo",
        name,
        startedAt: Date.now(),
        startTime: ts(line),
        totalModels: total,
        models: [],
        status: "running",
        completedAt: null,
        requestId,
      });
      state.scopeStack.push(key);
    }
    return;
  }

  // ── Fusion combo start ────────────────────────────────────────────
  m = line.match(RE_FUSION_COMBO);
  if (m) {
    const [, name] = m;
    const key = newKey("combo:" + name, ts(line));
    if (!state.activeCombos.has(key)) {
      const requestId = state.scopeStack.length === 0 ? key : state.scopeStack[0];
      state.activeCombos.set(key, {
        key,
        kind: "combo",
        name,
        startedAt: Date.now(),
        startTime: ts(line),
        totalModels: 0,
        models: [],
        status: "running",
        completedAt: null,
        requestId,
      });
      state.scopeStack.push(key);
    }
    return;
  }

  // ── Single request start ──────────────────────────────────────────
  m = line.match(RE_SINGLE_START);
  if (m) {
    const key = newKey("single", ts(line));
    if (!state.activeCombos.has(key)) {
      const requestId = state.scopeStack.length === 0 ? key : state.scopeStack[0];
      state.activeCombos.set(key, {
        key,
        kind: "single",
        name: null,
        startedAt: Date.now(),
        startTime: ts(line),
        totalModels: 1,
        models: [],
        status: "running",
        completedAt: null,
        requestId,
      });
      state.scopeStack.push(key);
    }
    return;
  }

  // ── Trying model i/N — apply to current scope ─────────────────────
  m = line.match(RE_TRYING);
  if (m) {
    const [, , modelStr] = m;
    const entry = topEntry();
    if (entry) {
      entry.models.push({
        name: modelStr.trim(),
        status: "trying",
        time: ts(line),
      });
    }
    return;
  }

  // ── Model succeeded ───────────────────────────────────────────────
  m = line.match(RE_SUCCEEDED);
  if (m) {
    const [, modelStr] = m;
    const entry = topEntry();
    if (entry) {
      markModel(entry, modelStr.trim(), "success");
      // Combo: success ends the chain
      if (entry.kind === "combo") {
        entry.status = "success";
        entry.completedAt = Date.now();
        // Pop from stack
        const idx = state.scopeStack.lastIndexOf(entry.key);
        if (idx >= 0) state.scopeStack.splice(idx, 1);
      }
    }
    return;
  }

  // ── Model failed (try-next / no-fallback / threw) ─────────────────
  m = line.match(RE_FAILED_TRYING) || line.match(RE_FAILED_NO_FALLBACK) || line.match(RE_THREW);
  if (m) {
    const [, modelStr] = m;
    const entry = topEntry();
    if (entry) {
      const status = line.includes("no fallback") ? "failed_final" : "failed";
      markModel(entry, modelStr.trim(), status);
      // If "no fallback", combo is exhausted on this model
      if (status === "failed_final") {
        entry.completedAt = Date.now();
      }
    }
    return;
  }

  // ── All models failed — combo scope only ──────────────────────────
  if (RE_ALL_FAILED.test(line)) {
    const entry = topEntry();
    if (entry && entry.kind === "combo") {
      entry.status = "failed";
      entry.completedAt = Date.now();
      const idx = state.scopeStack.lastIndexOf(entry.key);
      if (idx >= 0) state.scopeStack.splice(idx, 1);
    }
    return;
  }

  // ── End of request (PENDING END) — single scope only ──────────────
  if (RE_END.test(line)) {
    const entry = topEntry();
    if (entry && entry.kind === "single") {
      if (entry.status === "running") entry.status = "success";
      entry.completedAt = Date.now();
      const idx = state.scopeStack.lastIndexOf(entry.key);
      if (idx >= 0) state.scopeStack.splice(idx, 1);
    }
    return;
  }
}

// ── Snapshot ─────────────────────────────────────────────────────────
export function getLiveSnapshot() {
  const entries = [];
  const all = Array.from(state.activeCombos.values());
  const active = all.filter((e) => !e.completedAt).sort((a, b) => b.startedAt - a.startedAt);
  const done = all.filter((e) => e.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 1000);
  entries.push(...active, ...done);

  let activeCombos = 0;
  let activeSingles = 0;
  for (const e of active) {
    if (e.kind === "combo") activeCombos++;
    else if (e.kind === "single") activeSingles++;
  }

  return {
    clientCount: state.activeClients.size,
    activeCombos,
    activeSingles,
    entries,
  };
}

// Test-only helper: reset state between test cases
export function _resetForTests() {
  state.activeClients.clear();
  state.activeCombos.clear();
  state.scopeStack.length = 0;
  state.nextClientId = 1;
}
