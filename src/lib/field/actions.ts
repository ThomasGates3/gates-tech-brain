/**
 * Field actions — the one implementation of every Field step, shared by the
 * /field UI routes, the MCP server and the /api/v1 REST tools. All gates live in
 * workflow.ts; this layer adds Claude drafting, Notion write-back, sending and
 * activity. Server-only.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { fieldEnv, startOfTodayIso } from "./config";
import { syncNotion, type SyncResult } from "./api";
import { lintCopy, type LintIssue } from "./lint";
import { PLAYBOOK_SYSTEM, playbookPrompt, templateDraft, canSpamFooter, composeOutgoing, type Draft } from "./playbook";
import { fetchPack } from "./notion";
import { csvToRows } from "./csv";
import { sendEmail } from "./agentmail";
import { addSuppression, claimForSend, getContact, importRows, isSuppressed, patchContact, recordSend, releaseSend, sentSince } from "./store";
import { apply, sendError, type Action } from "./workflow";
import type { FieldContact, Operator, SendLogEntry } from "./types";
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

async function claudeDraft(c: FieldContact, tier: "sonnet" | "opus"): Promise<Draft> {
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
  const prompt = playbookPrompt(c, fieldEnv.signer());
  const draft = await ask(prompt);
  const issues = lintCopy(draft.subject, draft.body);
  if (!issues.length) return draft;
  // One self-correction pass; whatever comes back is still linted at Nick/Approve/Send.
  return ask(`${prompt}\n\nYour previous draft broke these rules: ${issues.map((i) => `"${i.match}" (${i.rule})`).join(", ")}.\nPrevious draft:\nSubject: ${draft.subject}\n\n${draft.body}\n\nRewrite it to fix every issue.`);
}

/** One workflow step on one contact (draft, Nick, approve, hold, release). */
export async function contactStep(id: string, raw: StepInput, operator: Operator): Promise<Result<{ contact: FieldContact; lint: LintIssue[]; notion: SyncResult }>> {
  const parsed = StepInput.safeParse(raw);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid step.");
  const input = parsed.data;
  const contact = await getContact(id);
  if (!contact) return fail(404, "Contact not found.");

  let action: Action;
  if (input.action === "generate") {
    if (input.mode === "claude") {
      if (!fieldEnv.claude()) return fail(503, "Claude drafting needs ANTHROPIC_API_KEY. Use the playbook template instead.");
      if ((await claudeBudget()).status === "blocked") return fail(429, "Daily Claude budget reached. Use the playbook template until midnight.");
    }
    const draft = input.mode === "claude" ? await claudeDraft(contact, input.model) : templateDraft(contact, fieldEnv.signer());
    action = { type: "save_draft", subject: draft.subject, body: draft.body, source: input.mode };
  } else if (input.action === "save_draft") {
    action = { type: "save_draft", subject: input.subject, body: input.body, source: "manual" };
  } else if (input.action === "nick_verdict") {
    action = { type: "nick_verdict", verdict: input.verdict, note: input.note };
  } else {
    action = { type: input.action };
  }

  const result = apply(contact, action, {
    operator,
    aceCanSend: fieldEnv.aceCanSend(),
    suppressed: action.type === "approve" ? await isSuppressed(contact.email) : false,
    now: new Date().toISOString(),
  });
  if (!result.ok) return fail(result.status, result.error);

  const updated = Object.keys(result.patch).length ? await patchContact(id, result.patch) : contact;

  let notion: SyncResult = "skipped";
  if (action.type === "save_draft" && result.patch.draftHash) notion = await syncNotion(updated, { subject: updated.subject, body: updated.body });
  else if (action.type === "hold") notion = await syncNotion(updated, { status: "Hold" });
  else if (action.type === "release") notion = await syncNotion(updated, { status: "Ready" });
  else if (action.type === "nick_verdict" && action.verdict === "KILL") {
    notion = await syncNotion(updated, { status: "Kill" });
    void recordActivity({ kind: "updated", target: `Field: killed ${updated.name}`, because: updated.nickNote ?? "Nick KILL", agent: "nick" });
  }

  return { ok: true, data: { contact: updated, lint: lintCopy(updated.subject, updated.body), notion } };
}

/** Send ONE Email 1 via AgentMail. Every gate re-checked; atomic claim prevents double sends. */
export async function sendContact(id: string, draftHash: string, operator: Operator): Promise<Result<{ log: SendLogEntry; notion: SyncResult }>> {
  if (!fieldEnv.agentmailKey() || !fieldEnv.agentmailInbox()) return fail(503, "AgentMail isn't configured (AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID).");
  const address = fieldEnv.mailingAddress();
  if (!address) return fail(503, "CAN-SPAM: set FIELD_MAILING_ADDRESS (physical mailing address) before any live send.");

  const contact = await getContact(id);
  if (!contact) return fail(404, "Contact not found.");
  const gate = sendError(contact, { operator, aceCanSend: fieldEnv.aceCanSend(), suppressed: await isSuppressed(contact.email), now: new Date().toISOString() });
  if (gate) return fail(gate.status, gate.error);
  if (draftHash !== contact.approvedHash) return fail(409, "The draft you reviewed isn't the approved draft. Refresh and review.");

  const cap = fieldEnv.dailyCap();
  if ((await sentSince(startOfTodayIso())) >= cap) return fail(429, `Daily send cap reached (${cap}). Protecting the cold domain's reputation.`);
  if (!(await claimForSend(contact.id, contact.approvedHash!))) return fail(409, "This contact is already being sent or was changed. Refresh.");

  let sent;
  try {
    sent = await sendEmail({ to: contact.email, subject: contact.subject, text: composeOutgoing(contact.body, canSpamFooter(address)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await releaseSend(contact.id, msg);
    return fail(502, msg);
  }

  // The email is out. From here on, failures must be reported, never retried as a resend.
  try {
    const log = await recordSend(contact, { ...sent, inbox: fieldEnv.agentmailInbox(), operator });
    audit.record({ action: "email_send", actor: operator, target: contact.email, detail: { contactId: contact.id, messageId: sent.messageId } });
    void recordActivity({ kind: "sent", target: `Email 1 → ${contact.name}`, because: `Nick PASS + ${contact.approvedBy ?? "thomas"} approve`, agent: "ace" });
    return { ok: true, data: { log, notion: await syncNotion(contact, { status: "Sent" }) } };
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
