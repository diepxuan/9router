"use client";

/**
 * DiepXuan fork-layer: live fallback chain visualization.
 *
 * Each entry from the tracker carries a `requestId` (root = top-level combo
 * pushed onto an empty scope stack; nested = inherit root.key). This view
 * merges all entries sharing the same requestId into ONE single row whose
 * models[] is flattened from root + every nested combo in chronological order.
 *
 * Result: one row per client request with one horizontal model chain. No
 * expansion, no nested recursion, no accordion — just a flat line per request.
 *
 * Sort order (top to bottom):
 *   success (newest first) → running → failed (oldest last)
 *
 * Auto-updates via SSE from /api/diepxuan/console-log/live/stream.
 */
import REGISTRY from "open-sse/providers/registry/index.js";
// diepxuan: provider-id lookup so we only display provider prefix when
// model.name actually has one. Built once at module load.
const PROVIDER_IDS = new Set();
for (const r of REGISTRY) {
  PROVIDER_IDS.add(r.id);
  if (r.alias) PROVIDER_IDS.add(r.alias);
  for (const a of r.aliases || []) PROVIDER_IDS.add(a);
}

export default function LiveFallbackChain({ entries }) {
  const list = entries || [];
  if (list.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">
        No active combos or singles
      </div>
    );
  }

  const groups = groupByRequestId(list);

  return (
    <div className="space-y-3">
      {groups.map((group, i) => (
        <RequestRow key={group.requestId || i} group={group} />
      ))}
    </div>
  );
}

// ── Grouping helper ───────────────────────────────────────────────────
// Roll up status across root + nested entries.
function computeRolledStatus(root, nested) {
  const all = [root, ...nested];
  return all.reduce((acc, e) => {
    if (e.status === "failed" || e.status === "failed_final") return "failed";
    if (acc === "failed") return "failed";
    if (e.completedAt) return acc === "failed" ? "failed" : "success";
    return acc === "success" ? "success" : "running";
  }, "running");
}

function groupByRequestId(entries) {
  const map = new Map();
  for (const e of entries) {
    const rid = e.requestId || e.key;
    if (!map.has(rid)) {
      map.set(rid, { requestId: rid, root: null, nested: [] });
    }
    const g = map.get(rid);
    if (e.key === rid || !g.root) {
      g.root = e;
    } else {
      g.nested.push(e);
    }
  }
  // Sort: newest request first regardless of status (tail -f style).
  return Array.from(map.values()).sort(
    (a, b) => (b.root?.startedAt || 0) - (a.root?.startedAt || 0)
  );
}

