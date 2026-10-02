/**
 * POST /api/field/contacts/:id — one workflow step on one contact.
 *   { action: "generate", mode: "template" | "claude", model?: "sonnet" | "opus" }  draft Email 1 (Opus = hard drafts)
 *   { action: "save_draft", subject, body }               manual edit (clears Nick PASS / approval)
 *   { action: "submit_nick" }                             mark as waiting on Nick
 *   { action: "nick_verdict", verdict, note }             record Nick PASS / REVISE / KILL
 *   { action: "approve" }                                 greenlight (needs PASS; Thomas, or Ace if FIELD_ACE_CAN_SEND)
 *   { action: "hold" } | { action: "release" }
 * Sending is a separate endpoint (./send) so it can never ride along with another action.
 */
import { error, json, requireOperator } from "@/lib/field/api";
import { contactStep, type StepInput } from "@/lib/field/actions";

export const maxDuration = 60;

export async function POST(req: Request, ctx: RouteContext<"/api/field/contacts/[id]">) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  try {
    const r = await contactStep(id, (await req.json().catch(() => ({}))) as StepInput, auth.operator);
    return r.ok ? json({ ok: true, ...r.data }) : error(r.status, r.error);
  } catch (e) {
    return error(500, e instanceof Error ? e.message : String(e));
  }
}
