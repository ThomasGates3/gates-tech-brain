/**
 * Email sequence: Email 1/2/3/4 on Day 1/3/7/12 (counted from the Email 1 send
 * date, America/New_York). Any reply, a KILL/Hold, or an opt-out ends it.
 * Pure date math is exported for tests; the rest reads the store.
 */
import { todayIn } from "./config";
import { listSteps, sequenceContacts } from "./store";
import { db } from "@/db";
import { fieldSuppressions } from "@/db/schema";
import { inArray } from "drizzle-orm";
import type { EmailN } from "./types";

/** Days after Email 1 (Day 1) that each step is due. */
export const STEP_OFFSET_DAYS: Record<EmailN, number> = { 1: 0, 2: 2, 3: 6, 4: 11 };

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Due date (YYYY-MM-DD, ET) of step n, given the Email 1 send instant. */
export function dueDate(email1SentAt: string, n: EmailN): string {
  return addDays(todayIn(undefined, new Date(email1SentAt)), STEP_OFFSET_DAYS[n]);
}

export interface DueItem {
  contact_id: string;
  name: string;
  email: string;
  lane: string;
  email_n: EmailN;
  due_date: string;
  days_overdue: number;
  step_stage: string;
  has_draft: boolean;
  nick: string | null;
  approved: boolean;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** Contacts whose next sequence step is due on or before `date` (default today ET). */
export async function nextDue(date = todayIn()): Promise<DueItem[]> {
  const contacts = (await sequenceContacts()).filter((c) => c.sentAt && !c.repliedAt);
  if (!contacts.length) return [];
  const steps = await listSteps(contacts.map((c) => c.id));
  const blocked = new Set(
    (await db.select().from(fieldSuppressions).where(inArray(fieldSuppressions.email, contacts.map((c) => c.email.toLowerCase()))))
      .filter((s) => s.reason !== "sent_email1")
      .map((s) => s.email)
  );
  const out: DueItem[] = [];
  for (const c of contacts) {
    if (blocked.has(c.email.toLowerCase())) continue;
    const mine = new Map(steps.filter((s) => s.contactId === c.id).map((s) => [s.n, s]));
    for (const n of [2, 3, 4] as const) {
      const s = mine.get(n);
      if (s?.stage === "sent") continue; // done, check the next step
      if (s && (s.stage === "kill" || s.stage === "hold")) break; // sequence stopped here
      const due = dueDate(c.sentAt!, n);
      if (due <= date) {
        out.push({
          contact_id: c.id, name: c.name, email: c.email, lane: c.lane, email_n: n, due_date: due,
          days_overdue: daysBetween(due, date), step_stage: s?.stage ?? "new", has_draft: Boolean(s?.draftHash),
          nick: s?.nickVerdict ?? null, approved: Boolean(s?.approvedHash && s.approvedHash === s.draftHash),
        });
      }
      break; // only the next unsent step matters
    }
  }
  return out.sort((a, b) => b.days_overdue - a.days_overdue || a.name.localeCompare(b.name));
}
