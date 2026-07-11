/**
 * GET /api/activity?limit=20 — the persisted activity stream for the deck.
 */
import { recentActivity } from "@/lib/activity";

export async function GET(req: Request) {
  const limit = Math.min(50, Number(new URL(req.url).searchParams.get("limit") ?? 20));
  const items = await recentActivity(limit);
  return Response.json({ activity: items });
}
