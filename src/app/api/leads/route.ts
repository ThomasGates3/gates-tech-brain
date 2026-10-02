/** GET /api/leads?date=&lane=&status=&tier= — the Control Center board (same data as brain_today.leads). */
import { z } from "zod";
import { leadsFor, EMAIL1_STATUSES } from "@/lib/field/leads";
import { sentSince } from "@/lib/field/store";
import { startOfTodayIso } from "@/lib/field/config";

const Q = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lane: z.enum(["core", "website"]).optional(),
  status: z.enum(EMAIL1_STATUSES).optional(),
  tier: z.enum(["High", "Med", "Soft"]).optional(),
});

export async function GET(req: Request) {
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return Response.json({ error: "Bad filter" }, { status: 400 });
  try {
    const [l, sentToday] = await Promise.all([leadsFor(p.data), sentSince(startOfTodayIso()).catch(() => 0)]);
    return Response.json({ ...l, sentToday });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
