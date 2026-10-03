/**
 * Leads — the single source of truth for "what's the state of every lead".
 * Reads the Brain DB (Notion only feeds it). Used by brain_today.leads[],
 * brain_field_queue and the Control Center "Today's leads" board, so they always agree.
 */
import { todayIn, fieldEnv } from "./config";
import { listQueue, listSteps } from "./store";
import { lintDraft } from "./lint";
import { getGates } from "./gates";
import { dueDate } from "./sequence";
import type { FieldContact, Lane, Priority } from "./types";

export const EMAIL1_STATUSES = ["undrafted", "drafted", "atNick", "PASS", "approved", "sent", "hold", "kill"] as const;
export type Email1Status = (typeof EMAIL1_STATUSES)[number];

export interface Lead {
  contact_id: string;
  business: string;
  contact_name: string | null;
  email: string;
  lane: Lane;
  source: string;
  tier: Priority;
  email1_status: Email1Status;
  nick_verdict: string | null;
  nick_note: string | null;
  approved: boolean;
  sent_at: string | null;
  subject: string | null;
  lint_issues: number;
  suppressed: boolean;
  replied: boolean;
  hold_reason: string | null;
  sent: boolean;
  booked: boolean;
  paid_offer: string | null;
  /** Nick sent this exact draft back (REVISE) and it hasn't been rewritten yet. */
  revise_pending: boolean;
  duplicate_of: string[];
  duplicates: { contact_id: string; source: string; tier: Priority; email1_status: Email1Status }[];
  next_action: string;
  pack_date: string;
}

export function email1Status(c: FieldContact): Email1Status {
  switch (c.stage) {
    case "new": return "undrafted";
    case "drafted": return "drafted";
    case "nick": return c.nickVerdict === "PASS" && c.nickHash === c.draftHash ? "PASS" : "atNick";
    case "approved":
    case "sending": return "approved";
    case "sent": return "sent";
    case "kill": return "kill";
    default: return "hold";
  }
}

interface ActionCtx { domainWarmed: boolean; aceCanSend: boolean; nextStepDue: string | null }

export function nextAction(c: FieldContact & { suppressed?: boolean }, status: Email1Status, lint: number, ctx: ActionCtx): string {
  if (c.suppressed && status !== "sent") return "Suppressed: do not contact";
  switch (status) {
    case "undrafted": return c.lane === "website" ? "Prospectacle draft" : "Darrell draft";
    case "drafted":
      if (c.nickVerdict === "REVISE" && c.nickHash && c.nickHash === c.draftHash) return "Rewrite per Nick's note";
      if (lint) return `Fix copy lint (${lint} issue${lint > 1 ? "s" : ""})`;
      return c.nickVerdict === "REVISE" ? "Rewritten: Nick audit" : "Nick audit";
    case "atNick": return "Nick audit";
    case "PASS": return "Thomas Approve";
    case "approved":
      if (!ctx.domainWarmed) return "Warm-up: do not send";
      return ctx.aceCanSend ? "Send (Thomas or Ace)" : "Thomas send";
    case "sent":
      if (c.repliedAt) return "Replied: Lisa handoff";
      return ctx.nextStepDue ? `Follow-up due ${ctx.nextStepDue}` : "Sequence complete";
    case "hold":
      if (c.holdReason === "no_published_hours") return "Hold: needs published hours";
      return c.priority === "Soft" ? "Soft hold" : c.holdReason === "thomas" ? "Held by Thomas" : "On hold";
    case "kill": return "Killed";
  }
}

