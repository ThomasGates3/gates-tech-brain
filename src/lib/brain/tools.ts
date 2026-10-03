/**
 * Brain tools — the single tool registry behind the MCP server (/api/mcp), the
 * REST API (/api/v1/tools/:name) and its OpenAPI spec (/api/v1/openapi.json).
 *
 * Locked Field path is enforced underneath (lib/field/actions + workflow):
 * Ace queue → Darrell Email 1 → Nick PASS/REVISE/KILL → Thomas Approve → AgentMail.
 * Soft = Hold. No prices in cold copy. No autopilot. Every call appends an
 * Activity row; pass `agent` (roster id) so that bot shows as active.
 */
import { generateText, stepCountIs } from "ai";
import { after } from "next/server";
import { listWhatsNew, addWhatsNew, WhatsNewError } from "@/lib/whats-new";
import { getRoadmap, setStep, markLead, RoadmapError, STEP_IDS } from "@/lib/roadmap";
import { websiteBrief, BriefAnswers } from "@/lib/website/brief";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { contactStep, sendContact, loadPack, addSuppression } from "@/lib/field/actions";
import { upsertContact, getStep, listSuppressions, mergeContacts, contactsByEmail } from "@/lib/field/store";
import { nextDue, dueDate } from "@/lib/field/sequence";
import { fetchInbound } from "@/lib/field/inbound";
import { getGates, setGates } from "@/lib/field/gates";
import { leadsFor, EMAIL1_STATUSES } from "@/lib/field/leads";
import { fieldSnapshot } from "@/lib/field/snapshot";
import { listLog, getContact } from "@/lib/field/store";
import { fieldEnv, todayIn } from "@/lib/field/config";
import { lintDraft, MAX_WORDS } from "@/lib/field/lint";
import { canSpamFooter } from "@/lib/field/playbook";
import { OUTREACH_BRIEF } from "@/lib/field/brief";
import type { EmailN, Operator } from "@/lib/field/types";
import { AGENTS, AGENT_IDS, agentStatuses } from "@/lib/agents";
import { AUTOMATIONS } from "@/lib/automations/catalog";
import { runAutomation } from "@/lib/automations/runner";
import { recentActivity, recordActivity, type ActivityKind } from "@/lib/activity";
import { describeCall, describeFailure } from "@/lib/activity/describe";
import { claude, HARD_DRAFT, LIGHT, OPS } from "@/lib/models";
import { claudeBudget } from "@/lib/budget";
import { costUsd, recordUsage } from "@/lib/usage";

export class ToolError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const unwrap = <T>(r: { ok: true; data: T } | { ok: false; status: number; error: string }): T => {
  if (!r.ok) throw new ToolError(r.status, r.error);
  return r.data;
};

export interface ToolCtx { operator: Operator; via: "mcp" | "rest" }
interface BrainTool<S extends z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  kind: ActivityKind;
  run: (args: z.infer<S>, ctx: ToolCtx) => Promise<unknown>;
}
const tool = <S extends z.ZodObject>(t: BrainTool<S>) => t as unknown as BrainTool<z.ZodObject>;

const Agent = z.enum(AGENT_IDS).optional().describe("Your roster id (e.g. \"ace\", \"darrell\", \"nick\"). Logged to Activity so you show as active.");
const ContactId = z.string().min(1).describe("Contact id from brain_field_queue");
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; defaults to today (America/New_York)");
const COPY_AGENTS = new Set(["darrell", "nick", "engine", "toga", "brandi", "ukyo", "gates-tech"]);
const MODEL = { haiku: LIGHT, sonnet: OPS, opus: HARD_DRAFT } as const;

const EmailNum = z.number().int().min(1).max(4).default(1).describe("Sequence step: 1|2|3|4 (Day 1/3/7/12). Default 1.");
const asN = (n: number | undefined) => (n ?? 1) as EmailN;
const isThomasGate = (op: Operator) => op === "thomas" || (op === "ace" && process.env.FIELD_ACE_CAN_SET_GATES === "true");

async function draftView(id: string, n: EmailN = 1) {
  const c = await getContact(id);
  if (!c) throw new ToolError(404, "Contact not found.");
  const st = n === 1 ? null : await getStep(id, n);
  const v = st ? { ...c, ...st, subject: st.subject || c.subject } : c;
  return {
    contact_id: c.id, name: c.name, contact_name: c.contactName, email: c.email, lane: c.lane, priority: c.priority, email_n: n,
    stage: v.stage, gap: c.gap, site_url: c.siteUrl, subject: v.subject, body: v.body, draft_hash: v.draftHash, draft_source: v.draftSource,
    nick: { verdict: v.nickVerdict, note: v.nickNote, on_current_draft: Boolean(v.nickHash && v.nickHash === v.draftHash) },
    approved: Boolean(v.approvedHash && v.approvedHash === v.draftHash), approved_by: v.approvedBy, sent_at: v.sentAt,
    due_date: n > 1 && c.sentAt ? dueDate(c.sentAt, n) : null, replied: Boolean(c.repliedAt),
    lint: lintDraft(v.subject, v.body, { lane: c.lane, emailN: n }), last_error: v.lastError,
    footer: fieldEnv.mailingAddress() ? canSpamFooter(fieldEnv.mailingAddress()) : null,
  };
}

