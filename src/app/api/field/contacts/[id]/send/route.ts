/**
 * POST /api/field/contacts/:id/send { confirm: true, draftHash } — send ONE Email 1.
 * Greenlighter only (Thomas, or Ace with FIELD_ACE_CAN_SEND=true), after Approve,
 * for the exact draft that was approved. One contact per call; no batch or autopilot.
 */
import { z } from "zod";
import { error, json, requireOperator } from "@/lib/field/api";
import { sendContact } from "@/lib/field/actions";

export const maxDuration = 30;

const Body = z.object({ confirm: z.literal(true), draftHash: z.string().min(8).max(64) });

export async function POST(req: Request, ctx: RouteContext<"/api/field/contacts/[id]/send">) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, "Explicit confirmation required: { confirm: true, draftHash }.");
  const r = await sendContact(id, parsed.data.draftHash, auth.operator);
  return r.ok ? json({ ok: true, ...r.data }) : error(r.status, r.error);
}