/** Business name for matching: lowercase, no parentheticals, punctuation or company suffixes. */
export function normBusiness(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, " ").replace(/&/g, " ").replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((w) => w && !["llc", "inc", "co", "corp", "ltd", "pllc", "the", "and"].includes(w)).join(" ");
}
const sameBusiness = (a: string, b: string) => {
  const x = normBusiness(a), y = normBusiness(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.split(" ").length >= 2 && l.startsWith(`${s} `);
};
const PROGRESS: Record<Email1Status, number> = { sent: 7, approved: 6, PASS: 5, atNick: 4, drafted: 3, undrafted: 2, hold: 1, kill: 0 };

export interface LeadFilter { date?: string; lane?: Lane; status?: Email1Status; tier?: Priority }

export async function leadsFor(f: LeadFilter = {}) {
  const date = f.date ?? todayIn();
  const [contacts, gates] = await Promise.all([listQueue(date), getGates()]);
  const sentIds = contacts.filter((c) => c.stage === "sent").map((c) => c.id);
  const steps = await listSteps(sentIds);
  const ctxBase = { domainWarmed: gates.domainWarmed, aceCanSend: fieldEnv.aceCanSend() };

  const rows: Lead[] = contacts.map((c) => {
    const status = email1Status(c);
    const lint = c.draftHash ? lintDraft(c.subject, c.body, { lane: c.lane, emailN: 1 }).length : 0;
    let nextStepDue: string | null = null;
    if (status === "sent" && c.sentAt) {
      const done = new Set(steps.filter((s) => s.contactId === c.id && s.stage === "sent").map((s) => s.n));
      const n = ([2, 3, 4] as const).find((k) => !done.has(k));
      nextStepDue = n ? `Email ${n} ${dueDate(c.sentAt, n)}` : null;
    }
    return {
      contact_id: c.id, business: c.name, contact_name: c.contactName, email: c.email, lane: c.lane, source: c.source, tier: c.priority,
      email1_status: status, nick_verdict: c.nickVerdict, nick_note: c.nickNote,
      approved: Boolean(c.approvedHash && c.approvedHash === c.draftHash), sent_at: c.sentAt, subject: c.draftHash ? c.subject : null,
      lint_issues: lint, suppressed: c.suppressed && status !== "sent", replied: Boolean(c.repliedAt),
      sent: Boolean(c.sentAt), booked: Boolean(c.bookedAt), paid_offer: c.paidOffer,
      hold_reason: c.stage === "hold" ? (c.holdReason ?? (c.priority === "Soft" ? "soft" : "other")) : null,
      revise_pending: c.nickVerdict === "REVISE" && Boolean(c.nickHash) && c.nickHash === c.draftHash,
      duplicate_of: [], duplicates: [],
      next_action: nextAction(c, status, lint, { ...ctxBase, nextStepDue }), pack_date: c.packDate,
    };
  });

  // Group duplicates (same email or same business), keep one primary per group:
  // High/Med beats Soft (Soft never hides a real lead), then pipeline progress, then the Notion row.
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      if (rows[i].email.toLowerCase() === rows[j].email.toLowerCase() || sameBusiness(rows[i].business, rows[j].business)) parent[find(j)] = find(i);
  const groups = new Map<number, Lead[]>();
  rows.forEach((r, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), r]));
  const score = (l: Lead) => (l.tier !== "Soft" ? 100 : 0) + PROGRESS[l.email1_status] * 10 + (l.source === "notion" ? 1 : 0);
  const all: Lead[] = [...groups.values()].map((g) => {
    const [primary, ...dups] = [...g].sort((a, b) => score(b) - score(a));
    if (!dups.length) return primary;
    primary.duplicate_of = dups.map((d) => d.contact_id);
    primary.duplicates = dups.map((d) => ({ contact_id: d.contact_id, source: d.source, tier: d.tier, email1_status: d.email1_status }));
    if (primary.email1_status !== "sent") primary.next_action = `Merge ${dups.length} duplicate${dups.length > 1 ? "s" : ""}, then ${primary.next_action}`;
    return primary;
  });
  all.sort((a, b) => contacts.findIndex((c) => c.id === a.contact_id) - contacts.findIndex((c) => c.id === b.contact_id));

  const by = (fn: (l: Lead) => boolean) => all.filter(fn).length;
  const counts = {
    total: all.length,
    core: by((l) => l.lane === "core" && l.tier !== "Soft"),
    website: by((l) => l.lane === "website" && l.tier !== "Soft"),
    undrafted: by((l) => l.email1_status === "undrafted"),
    drafted: by((l) => l.email1_status === "drafted"),
    awaitingNick: by((l) => l.email1_status === "atNick"),
    passAwaitingApprove: by((l) => l.email1_status === "PASS"),
    approvedUnsent: by((l) => l.email1_status === "approved"),
    sent: by((l) => l.email1_status === "sent"),
    softHold: by((l) => l.tier === "Soft" && l.email1_status === "hold"),
    hold: by((l) => l.email1_status === "hold"),
    kill: by((l) => l.email1_status === "kill"),
    duplicates: by((l) => l.duplicate_of.length > 0),
  };
  const leads = all.filter((l) => (!f.lane || l.lane === f.lane) && (!f.status || l.email1_status === f.status) && (!f.tier || l.tier === f.tier));
  return { date, counts, gates: { domainWarmed: gates.domainWarmed, warmNote: gates.warmNote, dailyCap: gates.dailyCap, aceCanSend: ctxBase.aceCanSend }, leads };
}