const DraftItem = z.object({
  contact_id: ContactId,
  email_n: EmailNum,
  subject: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  generate: z.enum(["template", "sonnet", "opus"]).optional().describe("template (free), sonnet (default Claude), opus (hard drafts only)"),
});
async function setDraft(a: z.infer<typeof DraftItem>, ctx: ToolCtx) {
  const n = asN(a.email_n);
  if (a.generate) unwrap(await contactStep(a.contact_id, a.generate === "template" ? { action: "generate", mode: "template" } : { action: "generate", mode: "claude", model: a.generate }, ctx.operator, n));
  else if (a.body != null && (a.subject != null || n > 1)) unwrap(await contactStep(a.contact_id, { action: "save_draft", subject: a.subject ?? "", body: a.body }, ctx.operator, n));
  else throw new ToolError(400, "Pass subject and body (body only for Email 2–4), or generate.");
  return draftView(a.contact_id, n);
}

const NickItem = z.object({ contact_id: ContactId, email_n: EmailNum, verdict: z.enum(["PASS", "REVISE", "KILL"]), note: z.string().max(2000).default("") });
async function setNick(a: z.infer<typeof NickItem>, ctx: ToolCtx) {
  const n = asN(a.email_n);
  unwrap(await contactStep(a.contact_id, { action: "nick_verdict", verdict: a.verdict, note: a.note }, ctx.operator, n));
  return draftView(a.contact_id, n);
}

