import { getConsoleLogs, getConsoleEmitter, initConsoleLogCapture } from "@/lib/consoleLogBuffer";
// diepxuan: track SSE client connections for dashboard Console Log live counter (PR #72).
import { registerClient, unregisterClient } from "@/diepxuan/lib/consoleLogLiveTracker.js";

export const dynamic = "force-dynamic";

initConsoleLogCapture();

export async function GET(request) {
  const encoder = new TextEncoder();
  const emitter = getConsoleEmitter();
  const state = { closed: false, send: null, sendLines: null, sendClear: null, keepalive: null, clientId: null };

  // Idempotent: safe to call from request.signal abort, cancel(), or enqueue failure.
  const cleanup = () => {
    if (state.closed) return;
    state.closed = true;
    // diepxuan: drop this client from the live counter (PR #72).
    if (state.clientId) { unregisterClient(state.clientId); state.clientId = null; }
    if (state.send) emitter.off("line", state.send);
    if (state.sendLines) emitter.off("lines", state.sendLines);
    if (state.sendClear) emitter.off("clear", state.sendClear);
    if (state.keepalive) clearInterval(state.keepalive);
  };

  // request.signal fires reliably on client disconnect; ReadableStream.cancel()
  // is not always invoked in Next.js, which caused listeners to accumulate.
  request.signal.addEventListener("abort", cleanup, { once: true });

  const stream = new ReadableStream({
    start(controller) {
      // diepxuan: register this SSE client for the live counter (PR #72).
      state.clientId = registerClient();
      // Send all buffered logs immediately on connect
      const buffered = getConsoleLogs();
      if (buffered.length > 0) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "init", logs: buffered })}\n\n`));
      }

      // Push new lines as they arrive
      state.send = (line) => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "line", line })}\n\n`));
        } catch {
          cleanup();
        }
      };

      state.sendLines = (lines) => {
        if (state.closed || !Array.isArray(lines) || lines.length === 0) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "lines", lines })}\n\n`));
        } catch {
          cleanup();
        }
      };

      // Notify client when cleared
      state.sendClear = () => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "clear" })}\n\n`));
        } catch {
          cleanup();
        }
      };

      emitter.on("line", state.send);
      emitter.on("lines", state.sendLines);
      emitter.on("clear", state.sendClear);

      // Keepalive ping every 25s
      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 25000);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
