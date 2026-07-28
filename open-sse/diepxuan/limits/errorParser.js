/**
 * DiepXuan fork-layer: extract rate-limit hints from upstream 429 responses.
 *
 * Pure functions — no side effects, no I/O. PR #59 only adds and tests these
 * helpers; the executor wiring (BaseExecutor.parseError hook) is added in
 * PR #60. This keeps PR #59 behaviour-neutral.
 *
 * Sources covered (tested patterns):
 *   - OpenAI:   `x-ratelimit-limit-requests` / `x-ratelimit-limit-tokens` headers
 *   - Anthropic: `anthropic-ratelimit-requests-limit` / `-tokens-limit` headers
 *   - NVIDIA:   body "Requests limit = 40 / minute" or "40 requests per minute"
 *   - Generic:  "1,000,000 tokens per minute" or "100/day"
 *   - Mistral:  body "usage": { "tokens_per_minute_limit": ... } (regex fallback)
 *
 * Reference: docs/UPDATE-2026-07-28.md (ADR-007) §2.4.
 */

/**
 * Try to read a header case-insensitively.
 * @param {Record<string,string|string[]|undefined>|null|undefined} headers
 * @param {string} name
 */
function header(headers, name) {
  if (!headers) return undefined;
  if (headers[name] != null) {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  }
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

const HEADER_PATTERNS = [
  // OpenAI / OpenAI-compatible
  { header: "x-ratelimit-limit-requests", map: (v) => ({ rpm: parseInt(String(v).replace(/[,_]/g, ""), 10) || undefined }) },
  { header: "x-ratelimit-limit-tokens",    map: (v) => ({ tpm: parseInt(String(v).replace(/[,_]/g, ""), 10) || undefined }) },
  // Anthropic
  { header: "anthropic-ratelimit-requests-limit", map: (v) => ({ rpm: parseInt(String(v).replace(/[,_]/g, ""), 10) || undefined }) },
  { header: "anthropic-ratelimit-tokens-limit",    map: (v) => ({ tpm: parseInt(String(v).replace(/[,_]/g, ""), 10) || undefined }) },
];

const BODY_PATTERNS = [
  // NVIDIA: "Requests limit = 40 / minute" or "Tokens limit = 1000000 / minute"
  { regex: /(?:requests?|tokens?)\s*limit\s*[=:]\s*([\d,_]+)\s*\/\s*(minute|min|hour|day)/gi,
    map: (m) => {
      const n = parseInt(m[1].replace(/[,_]/g, ""), 10);
      if (!Number.isFinite(n) || n <= 0) return {};
      const unit = m[2].toLowerCase();
      if (m[0].toLowerCase().startsWith("token")) {
        return unit.startsWith("min") ? { tpm: n } : unit.startsWith("hour") ? { tph: n } : { tpd: n };
      }
      return unit.startsWith("min") ? { rpm: n } : unit.startsWith("hour") ? { rph: n } : { rpd: n };
    } },
  // "40 requests per minute" / "1,000,000 tokens per day"
  { regex: /([\d,_]+)\s*(requests?|tokens?)\s*per\s*(minute|min|hour|day)/gi,
    map: (m) => {
      const n = parseInt(m[1].replace(/[,_]/g, ""), 10);
      if (!Number.isFinite(n) || n <= 0) return {};
      const kind = m[2].toLowerCase();
      const unit = m[3].toLowerCase();
      if (kind.startsWith("token")) {
        return unit.startsWith("min") ? { tpm: n } : unit.startsWith("hour") ? { tph: n } : { tpd: n };
      }
      return unit.startsWith("min") ? { rpm: n } : unit.startsWith("hour") ? { rph: n } : { rpd: n };
    } },
  // "usage_limit": { "requests_per_minute": 40 }
  { regex: /"(requests|tokens)_per_(minute|hour|day)"\s*:\s*([\d_]+)/gi,
    map: (m) => {
      const n = parseInt(m[3].replace(/[,_]/g, ""), 10);
      if (!Number.isFinite(n) || n <= 0) return {};
      const kind = m[1].toLowerCase();
      const unit = m[2].toLowerCase();
      if (kind.startsWith("token")) {
        return unit === "minute" ? { tpm: n } : unit === "hour" ? { tph: n } : { tpd: n };
      }
      return unit === "minute" ? { rpm: n } : unit === "hour" ? { rph: n } : { rpd: n };
    } },
];

/**
 * Extract rate-limit hints from a 429 response.
 *
 * @param {object} args
 * @param {number} args.status            - HTTP status (only 429 / 403 considered).
 * @param {Record<string,string|string[]>|null|undefined} [args.headers]
 * @param {string|object|null|undefined} [args.body] - Response body (string or already-parsed JSON).
 * @returns {{ rpm?: number, tpm?: number, rph?: number, rpd?: number, tph?: number, tpd?: number, evidence: string } | null}
 */
export function extractLimitsFromError({ status, headers, body }) {
  if (status !== 429 && status !== 403) return null;

  const found = {};
  const evidenceParts = [];

  for (const p of HEADER_PATTERNS) {
    const v = header(headers, p.header);
    if (v != null) {
      const mapped = p.map(v);
      Object.assign(found, mapped);
      if (Object.values(mapped).some((x) => x != null)) {
        evidenceParts.push(`${p.header}: ${v}`);
      }
    }
  }

  const text = (() => {
    if (body == null) return "";
    if (typeof body === "string") return body.slice(0, 4000);
    try { return JSON.stringify(body).slice(0, 4000); } catch (_) { return String(body).slice(0, 4000); }
  })();

  if (text) {
    for (const p of BODY_PATTERNS) {
      // Each pattern is global; iterate all matches
      const re = new RegExp(p.regex.source, p.regex.flags);
      let m;
      while ((m = re.exec(text)) !== null) {
        const mapped = p.map(m);
        Object.assign(found, mapped);
        evidenceParts.push(m[0]);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }

  // Drop undefined / 0 / negative
  for (const k of Object.keys(found)) {
    const v = found[k];
    if (v == null || !Number.isFinite(v) || v <= 0) delete found[k];
  }

  if (Object.keys(found).length === 0) return null;
  return { ...found, evidence: evidenceParts.join(" | ").slice(0, 500) };
}
