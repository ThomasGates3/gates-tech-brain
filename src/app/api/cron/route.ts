/**
 * GET /api/cron — invoked by Vercel Cron. Runs any scheduled jobs that are due.
 * Protect with CRON_SECRET (Vercel sets the Authorization header automatically).
 * Configure the schedule in vercel.ts (e.g. every minute or every 15 min).
 */
import { runDueJobs } from "@/lib/scheduler/trigger";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Fail-closed: this route bypasses the password gate, so require the secret.
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runDueJobs();
  return Response.json({ ok: true, ...result, at: new Date().toISOString() });
}
