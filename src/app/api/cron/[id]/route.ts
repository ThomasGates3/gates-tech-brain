/**
 * GET /api/cron/[id] — Vercel Cron hits this to run one automation on schedule.
 * Secured by CRON_SECRET (Vercel sends it as `Authorization: Bearer <CRON_SECRET>`).
 * Fail-closed: rejects unless the secret is set AND matches — so it's never open,
 * even though it bypasses the password gate.
 */
import { runAutomation } from "@/lib/automations/runner";
import { getAutomation } from "@/lib/automations/catalog";

export const maxDuration = 300;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!getAutomation(id)) return new Response(`Unknown automation: ${id}`, { status: 404 });

  const run = await runAutomation(id, {}, "cron");
  return Response.json({ ok: run.status === "success", id, status: run.status, at: run.ranAt });
}
