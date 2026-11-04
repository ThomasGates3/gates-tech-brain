/**
 * GET /api/inbound — unanswered replies for the dashboard. Same read + classify as
 * brain_inbound (never replies, never suppresses) but without an Activity row, so
 * polling every few minutes doesn't bury real events in the feed.
 */
import { z } from "zod";
import { dismissInbound, fetchInbound } from "@/lib/field/inbound";

export async function GET() {
  try {
    return Response.json(await fetchInbound({ limit: 25, confirmSuppress: false, by: "dashboard" }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

/** POST /api/inbound { thread_id, last_at } — X out a reply on the dashboard (hides it; never replies or suppresses). */
export async function POST(req: Request) {
  const p = z.object({ thread_id: z.string().min(1), last_at: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "thread_id and last_at are required" }, { status: 400 });
  await dismissInbound(p.data.thread_id, p.data.last_at);
  return Response.json({ ok: true });
}
