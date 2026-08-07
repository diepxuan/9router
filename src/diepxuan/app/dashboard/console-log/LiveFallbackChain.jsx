"use client";

/**
 * DiepXuan fork-layer: live fallback chain visualization.
 * Renders each active combo as a horizontal chain of model attempts.
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
  return (
    <div className="space-y-3">
      {list.map((entry, i) => (
        <ChainRow key={i} entry={entry} />
      ))}
    </div>
  );
}

function ChainRow({ entry }) {
  const isCombo = entry.kind === "combo";
  const total = entry.totalModels || entry.models?.length || 0;
  const completed = entry.completedAt;
  const statusBadge = isCombo
    ? entry.status === "success" ? "bg-green-900/50 text-green-300"
      : entry.status === "failed" ? "bg-red-900/50 text-red-300"
      : "bg-orange-900/50 text-orange-300"
    : "bg-blue-900/50 text-blue-300";

  return (
    <div className={`p-3 rounded-lg border ${completed ? "border-gray-800 opacity-75" : "border-gray-700 bg-gray-900"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
          {isCombo ? "COMBO" : "SINGLE"}
        </span>
        <span className="text-sm font-mono text-gray-200 truncate">
          {entry.name || "(unnamed)"}
        </span>
        <span className="text-xs text-gray-500 ml-auto font-mono">
          {entry.startTime || "?"}
          {completed ? " ✓" : " ⏳"}
          {total > 0 && ` · ${entry.models?.length || 0}/${total}`}
        </span>
      </div>

      {/* Fallback chain */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {(entry.models || []).length === 0 ? (
          <span className="text-xs text-gray-500 italic">no models attempted yet</span>
        ) : (
          entry.models.map((m, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <ModelNode model={m} index={i + 1} />
              {i < entry.models.length - 1 && <Arrow />}
            </div>
          ))
        )}
        {/* If no attempts yet and entry still running, show spinner placeholder */}
        {(entry.models || []).length === 0 && !completed && (
          <div className="flex items-center gap-1 text-gray-500 text-xs">
            <span className="animate-pulse">⏳</span> starting…
          </div>
        )}
      </div>
    </div>
  );
}

function ModelNode({ model, index }) {
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
  return (
    <div className={`w-24 p-1.5 rounded border ${statusStyle}`}>
      <div className="text-[10px] text-gray-500 text-center">#{index}</div>
      <div className="text-[10px] truncate text-center font-mono">{display}</div>
      <div className={`text-center text-sm ${iconColor}`}>{icon}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-600 text-xs">→</span>;
}
