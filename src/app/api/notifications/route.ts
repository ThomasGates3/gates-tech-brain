/**
 * Discord ping settings. GET → list with on/off. POST { id, on } toggles (Thomas only).
 * POST { test: true } sends a test ping to Discord.
 */
import { z } from "zod";
import { NOTIFICATIONS, notificationSettings, notifyOnce, setNotify } from "@/lib/notify";
import { isThomasSession } from "@/lib/session";

export async function GET() {
  return Response.json({ notifications: await notificationSettings(), discord: Boolean(process.env.DISCORD_WEBHOOK_URL) });
}

const Body = z.union([
  z.object({ id: z.enum(NOTIFICATIONS.map((n) => n.id) as [string, ...string[]]), on: z.boolean() }),
  z.object({ test: z.literal(true) }),
]);

export async function POST(req: Request) {
  if (!(await isThomasSession())) return Response.json({ ok: false, error: "Only Thomas can change notifications." }, { status: 403 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "Expected { id, on } or { test: true }." }, { status: 400 });
  if ("test" in p.data) {
    const sent = await notifyOnce("emails_done", `test_${Date.now()}`, "Test ping from the Brain", "If you can read this, Discord pings are working.", { force: true });
    return Response.json({ ok: sent });
  }
  await setNotify(p.data.id as (typeof NOTIFICATIONS)[number]["id"], p.data.on);
  return Response.json({ ok: true, notifications: await notificationSettings() });
}
