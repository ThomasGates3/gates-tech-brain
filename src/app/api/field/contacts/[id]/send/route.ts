/**
 * POST /api/field/contacts/:id/send { confirm: true, draftHash } — send ONE Email 1.
 *
 * Thomas (or Ace with FIELD_ACE_CAN_SEND=true), after Approve, for the exact draft he approved (draftHash must
 * match what his screen showed). One contact per call; there is no batch or
 * autopilot path. Order: gates → atomic claim (approved → sending) → AgentMail
 * → send log + suppression → Notion "Sent". If AgentMail fails, the claim is
 * released back to approved with the error shown.
 */
import { z } from "zod";
import { error, json, requireOperator, syncNotion } from "@/lib/field/api";
import { fieldEnv, startOfTodayIso } from "@/lib/field/config";
import { sendEmail } from "@/lib/field/agentmail";
import { canSpamFooter, composeOutgoing } from "@/lib/field/playbook";
import { claimForSend, getContact, isSuppressed, recordSend, releaseSend, sentSince } from "@/lib/field/store";
import { sendError } from "@/lib/field/workflow";
import { recordActivity } from "@/lib/activity";
import audit from "@/lib/audit";

export const maxDuration = 30;

const Body = z.object({ confirm: z.literal(true), draftHash: z.string().min(8).max(64) });

export async function POST(req: Request, ctx: RouteContext<"/api/field/contacts/[id]/send">) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, "Explicit confirmation required: { confirm: true, draftHash }.");

  // Config gates — tracked outside the app, never faked.
  if (!fieldEnv.agentmailKey() || !fieldEnv.agentmailInbox()) return error(503, "AgentMail isn't configured (AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID).");
  const address = fieldEnv.mailingAddress();
  if (!address) return error(503, "CAN-SPAM: set FIELD_MAILING_ADDRESS (physical mailing address) before any live send.");

  const contact = await getContact(id);
  if (!contact) return error(404, "Contact not found.");
  const gate = sendError(contact, { operator: auth.operator, aceCanSend: fieldEnv.aceCanSend(), suppressed: await isSuppressed(contact.email), now: new Date().toISOString() });
  if (gate) return error(gate.status, gate.error);
  if (parsed.data.draftHash !== contact.approvedHash) return error(409, "The draft on your screen isn't the approved draft. Refresh and review.");

  const cap = fieldEnv.dailyCap();
  if ((await sentSince(startOfTodayIso())) >= cap) return error(429, `Daily send cap reached (${cap}). Protecting the cold domain's reputation.`);

  if (!(await claimForSend(contact.id, contact.approvedHash!))) return error(409, "This contact is already being sent or was changed. Refresh.");

  let sent;
  try {
    sent = await sendEmail({
      to: contact.email,
      subject: contact.subject,
      text: composeOutgoing(contact.body, canSpamFooter(fieldEnv.signer().company, address)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await releaseSend(contact.id, msg);
    return error(502, msg);
  }

  // The email is out. From here on, failures must be reported — not retried as a resend.
  const inbox = fieldEnv.agentmailInbox();
  try {
    const entry = await recordSend(contact, { ...sent, inbox, operator: auth.operator });
    audit.record({ action: "email_send", actor: auth.operator, target: contact.email, detail: { contactId: contact.id, messageId: sent.messageId } });
    void recordActivity({ kind: "sent", target: `Email 1 → ${contact.name}`, because: `Nick PASS + ${contact.approvedBy ?? "thomas"} approve`, agent: "field-console" });
    const notion = await syncNotion(contact, { status: "Sent" });
    return json({ ok: true, log: entry, notion });
  } catch (e) {
    // Leave the contact in "sending" so nobody can send it again; surface loudly.
    return error(500, `SENT via AgentMail (message ${sent.messageId}) but logging failed: ${e instanceof Error ? e.message : String(e)}. Do NOT resend — add the log row manually.`);
  }
}
