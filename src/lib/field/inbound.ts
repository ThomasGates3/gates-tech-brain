/**
 * Inbound replies (read + classify). Pulls recent AgentMail threads, matches the
 * sender to a Field contact, and SUGGESTS an action. It never replies. It only
 * suppresses when the caller passes confirm. A matched reply ends that contact's
 * sequence (brief: "a reply of any kind ends the sequence").
 */
import { listThreads } from "./agentmail";
import { fieldEnv } from "./config";
import { addSuppression, contactsByEmail, markReplied } from "./store";
import { notifyOnce } from "@/lib/notify";
import { advance, isWarmupSeed } from "@/lib/roadmap";

export type InboundAction = "reply_handoff_lisa" | "soft_hold" | "suppress_opt_out" | "ignore";

/** First thing the person actually wrote (quoted history removed). */
export function firstWords(text: string): string {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (/^on .+wrote:$/i.test(l) || /^-{2,}\s*original message/i.test(l) || /^from:\s/i.test(l)) break;
    if (l.startsWith(">")) continue;
    if (l) lines.push(l);
  }
  return lines.join(" ").slice(0, 500);
}

export function classifyReply(text: string, from: string): { action: InboundAction; reason: string } {
  const t = firstWords(text).toLowerCase();
  if (/mailer-daemon|postmaster/.test(from) || /undeliverable|delivery status notification|address not found|delivery has failed|could not be delivered/.test(t))
    return { action: "ignore", reason: "bounce: consider brain_suppress with reason bounce" };
  if (/out of (the )?office|auto(matic|-)?\s?reply|on vacation|away until|currently out|limited access to email/.test(t)) return { action: "ignore", reason: "auto-reply" };
  if (/^(no|nope|stop|unsubscribe|remove( me)?|no thanks?|no,? thank you|not interested|pass)\b[.!]?/.test(t) || /\b(unsubscribe|remove me|stop emailing|take me off|opt(-| )?out|don'?t (email|contact) me|not interested)\b/.test(t))
    return { action: "suppress_opt_out", reason: "opt-out (reply \"no\" / stop / not interested)" };
  if (/\b(not (right )?now|maybe later|later this year|next (month|quarter|year)|circle back|reach out (later|in)|busy (right now|season)|after the holidays|check back)\b/.test(t))
    return { action: "soft_hold", reason: "not now: hold and revisit" };
  return { action: "reply_handoff_lisa", reason: "real reply: hand to Lisa for a short human answer" };
}

export interface InboundItem {
  thread_id: string;
  from: string;
  subject: string;
  snippet: string;
  last_at: string;
  unanswered: boolean;
  suggested: InboundAction;
  reason: string;
  contact?: { contact_id: string; name: string; lane: string; stage: string };
  suppressed?: boolean;
}

export async function fetchInbound(opts: { inbox?: string; limit?: number; confirmSuppress?: boolean; by: string }) {
  const inbox = (opts.inbox || fieldEnv.agentmailInbox()).toLowerCase();
  if (!inbox) throw new Error("No inbox: set AGENTMAIL_INBOX_ID or pass inbox_id.");
  const threads = (await listThreads(inbox, opts.limit ?? 25)).filter((t) => t.labels.includes("received") || t.senders.some((s) => s !== inbox));
  const senderOf = (t: (typeof threads)[number]) => t.senders.find((s) => s && s !== inbox) ?? t.lastFrom;
  const contacts = await contactsByEmail(threads.map(senderOf));
  const byEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c]));

  const matched: InboundItem[] = [];
  const unmatched: InboundItem[] = [];
  for (const t of threads) {
    const from = senderOf(t);
    const { action, reason } = classifyReply(t.lastFrom === inbox ? t.preview : t.lastText, from);
    const item: InboundItem = { thread_id: t.threadId, from, subject: t.subject, snippet: firstWords(t.lastText || t.preview).slice(0, 280), last_at: t.lastAt, unanswered: t.lastFrom !== inbox, suggested: action, reason };
    const c = byEmail.get(from);
    if (c) {
      item.contact = { contact_id: c.id, name: c.name, lane: c.lane, stage: c.stage };
      await markReplied(c.id, t.lastAt); // ends the sequence for this contact
    }
    // A real prospect reply moves "First reply" to now; Lisa or Thomas marks it done.
    if (c && action === "reply_handoff_lisa" && !isWarmupSeed(from)) await advance("first_reply", "now", "brain", `reply ${t.threadId}`);
    if (item.unanswered && action === "reply_handoff_lisa")
      void notifyOnce("hot_reply", t.threadId, `Reply from ${c?.name ?? from}`, `${item.snippet || t.subject}\nSuggested: hand to Lisa for a short answer.`);
    if (opts.confirmSuppress && action === "suppress_opt_out") {
      await addSuppression(from, "opt_out", opts.by);
      item.suppressed = true;
    }
    (c ? matched : unmatched).push(item);
  }
  const all = [...matched, ...unmatched];
  return { inbox, matched, unmatched, unanswered: all.filter((i) => i.unanswered).length, suppressed: all.filter((i) => i.suppressed).length };
}

let cache: { at: number; n: number } | null = null;
/** Unanswered inbound count for the Control Center (cached 2 min; null if AgentMail is unavailable). */
export async function unansweredCount(): Promise<number | null> {
  if (cache && Date.now() - cache.at < 120_000) return cache.n;
  try {
    const threads = await listThreads(fieldEnv.agentmailInbox().toLowerCase(), 25);
    const inbox = fieldEnv.agentmailInbox().toLowerCase();
    const n = threads.filter((t) => t.lastFrom && t.lastFrom !== inbox).length;
    cache = { at: Date.now(), n };
    return n;
  } catch {
    return null;
  }
}
