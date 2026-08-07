import { getConsoleEmitter } from "@/lib/consoleLogBuffer";
import {
  getLiveSnapshot,
  registerClient,
  unregisterClient,
} from "@/diepxuan/lib/consoleLogLiveTracker";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const encoder = new TextEncoder();
  const emitter = getConsoleEmitter();
  const state = { closed: false, clientId: null, snapshotTimer: null, keepalive: null };

  const cleanup = () => {
    if (state.closed) return;
    state.closed = true;
    if (state.clientId) { unregisterClient(state.clientId); state.clientId = null; }
    if (state.snapshotTimer) clearInterval(state.snapshotTimer);
    if (state.keepalive) clearInterval(state.keepalive);
    emitter.off("line", state.onLine);
    emitter.off("lines", state.onLines);
    emitter.off("clear", state.onClear);
  };

  request.signal.addEventListener("abort", cleanup, { once: true });

  const stream = new ReadableStream({
    start(controller) {
      const safeSend = (payload) => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cleanup();
        }
      };

      // Initial snapshot
      safeSend({ type: "snapshot", ...getLiveSnapshot() });

      // Push snapshot every 1s (catches combo model status transitions
      // that come in faster than the UI can re-poll).
      state.snapshotTimer = setInterval(() => {
        safeSend({ type: "snapshot", ...getLiveSnapshot() });
      }, 1000);
      state.snapshotTimer.unref?.();

      // Also re-snapshot on every new log line (cheap because tracker
      // already parsed the line).
      state.onLine = () => safeSend({ type: "snapshot", ...getLiveSnapshot() });
      state.onLines = () => safeSend({ type: "snapshot", ...getLiveSnapshot() });
      state.onClear = () => safeSend({ type: "snapshot", ...getLiveSnapshot() });
      emitter.on("line", state.onLine);
      emitter.on("lines", state.onLines);
      emitter.on("clear", state.onClear);

      // Track this client
      state.clientId = registerClient();

      // Keepalive
      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try { controller.enqueue(encoder.encode(": ping\n\n")); }
        catch { cleanup(); }
      }, 25000);
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
