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
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { contactStep, sendContact, loadPack, addSuppression } from "@/lib/field/actions";
import { fieldSnapshot } from "@/lib/field/snapshot";
import { listQueue, listLog, getContact } from "@/lib/field/store";
import { todayIn } from "@/lib/field/config";
import { lintCopy, MAX_WORDS } from "@/lib/field/lint";
import { OUTREACH_BRIEF } from "@/lib/field/brief";
import type { Operator } from "@/lib/field/types";
import { AGENTS, AGENT_IDS, agentStatuses } from "@/lib/agents";
import { AUTOMATIONS } from "@/lib/automations/catalog";
import { runAutomation } from "@/lib/automations/runner";
import { recentActivity, recordActivity, type ActivityKind } from "@/lib/activity";
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

async function draftView(id: string) {
  const c = await getContact(id);
  if (!c) throw new ToolError(404, "Contact not found.");
  return {
    contact_id: c.id, name: c.name, email: c.email, priority: c.priority, stage: c.stage, gap: c.gap,
    subject: c.subject, body: c.body, draft_hash: c.draftHash, draft_source: c.draftSource,
    nick: { verdict: c.nickVerdict, note: c.nickNote, on_current_draft: Boolean(c.nickHash && c.nickHash === c.draftHash) },
    approved: Boolean(c.approvedHash && c.approvedHash === c.draftHash), approved_by: c.approvedBy,
    lint: lintCopy(c.subject, c.body), last_error: c.lastError,
  };
}

export const TOOLS = [
  tool({
    name: "brain_today",
    title: "Today's Field status",
    description: "One call for the whole picture: queue counts by stage, sends today vs cap, Claude spend vs budget, gates (AgentMail, Notion, CAN-SPAM, domain warm-up), and the next actions. Start here.",
    input: z.object({ agent: Agent, date: DateStr }),
    kind: "queried",
    run: ({ date }) => fieldSnapshot(date),
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
    description: "Today's High+Med contacts (Soft excluded unless include_soft). load_from_notion:true pulls the morning pack from the Notion Cold emails DB first.",
    input: z.object({ agent: Agent, date: DateStr, load_from_notion: z.boolean().default(false), include_soft: z.boolean().default(false) }),
    kind: "queried",
    run: async ({ date, load_from_notion, include_soft }) => {
      const day = date ?? todayIn();
      const loaded = load_from_notion ? await loadPack("notion", day) : null;
      const contacts = (await listQueue(day))
        .filter((c) => include_soft || c.priority !== "Soft")
        .map((c) => ({ contact_id: c.id, name: c.name, email: c.email, priority: c.priority, stage: c.stage, gap: c.gap, has_draft: Boolean(c.draftHash), nick: c.nickVerdict, approved: Boolean(c.approvedHash && c.approvedHash === c.draftHash), suppressed: c.suppressed }));
      return { date: day, loaded, count: contacts.length, contacts };
    },
  }),
  tool({
    name: "brain_get_draft",
    title: "Get Email 1 draft",
    description: "Email 1 subject + body for a contact, with copy-lint results, Nick's verdict and approval state.",
    input: z.object({ agent: Agent, contact_id: ContactId }),
    kind: "queried",
    run: ({ contact_id }) => draftView(contact_id),
  }),
  tool({
    name: "brain_set_draft",
    title: "Write Email 1 draft",
    description: "Write a contact's Email 1. Either pass subject+body (your own copy), or generate: \"template\" (free), \"sonnet\" (default Claude), \"opus\" (hard drafts only). Any change clears Nick's PASS and approval. Returns the draft with copy-lint issues to fix.",
    input: z.object({
      agent: Agent, contact_id: ContactId,
      subject: z.string().max(200).optional(), body: z.string().max(5000).optional(),
      generate: z.enum(["template", "sonnet", "opus"]).optional(),
    }),
    kind: "updated",
    run: async ({ contact_id, subject, body, generate }, ctx) => {
      if (generate) unwrap(await contactStep(contact_id, generate === "template" ? { action: "generate", mode: "template" } : { action: "generate", mode: "claude", model: generate }, ctx.operator));
      else if (subject != null && body != null) unwrap(await contactStep(contact_id, { action: "save_draft", subject, body }, ctx.operator));
      else throw new ToolError(400, "Pass subject and body, or generate.");
      return draftView(contact_id);
    },
  }),
  tool({
    name: "brain_set_nick_status",
    title: "Nick verdict",
    description: "Record Nick's audit of the current draft: PASS, REVISE or KILL, with a note. PASS is refused if the draft fails the copy lint. Approve stays locked until PASS on the exact current draft.",
    input: z.object({ agent: Agent, contact_id: ContactId, verdict: z.enum(["PASS", "REVISE", "KILL"]), note: z.string().max(2000).default("") }),
    kind: "updated",
    run: async ({ contact_id, verdict, note }, ctx) => {
      unwrap(await contactStep(contact_id, { action: "nick_verdict", verdict, note }, ctx.operator));
      return draftView(contact_id);
    },
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
    name: "brain_approve_send",
    title: "Approve + send Email 1",
    description: "Approve (if not already) and send ONE Email 1 via AgentMail. Requires Nick PASS on the exact current draft, a clean copy lint, an unsuppressed recipient, the CAN-SPAM address, and the daily send cap. Thomas-only (an Ace key works only when FIELD_ACE_CAN_SEND=true). Returns the AgentMail send id.",
    input: z.object({ agent: Agent, contact_id: ContactId, confirm: z.literal(true).describe("Must be true: you reviewed the exact draft") }),
    kind: "sent",
    run: async ({ contact_id }, ctx) => {
      let c = await getContact(contact_id);
      if (!c) throw new ToolError(404, "Contact not found.");
      if (c.stage !== "approved") c = unwrap(await contactStep(contact_id, { action: "approve" }, ctx.operator)).contact;
      const sent = unwrap(await sendContact(contact_id, c.approvedHash ?? "", ctx.operator));
      return { send_id: sent.log.agentmailMessageId, thread_id: sent.log.agentmailThreadId, to: sent.log.recipient, sent_at: sent.log.sentAt, notion: sent.notion };
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
  try {
    const result = await t.run(args as never, ctx);
    const summary = [args.contact_id, args.name, args.verdict, args.action].filter(Boolean).join(" · ");
    void recordActivity({ kind: t.kind, target: `${t.title}${summary ? `: ${summary}` : ""}`, because: `${ctx.via.toUpperCase()} ${t.name}${args.detail ? ` · ${String(args.detail).slice(0, 200)}` : ""}`, agent });
    return { ok: true, result };
  } catch (e) {
    const status = e instanceof ToolError ? e.status : 500;
    const error = e instanceof Error ? e.message : String(e);
    void recordActivity({ kind: "alert", target: `${t.title} failed`, because: `${ctx.via.toUpperCase()} ${t.name}: ${error.slice(0, 200)}`, agent });
    return { ok: false, status, error };
  }
}