async function runBatch<T extends { contact_id: string }>(items: T[], fn: (item: T) => Promise<unknown>) {
  const results: { contact_id: string; ok: boolean; result?: unknown; error?: string; status?: number }[] = [];
  for (const item of items) {
    try {
      results.push({ contact_id: item.contact_id, ok: true, result: await fn(item) });
    } catch (e) {
      results.push({ contact_id: item.contact_id, ok: false, status: e instanceof ToolError ? e.status : 500, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { total: items.length, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

/** Run work after the response is sent (Next `after`), or inline outside a request. */
function runAfter(fn: () => Promise<void>) {
  try { after(fn); } catch { void fn(); }
}

/** Same-day scout draft: Claude (Sonnet) in the lead's lane; core holds itself if no published hours. */
async function autoDraftLead(id: string, name: string): Promise<void> {
  const r = await contactStep(id, { action: "generate", mode: "claude", model: "sonnet" }, "ace");
  if (!r.ok) { await recordActivity({ kind: "alert", target: `Auto-draft for ${name} didn't go through`, because: r.error.slice(0, 200), agent: "brain" }); return; }
  if (r.data.held) return; // hold already logged
  await recordActivity({ kind: "updated", target: `Brain drafted Email 1 for ${name}`, because: r.data.lint.length ? `${r.data.lint.length} copy issue(s) to fix` : "same-day scout draft, copy check clean", agent: "darrell" });
}

/** Roadmap rule breaks come back as clean 4xx tool errors. */
async function roadmapCall<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof RoadmapError) throw new ToolError(e.status, e.message); throw e; }
}

const PLACEHOLDER_EMAIL = /@(example\.(com|org|net)|test\.com|domain\.com|email\.com)$|^(test|noreply|no-reply|placeholder|unknown|n\/?a)@/i;

export const TOOLS = [
  tool({
    name: "brain_today",
    title: "Today's Field status",
    description: "One call for the whole picture. Aggregates (queue by stage, core vs website, sends vs cap, approved-unsent, follow-ups due, unanswered inbound, gates, Claude budget, next actions) plus leads[]: every lead for the date with lane, source, tier, email1_status (undrafted | drafted | atNick | PASS | approved | sent | hold | kill), Nick verdict, subject and next_action. Same data as the Control Center board. Start here.",
    input: z.object({ agent: Agent, date: DateStr }),
    kind: "queried",
    run: async ({ date }) => {
      const [snap, l] = await Promise.all([fieldSnapshot(date), leadsFor({ date })]);
      return { ...snap, lead_counts: l.counts, leads: l.leads };
    },
  }),
  tool({
    name: "brain_list_agents",
    title: "Agent roster",
    description: "Gates Grok bot roster with role and real idle/active status (active = logged activity in the last 30 min).",
    input: z.object({ agent: Agent }),
    kind: "queried",
    run: () => agentStatuses(),
  }),
  tool({
    name: "brain_report_activity",
    title: "Report what you did",
    description: "Log a finished piece of work to the Brain's Activity feed (e.g. Vera: \"wrote 6 gap notes\"). Marks you active on the roster.",
    input: z.object({ agent: z.enum(AGENT_IDS).describe("Your roster id"), action: z.string().min(1).max(300), detail: z.string().max(2000).optional() }),
    kind: "updated",
    run: async ({ action }) => ({ logged: true, action }),
  }),
  tool({
    name: "brain_get_brief",
    title: "Outreach brief",
    description: "The Gates Technologies outreach brief (the only source of truth for cold copy) plus the Email 1 rules the copy lint enforces.",
    input: z.object({ agent: Agent }),
    kind: "queried",
    run: async () => ({
      brief: OUTREACH_BRIEF,
      email1: { max_words: MAX_WORDS, footer: "Physical address + opt-out are appended at send. Don't write them into the draft.", lint: "Nick PASS, Approve and Send reject any draft that fails the copy lint." },
    }),
  }),
  tool({
    name: "brain_chat",
    title: "Ask Claude",
    description: "Run a prompt on Claude instead of spending Grok tokens. model: sonnet (default), haiku (cheapest, for summaries/extraction), opus (hard copy only). Copy agents get the outreach brief automatically. web_search lets Claude search the web (Hermes defaults to on). Counts against the daily Claude budget.",
    input: z.object({
      agent: Agent,
      prompt: z.string().min(1).max(200_000),
      model: z.enum(["sonnet", "haiku", "opus"]).default("sonnet"),
      web_search: z.boolean().optional(),
      max_tokens: z.number().int().min(64).max(16_000).default(4_000),
    }),
    kind: "generated",
    run: async ({ agent, prompt, model, web_search, max_tokens }) => {
      const budget = await claudeBudget();
      if (budget.status === "blocked") throw new ToolError(429, "Daily Claude budget reached. Resets at midnight.");
      const role = AGENTS.find((a) => a.id === agent);
      const system = [
        "You are working inside the Gates Technologies Brain for Thomas Gates III. Gates sells a call-recovery system to local service businesses (med spas first). Never invent figures, clients or results.",
        role ? `You are assisting ${role.label}: ${role.role}.` : "",
        agent && COPY_AGENTS.has(agent) ? `Follow this outreach brief exactly:\n<outreach_brief>\n${OUTREACH_BRIEF}\n</outreach_brief>` : "",
      ].filter(Boolean).join("\n\n");
      const id = MODEL[model];
      const search = web_search ?? agent === "hermes";
      const started = Date.now();
      const r = await generateText({
        model: claude(id), system, prompt, maxOutputTokens: max_tokens,
        ...(search && { tools: { web_search: anthropic.tools.webSearch_20260209({ maxUses: 5 }) }, stopWhen: stepCountIs(3) }),
      });
      const inTok = r.usage.inputTokens ?? 0, outTok = r.usage.outputTokens ?? 0;
      await recordUsage({ model: id, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - started, source: "ace" });
      return { text: r.text, model: r.response.modelId, usage: { input_tokens: inTok, output_tokens: outTok, cost_usd: Number(costUsd(id, inTok, outTok).toFixed(5)) }, budget: await claudeBudget() };
    },
  }),
  tool({
    name: "brain_list_automations",
    title: "List automations",
    description: "Gates automations you can run with brain_run_automation, with the inputs each needs. All are draft-only.",
    input: z.object({ agent: Agent }),
    kind: "queried",
    run: async () => AUTOMATIONS.map(({ id, name, category, description, inputs, webSearch }) => ({ name: id, title: name, category, description, inputs: inputs ?? [], web_search: Boolean(webSearch) })),
  }),
  tool({
    name: "brain_run_automation",
    title: "Run an automation",
    description: "Run a Gates automation. dry_run (default true) only generates the draft and delivers nothing. dry_run:false also posts the draft to its channels (deck, Discord). No automation ever sends outreach.",
    input: z.object({
      agent: Agent,
      name: z.enum(AUTOMATIONS.map((a) => a.id) as [string, ...string[]]),
      inputs: z.record(z.string(), z.string()).optional().describe("Values for the automation's inputs (see brain_list_automations)"),
      dry_run: z.boolean().default(true),
    }),
    kind: "generated",
    run: async ({ agent, name, inputs, dry_run }, ctx) => {
      const r = await runAutomation(name, inputs ?? {}, agent ?? ctx.operator, { dryRun: dry_run });
      if (r.status === "error") throw new ToolError(r.error?.includes("budget") ? 429 : 500, r.error ?? "Automation failed");
      return r;
    },
  }),
  tool({
    name: "brain_field_queue",
    title: "Field queue",
    description: "Leads for a date (default today ET), each with lane, source, tier, email1_status, Nick verdict, subject, next_action. Soft is excluded unless include_soft or tier:\"Soft\". Filters: lane, status, tier. load_from_notion:true pulls the morning pack from Notion first (tagged source notion).",
    input: z.object({
      agent: Agent, date: DateStr,
      load_from_notion: z.boolean().default(false), include_soft: z.boolean().default(false),
      lane: z.enum(["core", "website"]).optional(), status: z.enum(EMAIL1_STATUSES).optional(), tier: z.enum(["High", "Med", "Soft"]).optional(),
    }),
    kind: "queried",
    run: async ({ date, load_from_notion, include_soft, lane, status, tier }) => {
      const day = date ?? todayIn();
      const loaded = load_from_notion ? await loadPack("notion", day) : null;
      const l = await leadsFor({ date: day, lane, status, tier });
      const contacts = l.leads.filter((x) => include_soft || tier === "Soft" || x.tier !== "Soft");
      return { date: day, loaded, counts: l.counts, count: contacts.length, contacts };
    },
  }),
  tool({
    name: "brain_get_draft",
    title: "Get Email 1 draft",
    description: "Subject + body for a contact's Email n (default 1), with copy-lint results, Nick's verdict, approval state, and the step's due date.",
    input: z.object({ agent: Agent, contact_id: ContactId, email_n: EmailNum }),
    kind: "queried",
    run: ({ contact_id, email_n }) => draftView(contact_id, asN(email_n)),
  }),
  tool({
    name: "brain_website_brief",
    title: "Website build brief",
    description: "The Gates master website prompt (Premium Website Architect, verbatim) plus the filled \"Build a website for…\" message for a lead. Paste master_prompt first, then build_message. Pass what you know in answers; everything still unknown comes back in ask as the checklist questions to answer before building. For building the prospect's site, never for cold email copy.",
    input: z.object({ agent: Agent, contact_id: ContactId, answers: BriefAnswers.optional() }),
    kind: "queried",
    run: async ({ contact_id, answers }) => {
      const c = await getContact(contact_id);
      if (!c) throw new ToolError(404, "No lead with that contact_id.");
      return { contact_id, business: c.name, lane: c.lane, ...websiteBrief(c, answers) };
    },
  }),
  tool({
    name: "brain_set_draft",
    title: "Write email draft",
    description: "Write a contact's Email n (default 1; 2–4 are follow-ups sent as replies in the same thread, unlocked after Email 1 is sent). Pass subject+body (Email 2–4: body only), or generate: \"template\" (free), \"sonnet\" (default Claude), \"opus\" (hard drafts only). Any change clears Nick's PASS and approval. Returns the draft with copy-lint issues to fix.",
    input: DraftItem.extend({ agent: Agent }),
    kind: "updated",
    run: (args, ctx) => setDraft(args, ctx),
  }),
  tool({
    name: "brain_set_nick_status",
    title: "Nick verdict",
    description: "Record Nick's audit of the current draft for Email n (default 1): PASS, REVISE or KILL, with a note. PASS is refused if the draft fails the copy lint. Approve stays locked until PASS on the exact current draft.",
    input: NickItem.extend({ agent: Agent }),
    kind: "updated",
    run: (args, ctx) => setNick(args, ctx),
  }),
  tool({
    name: "brain_hold",
    title: "Hold / release",
    description: "Park a contact on Hold (hold:true) or release it back to drafting (hold:false). Releasing clears Nick's verdict.",
    input: z.object({ agent: Agent, contact_id: ContactId, hold: z.boolean() }),
    kind: "updated",
    run: async ({ contact_id, hold }, ctx) => {
      unwrap(await contactStep(contact_id, { action: hold ? "hold" : "release" }, ctx.operator));
      return draftView(contact_id);
    },
  }),
  tool({
    name: "brain_approve",
    title: "Approve (no send)",
    description: "Mark a contact's Email n approved WITHOUT sending. Requires Nick PASS on the exact current draft hash, a clean copy lint, and an unsuppressed recipient. Thomas-only (an Ace key only with FIELD_ACE_CAN_SEND=true).",
    input: z.object({ agent: Agent, contact_id: ContactId, email_n: EmailNum }),
    kind: "updated",
    run: async ({ contact_id, email_n }, ctx) => {
      unwrap(await contactStep(contact_id, { action: "approve" }, ctx.operator, asN(email_n)));
      return draftView(contact_id, asN(email_n));
    },
  }),
  tool({
    name: "brain_approve_send",
    title: "Approve + send email",
    description: "Approve (if not already) and send ONE email (Email n, default 1) via AgentMail from the cold inbox. Email 1 starts a thread; Emails 2–4 reply in it and only send on/after their due date (Day 3/7/12) once the previous step went out. Requires domain warm-up confirmed (brain_set_gate), Nick PASS on the exact current draft, a clean copy lint, no opt-out/bounce suppression, the CAN-SPAM address and the daily send cap. Thomas-only (an Ace key only with FIELD_ACE_CAN_SEND=true). Returns the AgentMail send id.",
    input: z.object({ agent: Agent, contact_id: ContactId, email_n: EmailNum, confirm: z.literal(true).describe("Must be true: you reviewed the exact draft") }),
    kind: "sent",
    run: async ({ contact_id, email_n }, ctx) => {
      const n = asN(email_n);
      const approvedHash = async () => (n === 1 ? (await getContact(contact_id))?.approvedHash : (await getStep(contact_id, n)).approvedHash) ?? "";
      if ((await draftView(contact_id, n)).stage !== "approved") unwrap(await contactStep(contact_id, { action: "approve" }, ctx.operator, n));
      const hash = await approvedHash();
      const sent = unwrap(await sendContact(contact_id, hash, ctx.operator, n));
      return { email_n: n, send_id: sent.log.agentmailMessageId, thread_id: sent.log.agentmailThreadId, to: sent.log.recipient, sent_at: sent.log.sentAt, notion: sent.notion };
    },
  }),
  tool({
    name: "brain_suppress",
    title: "Suppress an email",
    description: "Add an address to the suppression list (reply \"no\"/\"stop\", bounce, or manual). Suppressed addresses can never be approved or sent.",
    input: z.object({ agent: Agent, email: z.email().max(320), reason: z.enum(["opt_out", "bounce", "manual"]) }),
    kind: "updated",
    run: async ({ email, reason }, ctx) => { await addSuppression(email, reason, ctx.operator); return { suppressed: email, reason }; },
  }),
  tool({
    name: "brain_send_log",
    title: "Send log",
    description: "Recent Email 1 sends: time, recipient, AgentMail id, who sent it.",
    input: z.object({ agent: Agent, limit: z.number().int().min(1).max(100).default(20) }),
    kind: "queried",
    run: ({ limit }) => listLog(limit),
  }),
  tool({
    name: "brain_activity",
    title: "Recent activity",
    description: "Recent real Brain activity (newest first), optionally for one agent.",
    input: z.object({ agent: Agent, limit: z.number().int().min(1).max(100).default(20), for_agent: z.enum(AGENT_IDS).optional() }),
    kind: "queried",
    run: async ({ limit, for_agent }) => (await recentActivity(for_agent ? 300 : limit)).filter((a) => !for_agent || a.agent === for_agent).slice(0, limit),
  }),
  tool({
    name: "brain_upsert_contact",
    title: "Upsert a contact",
    description: "Add or update one lead (by contact_id, else by email) from Ashley (core lane), Prospectacle (website lane), Notion or manual. High/Med go on today's Field queue (or `date`); Soft is stored on Hold and only shows with include_soft. Never resets workflow state. Rejects incomplete rows and placeholder emails: never invent an email.",
    input: z.object({
      agent: Agent,
      contact_id: z.string().optional(),
      business: z.string().trim().min(2).max(200),
      contact_name: z.string().trim().max(120).optional(),
      email: z.email().max(320),
      tier: z.enum(["High", "Med", "Soft"]),
      lane: z.enum(["core", "website"]).optional().describe("Default: website for Prospectacle, core otherwise"),
      site_url: z.url().max(500).optional(),
      gap: z.string().max(1000).optional().describe("Verified observation for the opener (Vera's gap note)"),
      city: z.string().max(120).optional(),
      notes: z.string().max(2000).optional(),
      source: z.enum(["ashley", "prospectacle", "notion", "manual"]).optional().describe("Default: your agent id if ashley/prospectacle, else manual"),
      date: DateStr,
      auto_draft: z.boolean().default(true).describe("Scout High/Med leads get a same-day Brain draft (core: hours check first; website: three fixes). false to skip."),
    }),
    kind: "updated",
    run: async (a) => {
      if (PLACEHOLDER_EMAIL.test(a.email)) throw new ToolError(400, `Rejected: "${a.email}" looks like a placeholder. Only real, verified emails.`);
      // Wiring: Ashley → core, Prospectacle → website.
      const source = a.source ?? (a.agent === "ashley" || a.agent === "prospectacle" ? a.agent : "manual");
      const lane = a.lane ?? (source === "prospectacle" ? "website" : "core");
      if (source === "ashley" && lane !== "core") throw new ToolError(400, "Ashley leads are the core lane (missed-call Field).");
      if (source === "prospectacle" && lane !== "website") throw new ToolError(400, "Prospectacle leads are the website lane.");
      const { contact, created } = await upsertContact({ contactId: a.contact_id, business: a.business, contactName: a.contact_name, email: a.email, tier: a.tier, lane, siteUrl: a.site_url, gap: a.gap, city: a.city, notes: a.notes, source, date: a.date ?? todayIn() });
      const autoDraft = a.auto_draft && (source === "ashley" || source === "prospectacle") && contact.priority !== "Soft" && contact.stage === "new";
      if (autoDraft) runAfter(() => autoDraftLead(contact.id, contact.name));
      return { created, contact_id: contact.id, name: contact.name, email: contact.email, lane: contact.lane, source: contact.source, priority: contact.priority, stage: contact.stage, pack_date: contact.packDate, on_queue: contact.priority !== "Soft", auto_draft: autoDraft ? "queued" : "skipped" };
    },
  }),
  tool({
    name: "brain_next_due",
    title: "Follow-ups due",
    description: "Contacts whose next sequence step (Email 2/3/4 on Day 3/7/12 after Email 1) is due on `date` (default today, ET) or overdue. Excludes anyone who replied, opted out, or was held/killed.",
    input: z.object({ agent: Agent, date: DateStr }),
    kind: "queried",
    run: async ({ date }) => { const due = await nextDue(date ?? todayIn()); return { date: date ?? todayIn(), count: due.length, due }; },
  }),
  tool({
    name: "brain_inbound",
    title: "Inbound replies",
    description: "Read recent AgentMail threads for the cold inbox (default hello@gatesoutreach.com), match senders to contacts, and suggest an action per thread: reply_handoff_lisa | soft_hold | suppress_opt_out | ignore. Read + classify only: never replies. A matched reply ends that contact's sequence. Suppresses opt-outs ONLY when confirm_suppress:true.",
    input: z.object({ agent: Agent, inbox_id: z.string().max(320).optional(), limit: z.number().int().min(1).max(50).default(25), confirm_suppress: z.boolean().default(false) }),
    kind: "queried",
    run: ({ inbox_id, limit, confirm_suppress }, ctx) => fetchInbound({ inbox: inbox_id, limit, confirmSuppress: confirm_suppress, by: ctx.operator }),
  }),
  tool({
    name: "brain_set_gate",
    title: "Set Field gates",
    description: "Thomas-only: set domainWarmed (cold domain warm-up confirmed) and/or dailyCap (max sends per day). Logged with who and when. Pass neither to just read the gates.",
    input: z.object({ agent: Agent, domain_warmed: z.boolean().optional(), daily_cap: z.number().int().min(1).max(500).optional() }),
    kind: "updated",
    run: async ({ domain_warmed, daily_cap }, ctx) => {
      if (domain_warmed === undefined && daily_cap === undefined) return getGates();
      if (!isThomasGate(ctx.operator)) throw new ToolError(403, "Gates are Thomas-only. Use a Thomas key.");
      return setGates({ domainWarmed: domain_warmed, dailyCap: daily_cap }, ctx.operator);
    },
  }),
  tool({
    name: "brain_roadmap_get",
    title: "Money roadmap",
    description: "The nine Money roadmap steps (ready to mail → first paid client) with status, owner, done date and note, plus four live numbers: PASS waiting on Thomas, approved unsent, Field emails sent all time (warm-up seeds excluded), warm-up blocked/confirmed.",
    input: z.object({ agent: Agent }),
    kind: "queried",
    run: () => getRoadmap(),
  }),
  tool({
    name: "brain_roadmap_set",
    title: "Update Money roadmap",
    description: "Move one roadmap step forward (later → now → done) or change its note. No skipping: a step can't be done while an earlier step isn't. Steps offer, send_domain, copy_rules and warmup are Thomas-only, and warmup is only done after Thomas uses Confirm warm-up (this tool never sets the gate). Brain marks warmup, first_send, first_reply (now), booked_call and paid_client itself from real events. Returns the full roadmap.",
    input: z.object({
      agent: z.enum(AGENT_IDS).describe("Your roster id"),
      step_id: z.enum(STEP_IDS),
      status: z.enum(["done", "now", "later"]),
      note: z.string().trim().max(200).optional().describe("One short sentence"),
      evidence: z.string().trim().max(120).optional().describe("A lead id, a send id, or thomas-confirmed"),
    }),
    kind: "updated",
    run: (a, ctx) => roadmapCall(() => setStep({ ...a, agent: a.agent }, ctx.operator === "thomas")),
  }),
  tool({
    name: "brain_whats_new_list",
    title: "What's new",
    description: "Shipped features Thomas sees on /roadmap, newest first: date (New York), title, one sentence, who logged it.",
    input: z.object({ agent: Agent }),
    kind: "queried",
    run: async () => ({ items: await listWhatsNew() }),
  }),
  tool({
    name: "brain_whats_new_add",
    title: "Log what's new",
    description: "Add one What's new row (append only, no edits or deletes). Title under 60 characters, note one plain sentence under 200 characters. No prices, no dashes as punctuation. Logging a feature never marks a roadmap step done.",
    input: z.object({ agent: z.enum(AGENT_IDS).describe("Your roster id"), title: z.string().max(80), note: z.string().max(300) }),
    kind: "updated",
    run: async ({ agent, title, note }) => {
      try { return { items: await addWhatsNew(agent, title, note) }; }
      catch (e) { if (e instanceof WhatsNewError) throw new ToolError(e.status, e.message); throw e; }
    },
  }),
  tool({
    name: "brain_mark_booked",
    title: "Lead: booked call",
    description: "Thomas or Lisa: a lead we emailed booked a call. Stored on the lead; marks First reply and First booked call done on the Money roadmap.",
    input: z.object({ agent: Agent, contact_id: ContactId }),
    kind: "updated",
    run: ({ agent, contact_id }, ctx) => {
      if (ctx.operator !== "thomas" && agent !== "lisa") throw new ToolError(403, "Booked call is Thomas or Lisa only.");
      return roadmapCall(() => markLead(contact_id, { booked: true }, ctx.operator === "thomas" ? "thomas" : "lisa"));
    },
  }),
  tool({
    name: "brain_mark_paid",
    title: "Lead: paid",
    description: "Thomas only: a lead we emailed became a paying client, with the offer (core, website, reactivation). Marks First paid client done on the Money roadmap.",
    input: z.object({ agent: Agent, contact_id: ContactId, offer: z.enum(["core", "website", "reactivation"]) }),
    kind: "updated",
    run: ({ contact_id, offer }, ctx) => {
      if (ctx.operator !== "thomas") throw new ToolError(403, "Paid is Thomas only.");
      return roadmapCall(() => markLead(contact_id, { paid: offer }, "thomas"));
    },
  }),
  tool({
    name: "brain_batch_set_draft",
    title: "Batch: write drafts",
    description: "brain_set_draft for up to 50 items. Each item runs independently; one failure doesn't stop the rest. Returns per-item success/error. Claude generation counts against the daily budget.",
    input: z.object({ agent: Agent, items: z.array(DraftItem).min(1).max(50) }),
    kind: "updated",
    run: ({ items }, ctx) => runBatch(items, (i) => setDraft(i, ctx)),
  }),
  tool({
    name: "brain_batch_nick",
    title: "Batch: Nick verdicts",
    description: "brain_set_nick_status for up to 50 items. Each item runs independently; one failure doesn't stop the rest. Returns per-item success/error.",
    input: z.object({ agent: Agent, items: z.array(NickItem).min(1).max(50) }),
    kind: "updated",
    run: ({ items }, ctx) => runBatch(items, (i) => setNick(i, ctx)),
  }),
  tool({
    name: "brain_merge_contacts",
    title: "Merge duplicate leads",
    description: "Fold a duplicate lead (drop_id) into the primary (keep_id): fills the primary's missing contact name, site, notes, gap and Notion link, takes drop's draft if the primary has none, keeps the PRIMARY's tier (a Soft copy never pulls a High/Med lead onto Hold), then deletes drop. Both must be unsent. Use with leads[].duplicate_of (keep_id = the lead's contact_id).",
    input: z.object({ agent: Agent, keep_id: ContactId, drop_id: ContactId }),
    kind: "updated",
    run: async ({ keep_id, drop_id }) => {
      try {
        const m = await mergeContacts(keep_id, drop_id);
        return { merged_into: m.id, dropped: drop_id, name: m.name, email: m.email, lane: m.lane, source: m.source, tier: m.priority, stage: m.stage };
      } catch (e) {
        throw new ToolError(409, e instanceof Error ? e.message : String(e));
      }
    },
  }),
  tool({
    name: "brain_list_suppressions",
    title: "Suppression list",
    description: "Suppressed emails with reason (sent_email1 | opt_out | bounce | manual) and when; optional search substring.",
    input: z.object({ agent: Agent, search: z.string().max(200).optional(), limit: z.number().int().min(1).max(500).default(100) }),
    kind: "queried",
    run: async ({ search, limit }) => (await listSuppressions(limit, search)).map((r) => ({ email: r.email, reason: r.reason, created_at: r.at, by: r.by, contact_id: r.contactId })),
  }),
  tool({
    name: "brain_import_draft",
    title: "Import a draft",
    description: "Put copy you already wrote into the Brain (e.g. Prospectacle's Email 1 with its three in-body fixes, or Darrell's draft). Find the lead by contact_id, or by email (most recent match). Same as brain_set_draft with subject+body: clears any PASS/approval and returns copy-lint issues. A draft that only exists in your own files is not done until it is imported.",
    input: z.object({
      agent: Agent,
      contact_id: z.string().optional(),
      email: z.email().optional(),
      email_n: EmailNum,
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    }),
    kind: "updated",
    run: async ({ contact_id, email, email_n, subject, body }, ctx) => {
      const id = contact_id ?? (email ? (await contactsByEmail([email])).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id : undefined);
      if (!id) throw new ToolError(404, "No lead found. Pass contact_id, or upsert the lead first (brain_upsert_contact).");
      return setDraft({ contact_id: id, email_n, subject, body }, ctx);
    },
  }),
  tool({
    name: "brain_nick_queue",
    title: "Nick's pack",
    description: "The drafts waiting for Nick: every lead whose Email 1 is drafted with a clean copy lint (plus anything already atNick), with subject and body to audit. submit:true moves the clean drafted ones to atNick. Then record verdicts with brain_batch_nick. Drafts with lint issues are listed separately for Darrell/Prospectacle to fix.",
    input: z.object({ agent: Agent, date: DateStr, lane: z.enum(["core", "website"]).optional(), submit: z.boolean().default(false) }),
    kind: "queried",
    run: async ({ date, lane, submit }, ctx) => {
      const l = await leadsFor({ date: date ?? todayIn(), lane });
      // Only first-time drafts or rewrites since Nick's last verdict; never re-queue an unchanged REVISE.
      const clean = l.leads.filter((x) => x.email1_status === "drafted" && x.lint_issues === 0 && !x.revise_pending);
      const blocked = l.leads.filter((x) => x.email1_status === "drafted" && (x.lint_issues > 0 || x.revise_pending)).map((x) => ({ contact_id: x.contact_id, business: x.business, lint_issues: x.lint_issues, revise_pending: x.revise_pending, nick_note: x.nick_note }));
      const submitted: string[] = [];
      if (submit) for (const x of clean) if ((await contactStep(x.contact_id, { action: "submit_nick" }, ctx.operator)).ok) submitted.push(x.contact_id);
      const ids = [...new Set([...clean.map((x) => x.contact_id), ...l.leads.filter((x) => x.email1_status === "atNick").map((x) => x.contact_id)])];
      const pack = await Promise.all(ids.map(async (id) => { const v = await draftView(id, 1); return { contact_id: id, business: v.name, lane: v.lane, tier: v.priority, stage: v.stage, subject: v.subject, body: v.body, gap: v.gap, site_url: v.site_url, lint: v.lint }; }));
      return { date: l.date, count: pack.length, submitted: submitted.length, pack, needs_fix: blocked };
    },
  }),
];

export const getTool = (name: string) => TOOLS.find((t) => t.name === name);

/** Validate, run, and log one tool call. Never throws. */
export async function callTool(name: string, raw: unknown, ctx: ToolCtx): Promise<{ ok: true; result: unknown } | { ok: false; status: number; error: string }> {
  const t = getTool(name);
  if (!t) return { ok: false, status: 404, error: `Unknown tool '${name}'. See /api/v1/openapi.json.` };
  const parsed = t.input.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  const args = parsed.data as Record<string, unknown>;
  const agent = (args.agent as string | undefined) ?? (ctx.operator === "thomas" ? "thomas" : "ace");
  const businessOf = async (result?: unknown) => {
    const r = (result ?? {}) as Record<string, unknown>;
    const fromResult = typeof r.name === "string" ? r.name : typeof r.business === "string" ? r.business : "";
    if (fromResult) return fromResult;
    const id = (args.contact_id ?? args.keep_id) as string | undefined;
    return id ? ((await getContact(id).catch(() => null))?.name ?? "") : "";
  };
  try {
    const result = await t.run(args as never, ctx);
    const d = describeCall(name, args, result, agent, await businessOf(result));
    void recordActivity({ kind: d.kind ?? t.kind, target: d.target, because: d.because, agent });
    return { ok: true, result };
  } catch (e) {
    const status = e instanceof ToolError ? e.status : 500;
    const error = e instanceof Error ? e.message : String(e);
    const f = describeFailure(t.title, await businessOf(), error);
    void recordActivity({ kind: "alert", target: f.target, because: f.because, agent });
    return { ok: false, status, error };
  }
}
