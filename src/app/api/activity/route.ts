/**
 * GET /api/activity?limit=20&lookups=0|1 — the activity stream in plain English.
 * Lookups (bots reading status) are hidden unless lookups=1.
 */
import { recentActivity } from "@/lib/activity";
import { humanizeRows } from "@/lib/activity/describe";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const limit = Math.min(200, Number(q.get("limit") ?? 20));
  const lookups = q.get("lookups") === "1";
  // Over-fetch so hiding lookups still fills the list.
  const rows = await humanizeRows(await recentActivity(lookups ? limit : Math.min(300, limit * 4)));
  return Response.json({ activity: (lookups ? rows : rows.filter((r) => !r.lookup)).slice(0, limit) });
}
