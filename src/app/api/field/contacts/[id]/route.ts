/**
 * POST /api/field/contacts/:id — one workflow step on one contact.
 *   { action: "generate", mode: "template" | "claude" }   draft Email 1 (Field playbook)
 *   { action: "save_draft", subject, body }               manual edit (clears Nick PASS / approval)
 *   { action: "submit_nick" }                             mark as waiting on Nick
 *   { action: "nick_verdict", verdict, note }             record Nick PASS / REVISE / KILL
 *   { action: "approve" }                                 greenlight (needs PASS; Thomas, or Ace if FIELD_ACE_CAN_SEND)
 *   { action: "hold" } | { action: "release" }
 * Sending is a separate endpoint (./send) so it can never ride along with another action.
 */
import { generateText, gateway, Output } from "ai";
import { z } from "zod";
import { error, json, requireOperator, syncNotion, type SyncResult } from "@/lib/field/api";
import { fieldEnv } from "@/lib/field/config";
import { lintPrices } from "@/lib/field/lint";
import { PLAYBOOK_SYSTEM, playbookPrompt, templateDraft, type Draft } from "@/lib/field/playbook";
import { getContact, isSuppressed, patchContact } from "@/lib/field/store";
import { apply, type Action } from "@/lib/field/workflow";
import { conductorModel } from "@/lib/models";
import { resolveModelTier } from "@/lib/settings";
import { recordUsage } from "@/lib/usage";
import { recordActivity } from "@/lib/activity";
import type { FieldContact } from "@/lib/field/types";

export const maxDuration = 60;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), mode: z.enum(["template", "claude"]) }),
  z.object({ action: z.literal("save_draft"), subject: z.string().max(200), body: z.string().max(5000) }),
  z.object({ action: z.literal("submit_nick") }),
  z.object({ action: z.literal("nick_verdict"), verdict: z.enum(["PASS", "REVISE", "KILL"]), note: z.string().max(2000).default("") }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("hold") }),
  z.object({ action: z.literal("release") }),
]);

async function claudeDraft(c: FieldContact): Promise<Draft> {
  const model = conductorModel(await resolveModelTier());
  const started = Date.now();
  const r = await generateText({
    model: gateway(model),
    system: PLAYBOOK_SYSTEM,
    prompt: playbookPrompt(c, fieldEnv.signer()),
    output: Output.object({ schema: z.object({ subject: z.string(), body: z.string() }) }),
  });
  void recordUsage({ model, inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens, latencyMs: Date.now() - started, source: "automation" });
  return r.output;
}

export async function POST(req: Request, ctx: RouteContext<"/api/field/contacts/[id]">) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const input = parsed.data;

  try {
    const contact = await getContact(id);
    if (!contact) return error(404, "Contact not found.");

    let action: Action;
    if (input.action === "generate") {
      if (input.mode === "claude" && !fieldEnv.claude()) return error(503, "Claude drafting needs AI_GATEWAY_API_KEY. Use the playbook template instead.");
      const draft = input.mode === "claude" ? await claudeDraft(contact) : templateDraft(contact, fieldEnv.signer());
      action = { type: "save_draft", subject: draft.subject, body: draft.body, source: input.mode };
    } else if (input.action === "save_draft") {
      action = { type: "save_draft", subject: input.subject, body: input.body, source: "manual" };
    } else if (input.action === "nick_verdict") {
      action = { type: "nick_verdict", verdict: input.verdict, note: input.note };
    } else {
      action = { type: input.action };
    }

    const result = apply(contact, action, {
      operator: auth.operator,
      aceCanSend: fieldEnv.aceCanSend(),
      suppressed: action.type === "approve" ? await isSuppressed(contact.email) : false,
      now: new Date().toISOString(),
    });
    if (!result.ok) return error(result.status, result.error);

    const updated = Object.keys(result.patch).length ? await patchContact(id, result.patch) : contact;

    let notion: SyncResult = "skipped";
    if (action.type === "save_draft" && result.patch.draftHash) notion = await syncNotion(updated, { subject: updated.subject, body: updated.body });
    else if (action.type === "hold") notion = await syncNotion(updated, { status: "Hold" });
    else if (action.type === "release") notion = await syncNotion(updated, { status: "Ready" });
    else if (action.type === "nick_verdict" && action.verdict === "KILL") {
      notion = await syncNotion(updated, { status: "Kill" });
      void recordActivity({ kind: "updated", target: `Field: killed ${updated.name}`, because: updated.nickNote ?? "Nick KILL", agent: "field-console" });
    }

    return json({ ok: true, contact: updated, lint: lintPrices(updated.subject, updated.body), notion });
  } catch (e) {
    return error(500, e instanceof Error ? e.message : String(e));
  }
}
