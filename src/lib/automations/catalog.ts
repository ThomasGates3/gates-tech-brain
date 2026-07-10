/**
 * Automation catalog — native to the Brain (no n8n).
 * Each template is a reusable Job the Conductor can run: it reasons over the
 * task, calls specialists/connectors, and delivers a result. Grounded in the
 * /dev domains: real estate, trading, content, social, ops.
 *
 * Turn a template into a scheduled Job with createJob() (scheduler/jobs.ts),
 * or run one on demand via POST /api/automations.
 */
import type { JobTrigger, Vertical } from "@/lib/types";

export type AutomationCategory = "real-estate" | "trading" | "content" | "social" | "ops";

export interface AutomationTemplate {
  id: string;
  name: string;
  category: AutomationCategory;
  description: string; // one line — what it does + why it's worth it
  trigger: JobTrigger; // default schedule/trigger
  deliverTo: ("deck" | "slack" | "email")[];
  requires: string[]; // connector ids it wants (informational; degrades gracefully)
  vertical?: Vertical;
  /** The instruction handed to the Conductor. {{var}} placeholders filled at run time. */
  prompt: string;
}

export const AUTOMATIONS: AutomationTemplate[] = [
  // ── Real estate (gates-acquisitions, lotlens, land-estimation, speed-to-lead) ──
  {
    id: "speed-to-lead",
    name: "Speed-to-Lead Responder",
    category: "real-estate",
    description: "New seller lead → qualify, pull comps, draft an offer and a first text — in under 60s.",
    trigger: { kind: "webhook", secretRef: "WEBHOOK_SECRET_LEADS" },
    deliverTo: ["deck", "slack"],
    requires: ["webhook"],
    vertical: "agency",
    prompt:
      "A new seller lead just arrived: {{lead}}. Qualify it (motivation, timeline, condition), " +
      "estimate ARV and a wholesale-friendly max offer from any available comps, and draft a warm, " +
      "concise first text to the seller plus a one-line internal summary for the acquisitions team. " +
      "If you lack comp data, state the assumptions you used.",
  },
  {
    id: "dead-lead-reactivation",
    name: "Dead-Lead Reactivation",
    category: "real-estate",
    description: "Weekly: re-engage cold seller leads with a personalized nudge so no deal rots in the CRM.",
    trigger: { kind: "cron", expression: "0 15 * * 1" }, // Mondays 15:00 UTC
    deliverTo: ["deck", "email"],
    requires: ["webhook"],
    prompt:
      "Review our cold/aged seller leads. Pick the 10 highest-potential to re-engage this week and, for each, " +
      "write a short personalized follow-up message referencing why now might be the right time to sell. " +
      "Rank them and explain the prioritization.",
  },

  // ── Trading (ai-trading-journal, xauusd-printer, bullcycle-binoculars) ──
  {
    id: "nightly-journal-review",
    name: "Nightly Trade-Journal Review",
    category: "trading",
    description: "End of day: tag setups, compute win-rate by setup, and flag rule violations.",
    trigger: { kind: "cron", expression: "0 22 * * 1-5" }, // weekdays 22:00 UTC
    deliverTo: ["deck"],
    requires: [],
    prompt:
      "Review today's trades from the journal. Tag each by setup, compute win-rate and R-multiple by setup, " +
      "and flag any trades that broke the plan (over-leverage, revenge trades, no stop). End with one concrete " +
      "adjustment for tomorrow.",
  },

  // ── Content (ad-system Veo/HeyGen, threads-content-simplifier) ──
  {
    id: "faceless-video-factory",
    name: "Faceless Video Factory",
    category: "content",
    description: "Topic → researched hook + full script + shotlist, ready to hand to Veo/HeyGen.",
    trigger: { kind: "manual" },
    deliverTo: ["deck"],
    requires: [],
    prompt:
      "Create a faceless short-form video on: {{topic}}. Research the angle, write a scroll-stopping 3-second hook, " +
      "a 45–60s script in spoken cadence, an on-screen text/shotlist, and 5 title options. Optimize for retention.",
  },
  {
    id: "repurpose-to-threads",
    name: "Repurpose to Threads",
    category: "content",
    description: "One long piece → 10 native Threads/X posts, each standalone and hooky.",
    trigger: { kind: "manual" },
    deliverTo: ["deck"],
    requires: [],
    prompt:
      "Turn this into 10 standalone Threads posts: {{content}}. Each must hook in the first line, carry one idea, " +
      "and read natively (no 'thread 🧵' filler). Vary the formats (hot take, story, list, question).",
  },

  // ── Social (ai-growth-engine, google-review) ──
  {
    id: "weekly-client-report",
    name: "Weekly Client Report",
    category: "social",
    description: "Friday: pull the week's metrics and write a client-ready report — unattended.",
    trigger: { kind: "cron", expression: "0 16 * * 5" }, // Fridays 16:00 UTC
    deliverTo: ["email", "deck"],
    requires: ["webhook"],
    vertical: "agency",
    prompt:
      "Produce this week's client report for {{client}}: what we shipped, key metrics vs last week (with % deltas), " +
      "wins, and next week's plan. Professional but plain-spoken. Flag anything that needs the client's decision.",
  },

  // ── Ops (sop, goal-execution-os) ──
  {
    id: "morning-briefing",
    name: "Morning Situational Briefing",
    category: "ops",
    description: "7am: cross-system briefing — what changed overnight and what needs you first.",
    trigger: { kind: "cron", expression: "0 12 * * *" }, // 12:00 UTC ~ 7am ET
    deliverTo: ["deck"],
    requires: [],
    prompt:
      "Give me a situational briefing for the day: what changed overnight across the business, the 3 things that " +
      "need my attention first, and anything you already handled. Lead with the single most important item.",
  },
  {
    id: "competitor-watch",
    name: "Competitor Watch",
    category: "ops",
    description: "Weekly: research named competitors and summarize what changed (pricing, launches, hiring).",
    trigger: { kind: "cron", expression: "0 13 * * 1" }, // Mondays 13:00 UTC
    deliverTo: ["deck", "email"],
    requires: [],
    prompt:
      "Research our competitors: {{competitors}}. Summarize notable changes in the last week (pricing, product launches, " +
      "positioning, hiring signals) and what it means for us. Cite sources.",
  },

  // ── Added round: more per-domain automations ──
  {
    id: "comp-analysis",
    name: "Instant Comp Analysis",
    category: "real-estate",
    description: "Address in → ARV, repair band, and a wholesale max-offer with the math shown.",
    trigger: { kind: "manual" },
    deliverTo: ["deck", "slack"],
    requires: [],
    prompt:
      "Run a comp analysis for {{address}}. Estimate ARV from comparable sales, a light/medium/heavy repair band, " +
      "and a wholesale max offer (target margin {{margin}}). Show the formula and state every assumption.",
  },
  {
    id: "premarket-prep",
    name: "Pre-Market Trading Prep",
    category: "trading",
    description: "Weekday 6am: watchlist key levels, overnight news, and sentiment — before the open.",
    trigger: { kind: "cron", expression: "0 10 * * 1-5" }, // 10:00 UTC ~ 6am ET
    deliverTo: ["slack", "deck"],
    requires: [],
    prompt:
      "Pre-market prep for my watchlist {{watchlist}}. For each: key support/resistance, any overnight news, and a " +
      "one-line bias. Flag the single highest-probability setup for the session. Be concise.",
  },
  {
    id: "content-calendar",
    name: "Weekly Content Calendar",
    category: "content",
    description: "Monday: a full week of post ideas per platform, mapped to your niche and goals.",
    trigger: { kind: "cron", expression: "0 14 * * 1" }, // Mondays 14:00 UTC
    deliverTo: ["deck", "slack"],
    requires: [],
    prompt:
      "Build a 7-day content calendar for {{niche}} across {{platforms}}. For each day give a hook, format, and CTA, " +
      "balanced across educate/entertain/convert. Keep it native to each platform.",
  },
  {
    id: "review-responder",
    name: "Google Review Responder",
    category: "social",
    description: "New review lands → draft an on-brand reply (recover the 1-stars, amplify the 5-stars).",
    trigger: { kind: "webhook", secretRef: "WEBHOOK_SECRET_REVIEWS" },
    deliverTo: ["slack"],
    requires: ["webhook"],
    prompt:
      "A new Google review came in: {{review}}. Draft a warm, on-brand reply. If it's negative, acknowledge, take it " +
      "offline, and offer a fix; if positive, thank them specifically and reinforce what they liked. Keep it human.",
  },
  {
    id: "eod-recap",
    name: "End-of-Day Recap",
    category: "ops",
    description: "6pm: what got done, what slipped, and the top 3 for tomorrow — so nothing falls through.",
    trigger: { kind: "cron", expression: "0 23 * * 1-5" }, // 23:00 UTC ~ 6pm ET
    deliverTo: ["slack", "deck"],
    requires: [],
    prompt:
      "Give me an end-of-day recap: what got done today, what slipped and why, anything waiting on someone else, and " +
      "the top 3 priorities for tomorrow ranked by impact.",
  },
];

export function listAutomations(category?: AutomationCategory): AutomationTemplate[] {
  return category ? AUTOMATIONS.filter((a) => a.category === category) : AUTOMATIONS;
}

export function getAutomation(id: string): AutomationTemplate | undefined {
  return AUTOMATIONS.find((a) => a.id === id);
}

/** Fill {{placeholders}} in a template prompt from a vars map. */
export function fillPrompt(prompt: string, vars: Record<string, string> = {}): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `(${k} not provided)`);
}
