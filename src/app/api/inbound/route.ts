/**
 * GET /api/inbound — unanswered replies for the dashboard. Same read + classify as
 * brain_inbound (never replies, never suppresses) but without an Activity row, so
 * polling every few minutes doesn't bury real events in the feed.
 */
import { fetchInbound } from "@/lib/field/inbound";

export async function GET() {
  try {
    return Response.json(await fetchInbound({ limit: 25, confirmSuppress: false, by: "dashboard" }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
