/**
 * Field moments worth a Discord ping (each can be switched off in Settings).
 */
import { notifyOnce } from "@/lib/notify";
import { todayIn, startOfTodayIso } from "./config";
import { leadsFor } from "./leads";
import { approvedStepsCount, sentSince } from "./store";
import { nextDue } from "./sequence";
import { getGates } from "./gates";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** After a send: if nothing approved is left waiting today, say the day's emails are out. */
export async function pingIfDayDone(): Promise<void> {
  const [l, steps, sent] = await Promise.all([leadsFor({}), approvedStepsCount(), sentSince(startOfTodayIso())]);
  if (!sent || l.counts.approvedUnsent || steps) return;
  const today = l.leads.filter((x) => x.sent_at && x.sent_at >= startOfTodayIso());
  const core = today.filter((x) => x.lane === "core").length, web = today.filter((x) => x.lane === "website").length;
  await notifyOnce("emails_done", todayIn(), "All of today's emails are out",
    `${plural(sent, "email")} sent today${today.length ? ` (${core} core, ${web} website)` : ""}. Nothing approved is waiting.`);
}

export async function pingCapReached(cap: number): Promise<void> {
  const l = await leadsFor({});
  await notifyOnce("cap_reached", todayIn(), "Daily send cap hit", `${cap} sent today. ${plural(l.counts.approvedUnsent, "approved email")} will wait until tomorrow.`);
}

export async function pingSendFailed(business: string, emailN: number, error: string): Promise<void> {
  await notifyOnce("send_failed", `${Date.now()}`, `Send failed: ${business}`, `Email ${emailN} didn't go out: ${error.slice(0, 300)}`);
}

/** 7am checks (run after the morning briefing cron). */
export async function morningPings(): Promise<void> {
  const [l, due] = await Promise.all([leadsFor({}), nextDue().catch(() => [])]);
  if (l.counts.passAwaitingApprove)
    await notifyOnce("pass_waiting", todayIn(), "Drafts waiting on your approval", `${plural(l.counts.passAwaitingApprove, "draft")} passed by Nick. Approve them on the Leads page.`);
  if (due.length)
    await notifyOnce("followups_due", todayIn(), "Follow-ups due today", `${plural(due.length, "follow-up")} due: ${due.slice(0, 5).map((d) => `${d.name} (Email ${d.email_n})`).join(", ")}${due.length > 5 ? "…" : ""}.`);
}

/** 6pm weekday check (run after the end-of-day recap cron). */
export async function eveningPings(): Promise<void> {
  const [l, gates] = await Promise.all([leadsFor({}), getGates()]);
  if (l.counts.approvedUnsent)
    await notifyOnce("eod_unsent", todayIn(), "Approved emails left unsent",
      `${plural(l.counts.approvedUnsent, "approved email")} didn't go out today${gates.domainWarmed ? "" : " (warm-up isn't confirmed yet)"}.`);
}
