/**
 * GET /api/cron/[id] — Vercel Cron hits this to run one automation on schedule.
 * Secured by CRON_SECRET (Vercel sends it as `Authorization: Bearer <CRON_SECRET>`).
 * Fail-closed: rejects unless the secret is set AND matches — so it's never open,
 * even though it bypasses the password gate.
 */
import { sameString } from "@/lib/gate";
import { runAutomation } from "@/lib/automations/runner";
import { getAutomation } from "@/lib/automations/catalog";
import { eveningPings, morningPings } from "@/lib/field/pings";
import { loadPack } from "@/lib/field/actions";
import { fieldEnv, todayIn } from "@/lib/field/config";
import { recordActivity } from "@/lib/activity";
import { checkReplies } from "@/lib/field/inbound";
import { reportError } from "@/lib/notify";

/** Daily Notion pull, run first thing in the morning cron so the briefing counts fresh leads. Never blocks the briefing. */
async function morningNotionPull() {
  if (!fieldEnv.database() || !fieldEnv.notionToken() || !fieldEnv.notionDataSource()) return "skipped";
  try {
    const r = await loadPack("notion", todayIn());
    void recordActivity({ kind: "updated", target: `Notion pack: ${r.added} new, ${r.updated} updated`, because: "Daily scheduled Notion pull", agent: "ace" });
    return r;
  } catch (e) {
    await reportError("Daily Notion pull", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Record replies first, so the briefing and the follow-ups-due ping never count someone who answered. */
async function replyCheck() {
  try {
    return await checkReplies();
  } catch (e) {
    await reportError("Daily reply check", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const maxDuration = 300;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || !sameString(auth ?? "", `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!getAutomation(id)) return new Response(`Unknown automation: ${id}`, { status: 404 });

  const replies = await replyCheck();
  const notion = id === "morning-briefing" ? await morningNotionPull() : undefined;
  const run = await runAutomation(id, {}, "cron");
  if (run.error) await reportError(run.name, run.error);
  // Field pings ride on the two daily crons (each ping can be switched off in Settings).
  if (id === "morning-briefing") await morningPings().catch((e) => reportError("Morning pings", e));
  if (id === "eod-recap") await eveningPings().catch((e) => reportError("Evening pings", e));
  const ok = run.status === "success";
  return Response.json({ ok, id, status: run.status, at: run.ranAt, replies, ...(notion && { notion }) }, { status: ok ? 200 : 500 });
}
