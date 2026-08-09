import { NextResponse } from "next/server";
import { getContextLengthBatchCached, getStaticContextLength } from "open-sse/diepxuan/contextLength/index.js";
import { getCombos, createCombo, getComboByName } from "@/lib/localDb";
import { DEFAULT_COMBO_NAME, ensureDefaultCombo, getCombosWithDefaultFirst } from "@/diepxuan/lib/defaultCombo.js";

export const dynamic = "force-dynamic";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// GET /api/combos - Get all combos
// diepxuan: enrich model list with runtime context length
  function enrichModels(models) {
    if (!Array.isArray(models) || models.length === 0) return [];
    const ctxMap = getContextLengthBatchCached(models);
    return models.map(m => ({
      id: m,
      context_length: ctxMap.get(m)?.contextLength || getStaticContextLength(m) || null,
    }));
  }
export async function GET() {
  try {
    const combos = await getCombosWithDefaultFirst();
    return NextResponse.json({ combos: combos.map(c => ({ ...c, modelContexts: enrichModels(c.models) })) });
  } catch (error) {
    console.log("Error fetching combos:", error);
    return NextResponse.json({ error: "Failed to fetch combos" }, { status: 500 });
  }
}

// POST /api/combos - Create new combo
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, models, kind } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate name format
    if (!VALID_NAME_REGEX.test(name)) {
      return NextResponse.json({ error: "Name can only contain letters, numbers, -, _ and ." }, { status: 400 });
    }

    // The default combo is reserved: create/ensure it from source, then return it.
    if (name === DEFAULT_COMBO_NAME) {
      const existing = await ensureDefaultCombo();
      if (existing) return NextResponse.json(existing, { status: 200 });
      return NextResponse.json({ error: "Default combo is unavailable" }, { status: 500 });
    }

    // Check if name already exists
    const existing = await getComboByName(name);
    if (existing) {
      return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
    }

    const combo = await createCombo({ name, models: models || [], kind: kind || null });

    return NextResponse.json(combo, { status: 201 });
  } catch (error) {
    console.log("Error creating combo:", error);
    return NextResponse.json({ error: "Failed to create combo" }, { status: 500 });
  }
}
