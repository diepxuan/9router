// Drop 2 rate-limit tables leaked from the removed ADR-007 throttle engine
// (PR #68 squash 5f25a49). They were created by code that no longer exists
// in the fork, so dropping them is safe (schema auto-sync in schema.js does
// NOT create them — see TABLES map). Auto-sync only adds missing tables/cols,
// so once dropped these tables stay gone.
//
// Safe to drop because:
//   - open-sse/diepxuan/limits/ is removed in PR #68
//   - No code anywhere references these table names (rg confirms empty)
//   - Schema.js TABLES map never declared them, so they only existed as
//     orphan artifacts from prior dev runs that called initAutoDiscovered
//     LimitsTable / initRateLimitCountersTable before that code was removed.

export default {
  version: 2,
  name: "drop-rate-limit-tables",
  up(db) {
    // IF EXISTS guards so the migration is idempotent on fresh DBs / re-runs.
    db.exec("DROP TABLE IF EXISTS rate_limit_counters_diepxuan");
    db.exec("DROP TABLE IF EXISTS auto_discovered_limits_diepxuan");
  },
};
