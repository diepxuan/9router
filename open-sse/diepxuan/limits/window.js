/**
 * DiepXuan fork-layer: SlidingWindow helpers built on top of cache.js.
 * PR #61 of ADR-007.
 *
 * Pure functions — they take pre-read events arrays and return numbers.
 * Persistence lives in cache.js. This split keeps the math testable
 * without I/O.
 *
 * Source of truth: docs/UPDATE-2026-07-28.md (ADR-007) §2.6.
 */

/**
 * @typedef {{ts:number, tokens:number}} CounterEvent
 */

/**
 * Count the number of events in the window.
 * @param {CounterEvent[]} events - pre-pruned (only events within windowMs)
 * @returns {number}
 */
export function countEvents(events) {
  return Array.isArray(events) ? events.length : 0;
}

/**
 * Sum tokens across all events in the window.
 * @param {CounterEvent[]} events
 * @returns {number}
 */
export function sumTokens(events) {
  if (!Array.isArray(events) || events.length === 0) return 0;
  let s = 0;
  for (const e of events) {
    if (e && Number.isFinite(e.tokens)) s += e.tokens;
  }
  return s;
}

/**
 * When does the oldest event in the window age out (i.e. when does one
 * slot become free again)? Returns `now` when the window is empty.
 *
 * @param {CounterEvent[]} events
 * @param {number} windowMs
 * @param {number} now
 * @returns {number} epoch-ms
 */
export function oldestAgeOutAt(events, windowMs, now) {
  if (!Array.isArray(events) || events.length === 0) return now;
  let oldest = events[0].ts;
  for (let i = 1; i < events.length; i++) {
    if (events[i].ts < oldest) oldest = events[i].ts;
  }
  return oldest + windowMs;
}

/**
 * Earliest epoch-ms when `countEvents(events) + projectedCount` will be
 * `<= limit` again. With projectedCount=0, this is the time one slot
 * becomes free. With projectedCount=k, it projects when k slots free.
 *
 * @param {CounterEvent[]} events
 * @param {number} windowMs
 * @param {number} now
 * @param {number} projectedCount - how many new events we want to add
 * @returns {number} epoch-ms
 */
export function projectedAgeOutAt(events, windowMs, now, projectedCount) {
  if (!Array.isArray(events) || events.length === 0) return now;
  const limit = Math.max(0, events.length - projectedCount);
  // Sort copy (events should already be in insert order, but defensive)
  const ts = events.map((e) => e.ts).sort((a, b) => a - b);
  if (ts.length <= limit) return now;
  return ts[limit - 1] + windowMs;
}

/**
 * Earliest epoch-ms when sumTokens + projectedTokens <= limit.
 *
 * @param {CounterEvent[]} events
 * @param {number} windowMs
 * @param {number} projectedTokens
 * @returns {number} epoch-ms
 */
export function projectedTokensAgeOutAt(events, windowMs, projectedTokens) {
  if (!Array.isArray(events) || events.length === 0) return Date.now();
  // Walk events from oldest to newest, removing tokens until we have
  // projectedTokens of headroom.
  const sorted = events.slice().sort((a, b) => a.ts - b.ts);
  let remaining = projectedTokens;
  let freedAt = Date.now();
  for (const e of sorted) {
    if (remaining <= 0) return Math.max(freedAt, e.ts + windowMs);
    remaining -= e.tokens;
    freedAt = e.ts + windowMs;
  }
  return freedAt;
}
