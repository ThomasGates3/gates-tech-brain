/**
 * Field snapshot — the real state of today's Email 1 operation in one object.
 * Feeds brain_today (MCP/REST), the deck's briefing + stats, and the Morning
 * Briefing / End-of-Day Recap automations (so they never invent numbers).
 */
import { fieldEnv, startOfTodayIso, todayIn } from "./config";
import { listQueue, sentSince } from "./store";
import { claudeBudget } from "@/lib/budget";

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
  };
  const sentToday = await sentSince(startOfTodayIso()).catch(() => 0);
  const budget = await claudeBudget();
  const gates = {
    agentmail: Boolean(fieldEnv.agentmailKey() && fieldEnv.agentmailInbox()),
    inbox: fieldEnv.agentmailInbox() || null,
    notion: Boolean(fieldEnv.notionToken() && fieldEnv.notionDataSource()),
    mailingAddress: Boolean(fieldEnv.mailingAddress()),
    domainWarmed: fieldEnv.domainWarmed(),
    aceCanSend: fieldEnv.aceCanSend(),
  };
  const next: string[] = [];
  if (!contacts.length) next.push("No pack loaded for today: load the morning pack from Notion.");
  if (queue.undrafted) next.push(`${queue.undrafted} High/Med contact${queue.undrafted > 1 ? "s" : ""} not drafted yet (Darrell).`);
  if (queue.drafted) next.push(`${queue.drafted} draft${queue.drafted > 1 ? "s" : ""} not yet with Nick.`);
  if (queue.atNick) next.push(`${queue.atNick} draft${queue.atNick > 1 ? "s" : ""} waiting on Nick's verdict.`);
  if (passAwaitingApprove) next.push(`${passAwaitingApprove} PASSed draft${passAwaitingApprove > 1 ? "s" : ""} waiting on Thomas's approval.`);
  if (queue.approved) next.push(`${queue.approved} approved email${queue.approved > 1 ? "s" : ""} ready to send.`);
  if (!gates.domainWarmed) next.push("Cold domain warm-up is unconfirmed.");
  if (budget.status !== "ok") next.push(budget.status === "blocked" ? "Claude budget hit: Claude paused until midnight." : `Claude spend past the $${budget.warnUsd} warning.`);
  return { date, queue, sentToday, dailyCap: fieldEnv.dailyCap(), claudeBudget: budget, gates, next };
}
export type FieldSnapshot = Awaited<ReturnType<typeof fieldSnapshot>>;
