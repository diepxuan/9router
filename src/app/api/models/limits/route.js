import { NextResponse } from "next/server";
import { getResolvedLimits } from "open-sse/diepxuan/limits/index.js";
import { getStaticContextLength } from "open-sse/diepxuan/contextLength/index.js";
import { isDiepXuanEnabled } from "@/diepxuan/shared/config/flags.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/models/limits?ids=nvidia/a,b,c
 *
 * Returns resolved rate-limit metadata for a list of model IDs. Source of
 * truth: open-sse/diepxuan/limits/index.js (5-tier precedence). Context
 * window is read from the same source as /api/models/context-lengths so
 * the inferred tier can produce values for any model with a known context.
 *
 * Response shape:
 *   { limits: { "provider/model": { rpm, tpm, rph, rpd, concurrency, policy, source } | null } }
 */
export async function GET(request) {
  if (!isDiepXuanEnabled()) {
    return NextResponse.json({ error: "diepxuan layer disabled" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") || "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ limits: {} });
  }

  const limits = {};
  for (const id of ids) {
    const slash = id.indexOf("/");
    if (slash <= 0 || slash === id.length - 1) {
      limits[id] = null;
      continue;
    }
    const provider = id.slice(0, slash);
    const model = id.slice(slash + 1);
    const contextWindow = getStaticContextLength(id) || null;
    // Resolve without a connection — surface provider/model/inferred tiers.
    // Connection-tier override is intentionally excluded here (the dashboard
    // does not have a stable connectionId for "available models" rows).
    const resolved = getResolvedLimits({ provider, model, contextWindow }) || null;
    limits[id] = resolved;
  }

  return NextResponse.json({ limits });
}