// ── Per-request row ───────────────────────────────────────────────────
function RequestRow({ group }) {
  const { root, nested } = group;
  if (!root) return null;

  // Sort nested by startedAt so models appear in chronological order.
  const nestedSorted = [...nested].sort((a, b) => a.startedAt - b.startedAt);

  // Flatten all models from root + nested into one chain.
  // Each model keeps its own status (✓/✗/⏳) and timestamp.
  const flatModels = [];
  for (const entry of [root, ...nestedSorted]) {
    for (const m of (entry.models || [])) {
      flatModels.push(m);
    }
  }

  const rolledStatus = computeRolledStatus(root, nestedSorted);
  const isCombo = root.kind === "combo";
  const totalAttempts = 1 + nestedSorted.length;
  const allCompleted = flatModels.length > 0
    && flatModels.every((m) => m.status === "success" || m.status === "failed" || m.status === "failed_final");

  const statusBadge = isCombo
    ? rolledStatus === "success" ? "bg-green-900/50 text-green-300"
    : rolledStatus === "failed" ? "bg-red-900/50 text-red-300"
    : "bg-orange-900/50 text-orange-300"
    : "bg-blue-900/50 text-blue-300";

  const statusIcon = rolledStatus === "success" ? " ✓"
    : rolledStatus === "failed" ? " ✗"
    : " ⏳";

  return (
    <div className={`p-3 rounded-lg border ${allCompleted ? "border-gray-800 opacity-75" : "border-gray-700 bg-gray-900"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
          {isCombo ? "COMBO" : "SINGLE"}
        </span>
        <span className="text-sm font-mono text-gray-200 truncate">
          {root.name || "(unnamed)"}
        </span>
        <span className="text-xs text-gray-500 ml-auto font-mono">
          {root.startTime || "?"}{statusIcon}
          {flatModels.length > 0 && ` · ${flatModels.length} models`}
          {totalAttempts > 1 && ` · ${totalAttempts} attempts`}
        </span>
      </div>

      {/* Single horizontal chain of all models (root + nested flattened) */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {flatModels.length === 0 ? (
          <span className="text-xs text-gray-500 italic">no models attempted yet</span>
        ) : (
          flatModels.map((m, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <ModelNode model={m} index={i + 1} depth={m.depth ?? 0} />
              {i < flatModels.length - 1 && <Arrow />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ModelNode({ model, index, depth = 0 }) {
  // Status color (green/red/yellow/gray) stays as-is for success/fail/trying.
  // Nested models (depth > 0) get an extra purple left border so users can
  // tell at a glance which models belong to a nested combo without breaking
  // the flat horizontal chain layout.
  const statusStyle =
    model.status === "success" ? (depth > 0 ? "border-green-500 border-l-4 border-l-purple-500 bg-green-950/40" : "border-green-500 bg-green-950/40")
    : model.status === "failed" || model.status === "failed_final" ? (depth > 0 ? "border-red-500 border-l-4 border-l-purple-500 bg-red-950/40" : "border-red-500 bg-red-950/40")
    : model.status === "trying" ? (depth > 0 ? "border-yellow-500 border-l-4 border-l-purple-500 bg-yellow-950/30 animate-pulse" : "border-yellow-500 bg-yellow-950/30 animate-pulse")
    : (depth > 0 ? "border-gray-600 border-l-4 border-l-purple-500 bg-gray-800" : "border-gray-600 bg-gray-800");
  const icon =
    model.status === "success" ? "✓"
    : model.status === "failed" ? "✗"
    : model.status === "failed_final" ? "✗"
    : model.status === "trying" ? "⏳"
    : "○";
  const iconColor =
    model.status === "success" ? "text-green-400"
    : model.status === "failed" || model.status === "failed_final" ? "text-red-400"
    : model.status === "trying" ? "text-yellow-400"
    : "text-gray-400";
  // Provider prefix: only show when model.name is "provider/..." AND the
  // prefix matches a known provider id/alias. Otherwise model.name has no
  // provider context (e.g. combo entry "minimax" without explicit prefix)
  // and we must not invent one. Text only — no icon (keeps the horizontal
  // chain compact at small sizes).
  const rawName = String(model.name || "");
  const parts = rawName.split("/").filter(Boolean);
  const hasProviderPrefix = parts.length > 1 && PROVIDER_IDS.has(parts[0]);
  const providerId = hasProviderPrefix ? parts[0] : "";
  // diepxuan: show only the trailing model slug so the chain stays compact
  // e.g. "nvidia/minimaxai/minimax-m3" -> "nvidia" + "minimax-m3"
  // (full path remains in title for hover tooltip).
  const modelOnly = hasProviderPrefix ? parts[parts.length - 1] : rawName;
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded border ${statusStyle} flex-shrink-0`}>
      <span className="text-[10px] text-gray-500 font-mono">#{index}</span>
      {providerId && (
        <span className="text-[10px] text-gray-400 font-mono truncate max-w-[110px]" title={providerId}>{providerId}</span>
      )}
      <span className="text-xs font-mono truncate" title={rawName}>{modelOnly || rawName}</span>
      <span className={`text-sm ${iconColor}`}>{icon}</span>
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-600 text-xs">→</span>;
}
