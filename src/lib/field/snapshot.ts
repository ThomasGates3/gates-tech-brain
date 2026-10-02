/**
 * Field snapshot — the real state of today's Email 1 operation in one object.
 * Feeds brain_today (MCP/REST), the deck's briefing + stats, and the Morning
 * Briefing / End-of-Day Recap automations (so they never invent numbers).
 */
import { fieldEnv, startOfTodayIso, todayIn } from "./config";
import { listQueue, sentSince } from "./store";
import { claudeBudget } from "@/lib/budget";
import { getGates } from "./gates";
import { nextDue } from "./sequence";
import { unansweredCount } from "./inbound";

export async function fieldSnapshot(date = todayIn()) {
  const contacts = await listQueue(date).catch(() => []);
  const n = (f: (c: (typeof contacts)[number]) => boolean) => contacts.filter(f).length;
  const passAwaitingApprove = n((c) => c.stage === "nick" && c.nickVerdict === "PASS" && c.nickHash === c.draftHash);
  const queue = {
    total: contacts.length,
    highMed: n((c) => c.priority !== "Soft"),
    soft: n((c) => c.priority === "Soft"),
    undrafted: n((c) => c.priority !== "Soft" && c.stage === "new"),
    drafted: n((c) => c.stage === "drafted"),
    atNick: n((c) => c.stage === "nick") - passAwaitingApprove,
    passAwaitingApprove,
    approved: n((c) => c.stage === "approved"),
    sent: n((c) => c.stage === "sent"),
    hold: n((c) => c.stage === "hold"),
    kill: n((c) => c.stage === "kill"),
    core: n((c) => c.priority !== "Soft" && c.lane !== "website"),
    website: n((c) => c.priority !== "Soft" && c.lane === "website"),
  };
  const [sentToday, budget, g, due, inboundUnanswered] = await Promise.all([
    sentSince(startOfTodayIso()).catch(() => 0),
    claudeBudget(),
    getGates(),
    nextDue(date).catch(() => []),
    unansweredCount(),
  ]);
  const sequenceDue = { total: due.length, byStep: { 2: due.filter((d) => d.email_n === 2).length, 3: due.filter((d) => d.email_n === 3).length, 4: due.filter((d) => d.email_n === 4).length } };
  const gates = {
    agentmail: Boolean(fieldEnv.agentmailKey() && fieldEnv.agentmailInbox()),
    inbox: fieldEnv.agentmailInbox() || null,
    notion: Boolean(fieldEnv.notionToken() && fieldEnv.notionDataSource()),
    mailingAddress: Boolean(fieldEnv.mailingAddress()),
    domainWarmed: g.domainWarmed,
    warmNote: g.warmNote,
    gatesSetBy: g.setBy,
    gatesSetAt: g.setAt,
    aceCanSend: fieldEnv.aceCanSend(),
  };
  const next: string[] = [];
  if (!contacts.length) next.push("No pack loaded for today: load the morning pack from Notion.");
  if (queue.undrafted) next.push(`${queue.undrafted} High/Med contact${queue.undrafted > 1 ? "s" : ""} not drafted yet (Darrell).`);
  if (queue.drafted) next.push(`${queue.drafted} draft${queue.drafted > 1 ? "s" : ""} not yet with Nick.`);
  if (queue.atNick) next.push(`${queue.atNick} draft${queue.atNick > 1 ? "s" : ""} waiting on Nick's verdict.`);
  if (passAwaitingApprove) next.push(`${passAwaitingApprove} PASSed draft${passAwaitingApprove > 1 ? "s" : ""} waiting on Thomas's approval.`);
  if (queue.approved) next.push(`${queue.approved} approved email${queue.approved > 1 ? "s" : ""} ready to send.`);
  if (inboundUnanswered) next.push(`${inboundUnanswered} inbound repl${inboundUnanswered > 1 ? "ies" : "y"} unanswered (brain_inbound → Lisa).`);
  if (sequenceDue.total) next.push(`${sequenceDue.total} follow-up${sequenceDue.total > 1 ? "s" : ""} due (Email 2: ${sequenceDue.byStep[2]}, 3: ${sequenceDue.byStep[3]}, 4: ${sequenceDue.byStep[4]}). See brain_next_due.`);
  if (!gates.domainWarmed) next.push(g.warmNote);
  if (budget.status !== "ok") next.push(budget.status === "blocked" ? "Claude budget hit: Claude paused until midnight." : `Claude spend past the $${budget.warnUsd} warning.`);
  return { date, queue, approvedUnsent: queue.approved, sentToday, dailyCap: g.dailyCap, sequenceDue, inboundUnanswered, claudeBudget: budget, gates, next };
}
export type FieldSnapshot = Awaited<ReturnType<typeof fieldSnapshot>>;
