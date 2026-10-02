/**
 * Automation catalog — Gates Technologies only. Every automation is DRAFT-ONLY:
 * it produces text for a human (or Nick/Thomas) to act on. Nothing here sends
 * outreach; Email 1 goes out only through the Field path (Nick PASS → Approve → send).
 *
 * {{field}} and {{activity}} are filled automatically with real data at run time.
 */
import type { JobTrigger } from "@/lib/types";

export type AutomationCategory = "clients" | "ops";

export interface AutomationTemplate {
  id: string;
  name: string;
  category: AutomationCategory;
  description: string;
  trigger: JobTrigger;
  deliverTo: ("deck" | "slack" | "discord" | "email")[];
  requires: string[];
  /** Inputs the caller should pass (filled into {{name}}). */
  inputs?: string[];
  /** Allow Claude web search (max 5 searches/run). */
  webSearch?: boolean;
  prompt: string;
}

const DRAFT_ONLY = "DRAFT ONLY: nothing is sent or posted; a human reviews it first. No prices, stats, guarantees or client claims.";

export const AUTOMATIONS: AutomationTemplate[] = [
  {
    id: "morning-briefing",
    name: "Morning Situational Briefing",
    category: "ops",
    description: "7am: today's Field status and the 3 things that need Thomas first, from real data.",
    trigger: { kind: "cron", expression: "0 12 * * *" }, // 12:00 UTC ~ 7am ET
    deliverTo: ["deck", "discord"],
    requires: [],
    prompt:
      "Today's Gates Technologies Field snapshot (real data, JSON): {{field}}\nRecent activity: {{activity}}\n\n" +
      "Write Thomas's morning briefing: lead with the single most important item, then the 3 things that need him first, " +
      "then anything already handled. Use only numbers from the snapshot; if something is unknown, say so. Under 150 words.",
  },
  {
    id: "eod-recap",
    name: "End-of-Day Recap",
    category: "ops",
    description: "6pm: what got done, what slipped, and the top 3 for tomorrow, from real data.",
    trigger: { kind: "cron", expression: "0 23 * * 1-5" }, // 23:00 UTC ~ 6pm ET
    deliverTo: ["deck", "discord"],
    requires: [],
    prompt:
      "Today's Field snapshot (real data, JSON): {{field}}\nToday's activity: {{activity}}\n\n" +
      "Write the end-of-day recap: what got done, what slipped (and why, if the data shows it), and the top 3 for tomorrow. " +
      "Only use numbers that appear above. Under 150 words.",
  },
  {
    id: "speed-to-lead",
    name: "Speed-to-Lead Responder",
    category: "clients",
    description: "Missed call or new lead → draft the text-back and a one-line summary. Draft only until approved.",
    trigger: { kind: "webhook", secretRef: "WEBHOOK_SECRET_LEADS" },
    deliverTo: ["deck", "discord"],
    requires: ["speed-to-lead"],
    inputs: ["lead"],
    prompt:
      "A new lead or missed call came in for a Gates Technologies client: {{lead}}\n" +
      "Draft a short, warm text-back that helps them book, plus a one-line internal summary (who, what they want, urgency). " + DRAFT_ONLY,
  },
  {
    id: "dead-lead-reactivation",
    name: "Dead-Lead Reactivation",
    category: "clients",
    description: "Re-engage dormant leads with short, consent-aware follow-ups. Draft only.",
    trigger: { kind: "cron", expression: "0 15 * * 1" }, // Mondays 15:00 UTC
    deliverTo: ["deck"],
    requires: [],
    inputs: ["leads"],
    prompt:
      "Dormant leads for a Gates Technologies client: {{leads}}\n" +
      "Pick up to 10 worth re-engaging, rank them with a one-line reason, and draft a short, consent-aware follow-up for each " +
      "that references their original inquiry. Skip anyone who opted out. " + DRAFT_ONLY,
  },
  {
    id: "review-responder",
    name: "Google Review Responder",
    category: "clients",
    description: "New review → draft an on-brand reply for the client to post. Draft only.",
    trigger: { kind: "webhook", secretRef: "WEBHOOK_SECRET_REVIEWS" },
    deliverTo: ["deck"],
    requires: [],
    inputs: ["business", "review"],
    prompt:
      "A new Google review came in for {{business}}: {{review}}\n" +
      "Draft a warm, specific reply. Negative: acknowledge, take it offline, offer a fix. Positive: thank them for exactly what they " +
      "praised. Never discuss medical outcomes or private details. " + DRAFT_ONLY,
  },
  {
    id: "competitor-watch",
    name: "Competitor Watch",
    category: "ops",
    description: "Research named competitors (web search) and summarize what changed and what it means for Gates.",
    trigger: { kind: "cron", expression: "0 13 * * 1" }, // Mondays 13:00 UTC
    deliverTo: ["deck", "discord"],
    requires: [],
    inputs: ["competitors"],
    webSearch: true,
    prompt:
      "Gates Technologies sells a call-recovery system (after-hours AI phone agent, missed-call text-back, booking into the client's " +
      "existing calendar) to local service businesses, med spas first. Research these competitors: {{competitors}}. " +
      "Summarize notable recent changes (pricing, launches, positioning) and what each means for Gates. Cite sources. Under 250 words.",
  },
  {
    id: "weekly-client-report",
    name: "Weekly Client Report",
    category: "clients",
    description: "Friday: turn a client's metrics into a plain-spoken report. Draft only.",
    trigger: { kind: "cron", expression: "0 16 * * 5" }, // Fridays 16:00 UTC
    deliverTo: ["deck"],
    requires: [],
    inputs: ["client", "metrics"],
    prompt:
      "Write this period's report for Gates Technologies client {{client}} from these metrics and notes: {{metrics}}\n" +
      "Cover what we shipped, results versus last period (only figures provided above), wins, and next steps. Flag anything that " +
      "needs the client's decision. Plain-spoken, under 250 words. " + DRAFT_ONLY,
  },
];

export function getAutomation(id: string): AutomationTemplate | undefined {
  const key = id.toLowerCase().replace(/[\s_]+/g, "-");
  return AUTOMATIONS.find((a) => a.id === key || a.name.toLowerCase() === id.toLowerCase());
}

export function listAutomations(category?: AutomationCategory): AutomationTemplate[] {
  return category ? AUTOMATIONS.filter((a) => a.category === category) : AUTOMATIONS;
}

/** Fill {{var}} placeholders; unfilled ones become "(not provided)". */
export function fillPrompt(prompt: string, vars: Record<string, string>): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "(not provided)");
}
