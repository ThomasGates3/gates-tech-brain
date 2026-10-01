/**
 * GET  /api/field/log — send log + suppression list.
 * POST /api/field/log { email, reason } — add a suppression (opt-out reply, bounce, manual).
 */
import { z } from "zod";
import { error, json, requireOperator } from "@/lib/field/api";
import { addSuppression, listLog, listSuppressions } from "@/lib/field/store";

export async function GET() {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  try {
    return json({ log: await listLog(), suppressions: await listSuppressions() });
  } catch (e) {
    return error(500, e instanceof Error ? e.message : String(e));
  }
}

const Body = z.object({ email: z.email().max(320), reason: z.enum(["opt_out", "bounce", "manual"]) });

export async function POST(req: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, "Expected { email, reason: opt_out | bounce | manual }.");
  try {
    await addSuppression(parsed.data.email, parsed.data.reason, auth.operator);
    return json({ ok: true });
  } catch (e) {
    return error(500, e instanceof Error ? e.message : String(e));
  }
}
