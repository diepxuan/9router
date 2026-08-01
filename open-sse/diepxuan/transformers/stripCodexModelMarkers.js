// DiepXuan fork-layer: strip Codex model delimiter markers from conversation
// text so upstream models do not see/echo `]<]modelname[>[`.
//
// Root cause: once a marker leaks into assistant content (e.g. MiniMax
// hallucinating the delimiter), it persists in the client thread and keeps
// being echoed on later turns. Removing it at the proxy breaks the loop.

const MARKER_RE = /\]<\]\s*[\w./-]*\s*\[>(?:\n*\[)*/g;

export function stripCodexModelMarkers(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(MARKER_RE, "");
}

export function stripCodexModelMarkersFromBody(body) {
  if (!body || typeof body !== "object") return body;
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (!msg || typeof msg !== "object") continue;
      if (typeof msg.content === "string") {
        msg.content = stripCodexModelMarkers(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part && typeof part.text === "string") {
            part.text = stripCodexModelMarkers(part.text);
          }
        }
      }
    }
  }
  return body;
}
