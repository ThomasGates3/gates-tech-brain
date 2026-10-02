/**
 * Field actions — the one implementation of every Field step, shared by the
 * /field UI routes, the MCP server and the /api/v1 REST tools. All gates live in
 * workflow.ts; this layer adds Claude drafting, Notion write-back, sending and
 * activity. Server-only.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { fieldEnv, startOfTodayIso, todayIn } from "./config";
import { syncNotion, type SyncResult } from "./api";
import { lintCopy, type LintIssue } from "./lint";
import { PLAYBOOK_SYSTEM, playbookPrompt, templateDraft, followupTemplate, canSpamFooter, composeOutgoing, type Draft } from "./playbook";
import { fetchPack } from "./notion";
import { csvToRows } from "./csv";
import { replyEmail, sendEmail } from "./agentmail";
import { getGates } from "./gates";
import { dueDate } from "./sequence";
import { addSuppression, blockingSuppression, claimForSend, getContact, getStep, importRows, lastSent, patchContact, patchStep, recordSend, releaseSend, sentSince } from "./store";
import { apply, sendError, type Action } from "./workflow";
import type { EmailN, FieldContact, Operator, SendLogEntry } from "./types";
import { claude, DRAFT, HARD_DRAFT } from "@/lib/models";
import { recordUsage } from "@/lib/usage";
import { recordActivity } from "@/lib/activity";
import { claudeBudget } from "@/lib/budget";
import audit from "@/lib/audit";

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

export const StepInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), mode: z.enum(["template", "claude"]), model: z.enum(["sonnet", "opus"]).default("sonnet") }),
  z.object({ action: z.literal("save_draft"), subject: z.string().max(200), body: z.string().max(5000) }),
  z.object({ action: z.literal("submit_nick") }),
  z.object({ action: z.literal("nick_verdict"), verdict: z.enum(["PASS", "REVISE", "KILL"]), note: z.string().max(2000).default("") }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("hold") }),
  z.object({ action: z.literal("release") }),
]);
export type StepInput = z.input<typeof StepInput>;

async function claudeDraft(c: FieldContact, tier: "sonnet" | "opus", n: EmailN = 1, previous: string[] = []): Promise<Draft> {
  const model = tier === "opus" ? HARD_DRAFT : DRAFT;
  const ask = async (prompt: string) => {
    const started = Date.now();
    const r = await generateText({
      model: claude(model),
      system: PLAYBOOK_SYSTEM,
      prompt,
      output: Output.object({ schema: z.object({ subject: z.string(), body: z.string() }) }),
      // Opus 5.5 defaults to medium effort; pin it, and retry classifier declines server-side.
      ...(tier === "opus" && { providerOptions: { anthropic: { effort: "medium", fallbacks: "default" } } }),
    });
    void recordUsage({ model, inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens, latencyMs: Date.now() - started, source: "automation" });
    return r.output;
  };
  const prompt = playbookPrompt(c, fieldEnv.signer(), n, previous);
  const draft = await ask(prompt);
  const issues = lintCopy(draft.subject, draft.body);
  if (!issues.length) return draft;
  // One self-correction pass; whatever comes back is still linted at Nick/Approve/Send.
  return ask(`${prompt}\n\nYour previous draft broke these rules: ${issues.map((i) => `"${i.match}" (${i.rule})`).join(", ")}.\nPrevious draft:\nSubject: ${draft.subject}\n\n${draft.body}\n\nRewrite it to fix every issue.`);
}

/** The contact as seen for step n: Email 1 is the contact itself; 2–4 overlay the step row. */
async function stepView(id: string, n: EmailN): Promise<Result<{ contact: FieldContact; view: FieldContact }>> {
  const contact = await getContact(id);
  if (!contact) return fail(404, "Contact not found.");
  if (n === 1) return { ok: true, data: { contact, view: contact } };
  if (contact.stage !== "sent" || !contact.sentAt) return fail(409, `Email ${n} unlocks after Email 1 is sent.`);
  if (contact.repliedAt) return fail(409, "They replied, so the sequence has ended. Hand off to Lisa.");
  const { messageId: _m, ...step } = await getStep(id, n);
  void _m;
  return { ok: true, data: { contact, view: { ...contact, ...step, subject: step.subject || contact.subject } } };
}

/** Earlier emails in the sequence (bodies), for follow-up drafting context. */
async function previousBodies(contact: FieldContact, n: EmailN): Promise<string[]> {
  const out = [contact.body];
  for (let k = 2; k < n; k++) out.push((await getStep(contact.id, k as EmailN)).body);
  return out.filter(Boolean);
}

