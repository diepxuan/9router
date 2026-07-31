import { NextResponse } from "next/server";
import { getContextLengthBatchCached, getStaticContextLength } from "open-sse/diepxuan/contextLength/index.js";
import { isDiepXuanEnabled } from "@/diepxuan/shared/config/flags.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/models/context-lengths?ids=nvidia/a,b,c
 *
 * Returns context_length for a list of model IDs using the same
 * contextLength system as combos (/api/v1/models enrichment).
 */
export async function GET(request) {
  if (!isDiepXuanEnabled()) {
    return NextResponse.json({ error: "diepxuan layer disabled" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") || "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ contextLengths: {} });
  }

  const cache = getContextLengthBatchCached(ids);
  const contextLengths = {};
  for (const id of ids) {
    const cached = cache.get(id);
    contextLengths[id] = cached?.contextLength || getStaticContextLength(id) || null;
  }

  return NextResponse.json({ contextLengths });
}
