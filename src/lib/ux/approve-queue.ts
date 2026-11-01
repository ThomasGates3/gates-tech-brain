/**
 * Pure helpers for the phone approve view (/m) and the phone redirect.
 * No I/O here: every action still goes through /api/v1/tools (same gates as the bots).
 */

export interface QueueLead {
  contact_id: string;
  business: string;
  contact_name: string | null;
  email: string;
  tier: string;
  email1_status: string;
  suppressed: boolean;
  lint_issues: number;
}

const TIER_RANK: Record<string, number> = { High: 0, Med: 1, Soft: 2 };

/**
 * Cards to approve: Nick PASS on the current draft, not suppressed, clean lint,
 * minus anything with an action still in its undo window. High tier first.
 */
export function approveQueue<T extends QueueLead>(leads: T[], pendingIds: ReadonlySet<string> = new Set()): T[] {
  return leads
    .filter((l) => l.email1_status === "PASS" && !l.suppressed && l.lint_issues === 0 && !pendingIds.has(l.contact_id))
    .sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9) || a.business.localeCompare(b.business));
}

/** Approved but not sent yet: what the "Send N approved" button sends, one at a time. */
export function approvedUnsent<T extends QueueLead>(leads: T[]): T[] {
  return leads.filter((l) => l.email1_status === "approved" && !l.suppressed);
}

/** "6 waiting · 0 sent · cap 10 · warm-up ✓" — only real numbers, nothing invented. */
export function statusLine(s: { waiting: number; sent: number; cap: number; warmed: boolean }): string {
  return `${s.waiting} waiting · ${s.sent} sent · cap ${s.cap} · warm-up ${s.warmed ? "✓" : "✗"}`;
}

/** Sends left today under the daily cap (never negative). */
export function capLeft(sent: number, cap: number): number {
  return Math.max(0, cap - sent);
}

/** Phones (not tablets) get redirected from / to /m. iPad and Android tablets stay on desktop. */
export function isPhoneUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (/iPad|Tablet/i.test(ua)) return false;
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return true;
  return /Android/i.test(ua) && /Mobile/i.test(ua);
}

/** Swipe decision for a released card: far enough right = approve, left = hold. */
export function swipeAction(dx: number, threshold = 96): "approve" | "hold" | null {
  if (dx >= threshold) return "approve";
  if (dx <= -threshold) return "hold";
  return null;
}
