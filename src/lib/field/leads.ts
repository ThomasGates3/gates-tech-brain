/**
 * Leads — the single source of truth for "what's the state of every lead".
 * Reads the Brain DB (Notion only feeds it). Used by brain_today.leads[],
 * brain_field_queue and the Control Center "Today's leads" board, so they always agree.
 */
import { todayIn, fieldEnv } from "./config";
import { listQueue, listSteps } from "./store";
import { lintCopy } from "./lint";
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
  duplicate_of: string[];
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
      if (lint) return `Fix copy lint (${lint} issue${lint > 1 ? "s" : ""})`;
      return c.nickVerdict === "REVISE" ? "Revise per Nick, then Nick audit" : "Nick audit";
    case "atNick": return "Nick audit";
    case "PASS": return "Thomas Approve";
    case "approved":
      if (!ctx.domainWarmed) return "Warm-up: do not send";
      return ctx.aceCanSend ? "Send (Thomas or Ace)" : "Thomas send";
    case "sent":
      if (c.repliedAt) return "Replied: Lisa handoff";
      return ctx.nextStepDue ? `Follow-up due ${ctx.nextStepDue}` : "Sequence complete";
    case "hold": return c.priority === "Soft" ? "Soft hold" : "On hold";
    case "kill": return "Killed";
  }
}

export interface LeadFilter { date?: string; lane?: Lane; status?: Email1Status; tier?: Priority }

export async function leadsFor(f: LeadFilter = {}) {
  const date = f.date ?? todayIn();
  const [contacts, gates] = await Promise.all([listQueue(date), getGates()]);
  const sentIds = contacts.filter((c) => c.stage === "sent").map((c) => c.id);
  const steps = await listSteps(sentIds);
  const ctxBase = { domainWarmed: gates.domainWarmed, aceCanSend: fieldEnv.aceCanSend() };

  const byEmail = new Map<string, string[]>();
  for (const c of contacts) byEmail.set(c.email.toLowerCase(), [...(byEmail.get(c.email.toLowerCase()) ?? []), c.id]);
  const all: Lead[] = contacts.map((c) => {
    const status = email1Status(c);
    const lint = c.draftHash ? lintCopy(c.subject, c.body).length : 0;
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
      duplicate_of: (byEmail.get(c.email.toLowerCase()) ?? []).filter((id) => id !== c.id),
      next_action: nextAction(c, status, lint, { ...ctxBase, nextStepDue }), pack_date: c.packDate,
    };
  });

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
  for (const l of all) if (l.duplicate_of.length && l.email1_status !== "sent") l.next_action = `Duplicate email: merge (brain_merge_contacts), then ${l.next_action}`;
  const leads = all.filter((l) => (!f.lane || l.lane === f.lane) && (!f.status || l.email1_status === f.status) && (!f.tier || l.tier === f.tier));
  return { date, counts, gates: { domainWarmed: gates.domainWarmed, warmNote: gates.warmNote, dailyCap: gates.dailyCap, aceCanSend: ctxBase.aceCanSend }, leads };
}
