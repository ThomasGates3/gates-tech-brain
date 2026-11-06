/**
 * GET /api/health: public uptime check. Reports only whether Neon answers and whether
 * the daily reply check is still running, so it gives away nothing about the data.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { REPLY_CHECK_KEY } from "@/lib/field/inbound";
import { getSetting } from "@/lib/settings";

// The morning cron runs every day, so a gap past this means the crons have stopped.
const STALE_MS = 30 * 60 * 60 * 1000;

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503, headers });
  }
  const at = (await getSetting(REPLY_CHECK_KEY)) ?? null;
  const stale = Boolean(at && Date.now() - Date.parse(at) > STALE_MS);
  return Response.json({ ok: !stale, db: true, replyCheckAt: at, replyCheckStale: stale }, { status: stale ? 503 : 200, headers });
}
