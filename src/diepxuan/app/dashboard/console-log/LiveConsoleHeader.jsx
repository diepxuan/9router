"use client";

/**
 * DiepXuan fork-layer: live console activity header.
 * Shows at-a-glance counts of active SSE clients, running combos,
 * and running single requests. Auto-updates via SSE.
 */
import { useEffect, useState } from "react";

export default function LiveConsoleHeader({ snapshot }) {
  const { clientCount, activeCombos, activeSingles } = snapshot || {};
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg mb-3 text-xs flex-wrap">
      <StatBadge
        color="green"
        icon="🟢"
        label="clients"
        value={clientCount ?? 0}
        pulse={clientCount > 0}
      />
      <StatBadge
        color="orange"
        icon="🔥"
        label="combos"
        value={activeCombos ?? 0}
      />
      <StatBadge
        color="blue"
        icon="📊"
        label="singles"
        value={activeSingles ?? 0}
      />
      <div className="ml-auto text-gray-500 font-mono">
        {new Date().toLocaleTimeString("vi-VN", { hour12: false })}
      </div>
    </div>
  );
}

function StatBadge({ color, icon, label, value, pulse }) {
  const colorMap = {
    green: "border-green-700 bg-green-950/30 text-green-300",
    orange: "border-orange-700 bg-orange-950/30 text-orange-300",
    blue: "border-blue-700 bg-blue-950/30 text-blue-300",
  };
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 border rounded ${colorMap[color]}`}>
      <span className={pulse ? "animate-pulse" : ""}>{icon}</span>
      <span className="font-bold">{value}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}
