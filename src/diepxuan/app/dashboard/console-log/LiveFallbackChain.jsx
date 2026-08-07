"use client";

import { useState } from "react";

/**
 * DiepXuan fork-layer: live fallback chain visualization.
 *
 * Each entry from the tracker carries a `requestId` — entries sharing the same
 * requestId belong to the same top-level client request (root combo + its
 * nested children). This view collapses each request into a single row so the
 * user sees "one line per client request", and expands nested combos on click.
 *
 * Auto-updates via SSE from /api/diepxuan/console-log/live/stream.
 */
export default function LiveFallbackChain({ entries }) {
  const list = entries || [];
  if (list.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">
        No active combos or singles
      </div>
    );
  }

  // Group entries by requestId. Each group = one top-level client request.
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
function groupByRequestId(entries) {
  const map = new Map();
  for (const e of entries) {
    // Fallback: if entry lacks requestId (legacy snapshot), use its own key
    // so it still renders as its own row instead of being silently dropped.
    const rid = e.requestId || e.key;
    if (!map.has(rid)) {
      map.set(rid, { requestId: rid, root: null, nested: [] });
    }
    const g = map.get(rid);
    if (e.key === rid || !g.root) {
      // Root = entry whose key matches requestId (top-level push)
      g.root = e;
    } else {
      g.nested.push(e);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => (b.root?.startedAt || 0) - (a.root?.startedAt || 0)
  );
}

// ── Per-request row ──────────────────────────────────────────────────
function RequestRow({ group }) {
  const { root, nested } = group;
  const isGrouped = nested.length > 0;
  const [expanded, setExpanded] = useState(false);

  // If the root itself was popped from the stack, fall back to first entry
  // that still has meaningful info.
  const display = root || (nested[0] || {});
  const completed = display.completedAt;
  const isCombo = display.kind === "combo";
  const total = display.totalModels || display.models?.length || 0;
  const models = display.models || [];

  const statusBadge = isCombo
    ? display.status === "success" ? "bg-green-900/50 text-green-300"
    : display.status === "failed" ? "bg-red-900/50 text-red-300"
    : "bg-orange-900/50 text-orange-300"
    : "bg-blue-900/50 text-blue-300";

  const nestedBadge = isGrouped
    ? "bg-purple-900/50 text-purple-300"
    : "bg-gray-800 text-gray-500";

  return (
    <div className={`p-3 rounded-lg border ${completed ? "border-gray-800 opacity-75" : "border-gray-700 bg-gray-900"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
          {isCombo ? "COMBO" : "SINGLE"}
        </span>
        <span className="text-sm font-mono text-gray-200 truncate">
          {display.name || "(unnamed)"}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${nestedBadge}`}>
          {isGrouped ? `×${nested.length + 1} nested` : "×1"}
        </span>
        <span className="text-xs text-gray-500 ml-auto font-mono">
          {display.startTime || "?"}
          {completed ? " ✓" : " ⏳"}
          {total > 0 && ` · ${models.length}/${total}`}
        </span>
        {isGrouped && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
          >
            {expanded ? "▾ hide nested" : "▸ show nested"}
          </button>
        )}
      </div>

      {/* Root chain */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {models.length === 0 ? (
          <span className="text-xs text-gray-500 italic">no models attempted yet</span>
        ) : (
          models.map((m, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <ModelNode model={m} index={i + 1} />
              {i < models.length - 1 && <Arrow />}
            </div>
          ))
        )}
        {models.length === 0 && !completed && (
          <div className="flex items-center gap-1 text-gray-500 text-xs">
            <span className="animate-pulse">⏳</span> starting…
          </div>
        )}
      </div>

      {/* Nested chains (collapsed by default) */}
      {expanded && isGrouped && (
        <div className="mt-2 pl-3 border-l border-gray-700 space-y-2">
          {nested.map((entry, i) => (
            <NestedRow key={entry.key || i} entry={entry} index={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function NestedRow({ entry, index }) {
  const isCombo = entry.kind === "combo";
  const total = entry.totalModels || entry.models?.length || 0;
  const models = entry.models || [];
  const completed = entry.completedAt;
  const statusBadge = isCombo
    ? entry.status === "success" ? "bg-green-900/50 text-green-300"
    : entry.status === "failed" ? "bg-red-900/50 text-red-300"
    : "bg-orange-900/50 text-orange-300"
    : "bg-blue-900/50 text-blue-300";

  return (
    <div className={`p-2 rounded border ${completed ? "border-gray-800" : "border-gray-700 bg-gray-900/50"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-gray-500 font-mono">↳ #{index}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
          {isCombo ? "COMBO" : "SINGLE"}
        </span>
        <span className="text-xs font-mono text-gray-300 truncate">
          {entry.name || "(unnamed)"}
        </span>
        <span className="text-[10px] text-gray-500 ml-auto font-mono">
          {entry.startTime || "?"}{completed ? " ✓" : " ⏳"}
          {total > 0 && ` · ${models.length}/${total}`}
        </span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {models.length === 0 ? (
          <span className="text-[10px] text-gray-500 italic">no models attempted yet</span>
        ) : (
          models.map((m, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <ModelNode model={m} index={i + 1} compact />
              {i < models.length - 1 && <Arrow />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ModelNode({ model, index, compact = false }) {
  const statusStyle =
    model.status === "success" ? "border-green-500 bg-green-950/40"
    : model.status === "failed" || model.status === "failed_final" ? "border-red-500 bg-red-950/40"
    : model.status === "trying" ? "border-yellow-500 bg-yellow-950/30 animate-pulse"
    : "border-gray-600 bg-gray-800";
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
  const display = String(model.name || "").split("/").pop() || model.name;
  const widthCls = compact ? "w-20" : "w-24";
  return (
    <div className={`${widthCls} p-1.5 rounded border ${statusStyle}`}>
      <div className="text-[10px] text-gray-500 text-center">#{index}</div>
      <div className="text-[10px] truncate text-center font-mono">{display}</div>
      <div className={`text-center text-sm ${iconColor}`}>{icon}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-600 text-xs">→</span>;
}
