/**
 * AI BRAIN — UX Helpers
 * ---------------------------------------------------------------------------
 * Small, pure utilities for the Jarvis experience layer.
 * No side effects. No imports from other app modules.
 */

// ─────────────────────────────────────────────────────────────────────────
// Time-of-day greeting
// ─────────────────────────────────────────────────────────────────────────

export type GreetingPeriod = "morning" | "afternoon" | "evening" | "night";

export function getGreetingPeriod(date = new Date()): GreetingPeriod {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export function getGreeting(date = new Date()): string {
  const period = getGreetingPeriod(date);
  const map: Record<GreetingPeriod, string> = {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    night: "Working late",
  };
  return map[period];
}

// ─────────────────────────────────────────────────────────────────────────
// Proactive insight formatter
// ─────────────────────────────────────────────────────────────────────────

export interface ProactiveInsight {
  id: string;
  priority: "high" | "medium" | "low";
  headline: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
  /** ISO timestamp of when this insight was generated */
  at: string;
}

/**
 * formatInsightAge — human-readable relative time for an insight.
 * e.g. "just now", "3 min ago", "2 hrs ago", "yesterday"
 */
export function formatInsightAge(isoAt: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(isoAt).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  return "yesterday";
}

/**
 * sortInsights — highest priority first, then most recent.
 */
export function sortInsights(insights: ProactiveInsight[]): ProactiveInsight[] {
  const order: Record<ProactiveInsight["priority"], number> = { high: 0, medium: 1, low: 2 };
  return [...insights].sort((a, b) => {
    const po = order[a.priority] - order[b.priority];
    if (po !== 0) return po;
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });
}

/**
 * Mock proactive insights — replace with real orchestrator data later.
 */
export function getMockInsights(vertical: string): ProactiveInsight[] {
  const now = new Date().toISOString();
  const mockMap: Record<string, ProactiveInsight[]> = {
    agency: [
      {
        id: "ag-1",
        priority: "high",
        headline: "3 client deliverables are overdue",
        detail: "Meridian rebrand (2d), Summit deck (1d), and Waverly copy review (4h) need attention before end of day.",
        actionLabel: "View overdue",
        at: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      {
        id: "ag-2",
        priority: "medium",
        headline: "I've drafted 2 client status reports",
        detail: "Acme Corp and Northbridge reports are ready for your review. Sending on your approval.",
        actionLabel: "Review drafts",
        at: new Date(Date.now() - 22 * 60_000).toISOString(),
      },
    ],
    accounting: [
      {
        id: "ac-1",
        priority: "high",
        headline: "$48,200 in outstanding invoices flagged",
        detail: "3 clients are 30+ days overdue. I've prepared a chase email sequence for your approval.",
        actionLabel: "Approve emails",
        at: now,
      },
    ],
    law: [
      {
        id: "lw-1",
        priority: "high",
        headline: "4 matter deadlines in the next 72 hours",
        detail: "Easton v. Marsh (filing), Klein intake call, Pryor deposition prep, and Summit contract review.",
        actionLabel: "View calendar",
        at: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
    ],
    medical: [
      {
        id: "md-1",
        priority: "medium",
        headline: "2 SOPs flagged for review",
        detail: "Sterilisation protocol and new patient intake SOP haven't been updated since 2023.",
        actionLabel: "Review SOPs",
        at: new Date(Date.now() - 30 * 60_000).toISOString(),
      },
    ],
    insurance: [
      {
        id: "in-1",
        priority: "high",
        headline: "7 policy renewals due this week",
        detail: "Anderson, Briggs, and 5 others haven't confirmed renewal. I've drafted outreach for each.",
        actionLabel: "Approve outreach",
        at: new Date(Date.now() - 2 * 60_000).toISOString(),
      },
    ],
  };
  return sortInsights(mockMap[vertical] ?? mockMap["agency"]);
}
