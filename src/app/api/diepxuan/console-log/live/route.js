import { getLiveSnapshot } from "@/diepxuan/lib/consoleLogLiveTracker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = getLiveSnapshot();
    return Response.json({ success: true, ...snapshot });
  } catch (error) {
    console.error("Error getting live console log snapshot:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
