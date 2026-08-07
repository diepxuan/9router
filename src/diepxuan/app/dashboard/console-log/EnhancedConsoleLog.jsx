"use client";

import { useEffect, useState } from "react";
import { Card } from "@/shared/components";
import LiveConsoleHeader from "./LiveConsoleHeader";
import LiveFallbackChain from "./LiveFallbackChain";

export default function EnhancedConsoleLog() {
  // diepxuan: live activity snapshot from /api/diepxuan/console-log/live/stream
  const [liveSnapshot, setLiveSnapshot] = useState({ clientCount: 0, activeCombos: 0, activeSingles: 0, entries: [] });

  // diepxuan: subscribe to live activity stream for the "nhìn vào là biết" view
  useEffect(() => {
    let cancelled = false;
    let es = null;
    const connect = () => {
      if (cancelled) return;
      es = new EventSource("/api/diepxuan/console-log/live/stream");
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.type === "snapshot") {
            setLiveSnapshot({
              clientCount: msg.clientCount || 0,
              activeCombos: msg.activeCombos || 0,
              activeSingles: msg.activeSingles || 0,
              entries: msg.entries || [],
            });
          }
        } catch (_) {}
      };
      es.onerror = () => {
        if (es) es.close();
        // Auto-reconnect after 3s (Next.js HMR can kill the stream)
        if (!cancelled) setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, []);

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-120px)]">
      {/* live activity header — counts of clients / combos / singles */}
      <LiveConsoleHeader snapshot={liveSnapshot} />
      {/* live entries + fallback chains */}
      <div className="grid grid-cols-1 gap-3 flex-1 min-h-0">
        <Card>
          <div className="px-0 pt-3 pb-2 text-sm font-semibold">LIVE COMBOS & SINGLES</div>
          <div className="px-0 pb-3 overflow-y-auto max-h-[calc(100vh-220px)]">
            <LiveFallbackChain entries={liveSnapshot.entries} />
          </div>
        </Card>
      </div>
    </div>
  );
}
