/**
 * Discord pings Thomas can switch on or off (Settings → Notifications).
 * notifyOnce() fires only when the ping is on and only once per key
 * (e.g. once per day for "all emails are out"). Every ping is logged to Activity.
 */
import { getSetting, setSetting } from "@/lib/settings";
import { deliver } from "@/lib/automations/deliver";
import { recordActivity } from "@/lib/activity";

export const NOTIFICATIONS = [
  { id: "emails_done", label: "All of today's emails are out", when: "Right after the last approved email of the day sends.", default: true },
  { id: "cap_reached", label: "Daily send cap hit", when: "When the cap stops sends while approved emails are still waiting.", default: false },
  { id: "send_failed", label: "A send failed", when: "Right away, when AgentMail rejects an email.", default: false },
  { id: "hot_reply", label: "Someone replied wanting to talk", when: "When a reply is a real answer (not an opt-out or auto-reply) and needs Lisa.", default: false },
  { id: "pass_waiting", label: "Drafts waiting on your approval", when: "7am, if Nick has passed drafts you haven't approved yet.", default: false },
  { id: "followups_due", label: "Follow-ups due today", when: "7am, if any Email 2, 3 or 4 is due.", default: false },
  { id: "eod_unsent", label: "Approved emails left unsent", when: "6pm weekdays, if approved emails didn't go out today.", default: false },
] as const;
export type NotifyId = (typeof NOTIFICATIONS)[number]["id"];

export async function notifyEnabled(id: NotifyId): Promise<boolean> {
  const v = await getSetting(`notify_${id}`).catch(() => undefined);
  return v === undefined ? NOTIFICATIONS.find((n) => n.id === id)!.default : v === "on";
}

export async function setNotify(id: NotifyId, on: boolean): Promise<void> {
  await setSetting(`notify_${id}`, on ? "on" : "off");
}

export async function notificationSettings() {
  return Promise.all(NOTIFICATIONS.map(async (n) => ({ ...n, on: await notifyEnabled(n.id) })));
}

/** Send a Discord ping if this notification is on and `key` hasn't been pinged yet. Never throws. */
export async function notifyOnce(id: NotifyId, key: string, title: string, body: string, opts: { force?: boolean } = {}): Promise<boolean> {
  try {
    if (!opts.force && !(await notifyEnabled(id))) return false;
    const mark = `notified_${id}_${key}`;
    if (!opts.force && (await getSetting(mark))) return false;
    await setSetting(mark, new Date().toISOString());
    await deliver(["discord"], { title, body });
    await recordActivity({ kind: "sent", target: `Discord ping: ${title}`, because: body.slice(0, 200), agent: "brain" });
    return true;
  } catch {
    return false;
  }
}