/** One workflow step on one contact for Email n (draft, Nick, approve, hold, release). */
export async function contactStep(id: string, raw: StepInput, operator: Operator, n: EmailN = 1): Promise<Result<{ contact: FieldContact; lint: LintIssue[]; notion: SyncResult; email_n: EmailN }>> {
  const parsed = StepInput.safeParse(raw);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid step.");
  const input = parsed.data;
  const sv = await stepView(id, n);
  if (!sv.ok) return sv;
  const { contact, view } = sv.data;

  let action: Action;
  if (input.action === "generate") {
    if (input.mode === "claude") {
      if (!fieldEnv.claude()) return fail(503, "Claude drafting needs ANTHROPIC_API_KEY. Use the playbook template instead.");
      if ((await claudeBudget()).status === "blocked") return fail(429, "Daily Claude budget reached. Use the playbook template until midnight.");
    }
    const draft =
      input.mode === "claude"
        ? await claudeDraft(view, input.model, n, n > 1 ? await previousBodies(contact, n) : [])
        : n === 1
          ? templateDraft(contact, fieldEnv.signer())
          : followupTemplate(n, { name: contact.name, subject: contact.subject, lane: contact.lane }, fieldEnv.signer());
    action = { type: "save_draft", subject: n > 1 ? contact.subject : draft.subject, body: draft.body, source: input.mode };
  } else if (input.action === "save_draft") {
    action = { type: "save_draft", subject: n > 1 ? input.subject || contact.subject : input.subject, body: input.body, source: "manual" };
  } else if (input.action === "nick_verdict") {
    action = { type: "nick_verdict", verdict: input.verdict, note: input.note };
  } else {
    action = { type: input.action };
  }

  const result = apply(view, action, {
    operator,
    aceCanSend: fieldEnv.aceCanSend(),
    suppressed: action.type === "approve" ? Boolean(await blockingSuppression(contact.email, contact.id)) : false,
    now: new Date().toISOString(),
  });
  if (!result.ok) return fail(result.status, result.error);

  let updated: FieldContact;
  if (!Object.keys(result.patch).length) updated = view;
  else if (n === 1) updated = await patchContact(id, result.patch);
  else updated = { ...view, ...(await patchStep(id, n, result.patch)) };

  // Notion holds Email 1 only.
  let notion: SyncResult = "skipped";
  if (n === 1) {
    if (action.type === "save_draft" && result.patch.draftHash) notion = await syncNotion(updated, { subject: updated.subject, body: updated.body });
    else if (action.type === "hold") notion = await syncNotion(updated, { status: "Hold" });
    else if (action.type === "release") notion = await syncNotion(updated, { status: "Ready" });
  }
  if (action.type === "nick_verdict" && action.verdict === "KILL") {
    if (n === 1) notion = await syncNotion(updated, { status: "Kill" });
    void recordActivity({ kind: "updated", target: `Field: killed ${updated.name}${n > 1 ? ` (Email ${n})` : ""}`, because: updated.nickNote ?? "Nick KILL", agent: "nick" });
  }

  return { ok: true, data: { contact: updated, lint: lintCopy(updated.subject, updated.body), notion, email_n: n } };
}

/** Send ONE email (step n) via AgentMail. Every gate re-checked; atomic claim prevents double sends. */
export async function sendContact(id: string, draftHash: string, operator: Operator, n: EmailN = 1): Promise<Result<{ log: SendLogEntry; notion: SyncResult }>> {
  if (!fieldEnv.agentmailKey() || !fieldEnv.agentmailInbox()) return fail(503, "AgentMail isn't configured (AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID).");
  const address = fieldEnv.mailingAddress();
  if (!address) return fail(503, "CAN-SPAM: set FIELD_MAILING_ADDRESS (physical mailing address) before any live send.");

  const sv = await stepView(id, n);
  if (!sv.ok) return sv;
  const { contact, view } = sv.data;
  const suppressed = Boolean(await blockingSuppression(contact.email, contact.id));
  const gate = sendError(view, { operator, aceCanSend: fieldEnv.aceCanSend(), suppressed, now: new Date().toISOString() });
  if (gate) return fail(gate.status, gate.error);
  if (draftHash !== view.approvedHash) return fail(409, "The draft you reviewed isn't the approved draft. Refresh and review.");
  if (n > 1) {
    const due = dueDate(contact.sentAt!, n);
    if (todayIn() < due) return fail(409, `Email ${n} isn't due until ${due} (Day ${[1, 3, 7, 12][n - 1]}).`);
    if (n > 2 && (await getStep(id, (n - 1) as EmailN)).stage !== "sent") return fail(409, `Send Email ${n - 1} first.`);
  }

  const cap = (await getGates()).dailyCap;
  if ((await sentSince(startOfTodayIso())) >= cap) return fail(429, `Daily send cap reached (${cap}). Protecting the cold domain's reputation.`);
  if (!(await claimForSend(id, view.approvedHash!, n))) return fail(409, "This email is already being sent or was changed. Refresh.");

  let sent;
  try {
    const text = composeOutgoing(view.body, canSpamFooter(address));
    if (n === 1) sent = await sendEmail({ to: contact.email, subject: view.subject, text });
    else {
      const prev = await lastSent(id);
      if (!prev) throw new Error("No earlier message found to reply to.");
      sent = await replyEmail(prev.agentmailMessageId, text, [`field-email${n}`]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await releaseSend(id, msg, n);
    return fail(502, msg);
  }

  // The email is out. From here on, failures must be reported, never retried as a resend.
  try {
    const log = await recordSend({ ...contact, subject: view.subject }, { ...sent, inbox: fieldEnv.agentmailInbox(), operator }, n);
    audit.record({ action: "email_send", actor: operator, target: contact.email, detail: { contactId: contact.id, emailN: n, messageId: sent.messageId } });
    void recordActivity({ kind: "sent", target: `Email ${n} → ${contact.name}`, because: `Nick PASS + ${view.approvedBy ?? "thomas"} approve`, agent: "ace" });
    return { ok: true, data: { log, notion: n === 1 ? await syncNotion(contact, { status: "Sent" }) : "skipped" } };
  } catch (e) {
    return fail(500, `SENT via AgentMail (message ${sent.messageId}) but logging failed: ${e instanceof Error ? e.message : String(e)}. Do NOT resend; add the log row manually.`);
  }
}

/** Load the day's pack from Notion (High/Med/Soft rows) or a pasted CSV. */
export async function loadPack(source: "notion" | "csv", date: string, csv?: string) {
  return source === "notion"
    ? importRows(await fetchPack(date), "notion", date)
    : // A pasted pack is "the pack for the selected day", whatever its Date column says.
      importRows(csvToRows(csv ?? "").map((r) => ({ ...r, date: null })), "csv", date);
}

export { addSuppression };
