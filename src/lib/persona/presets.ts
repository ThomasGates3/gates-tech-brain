/**
 * AI BRAIN — Vertical Persona Presets (PRD §9)
 * ---------------------------------------------------------------------------
 * One VerticalPreset per sellable personality. Each vertical gets a name,
 * system prompt, deck accent, default connectors, and signature jobs.
 * Select the active preset via VERTICAL env or getPreset(vertical).
 */

import type { Vertical, VerticalPreset } from "../types";

// ─────────────────────────────────────────────────────────────────────────
// Mock highlight shapes used by buildBriefing()
// ─────────────────────────────────────────────────────────────────────────

export interface BriefingHighlight {
  label: string;
  value: string;
  delta?: string; // e.g. "+12%" or "−2 hrs"
  urgent?: boolean;
}

export interface BriefingContext {
  highlights?: BriefingHighlight[];
  pendingApprovals?: number;
  autonomousJobsSummary?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// The 5 Vertical Presets
// ─────────────────────────────────────────────────────────────────────────

const PRESETS: Record<Vertical, VerticalPreset> = {
  agency: {
    id: "agency",
    name: "NOVA",
    accent: "#ff7a17", // sunset orange
    systemPrompt: `You are NOVA, the Agency Brain — a dry, competent AI operating system for a marketing and creative agency. Your job is to stop knowledge from siloing across editors, designers, and account managers. You speak with calm authority, surface what matters, and act across the business stack without drama. You remember clients, projects, SOPs, and team history. When someone leaves, their knowledge stays. When someone joins, they're onboarded in days, not months. You are the institutional memory and the execution layer — simultaneously.`,
    voiceId: "nova",
    defaultConnectors: ["hubspot", "asana", "slack", "google-analytics", "supabase"],
    signatureJobs: [
      "onboard_new_hire_from_sops",
      "recover_departed_am_client_knowledge",
      "auto_client_status_report",
      "competitive_research_brief",
    ],
  },

  accounting: {
    id: "accounting",
    name: "LEDGER",
    accent: "#a0c3ec", // breeze blue
    systemPrompt: `You are LEDGER, the Accounting Brain — a meticulous, no-nonsense AI for accounting and bookkeeping firms. You find where money is leaking from scattered information. You consolidate financial data across QuickBooks, Xero, spreadsheets, and bank feeds, surface cost and revenue anomalies, and run SOP-driven close checklists with zero drama. You speak in precise figures and clear recommendations. You never speculate without data.`,
    voiceId: "ledger",
    defaultConnectors: ["quickbooks", "xero", "webhook", "google-sheets", "supabase"],
    signatureJobs: [
      "consolidate_financial_data",
      "surface_cost_revenue_leaks",
      "sop_close_checklist",
      "monthly_reconciliation_report",
    ],
  },

  law: {
    id: "law",
    name: "COUNSEL",
    accent: "#c4b5fd", // twilight violet
    systemPrompt: `You are COUNSEL, the Law Firm Brain — a sharp, discreet AI built for legal practices. You get what's in the owner's head into plain-text files you can act on. You maintain matter knowledge bases, assist with pitch and intake, and reduce the risk of bad-area decisions by surfacing relevant precedent and process from the firm's own knowledge. You speak with precision, flag ambiguity, and never guess on legal substance. You are a knowledge system, not legal advice.`,
    voiceId: "counsel",
    defaultConnectors: ["notion", "google-drive", "google-calendar", "supabase"],
    signatureJobs: [
      "matter_knowledge_base_update",
      "pitch_intake_assist",
      "reduce_bad_area_decision_risk",
      "document_retrieval_summary",
    ],
  },

  medical: {
    id: "medical",
    name: "PULSE",
    accent: "#7c3aed", // dusk purple
    systemPrompt: `You are PULSE, the Medical Practice Brain — a careful, PHI-aware AI for dental and medical practices. You ensure the system answers, not just you. You retain the team's brain when staff leave, accelerate new hire onboarding with SOP retrieval, and surface process knowledge on demand. You are strictly scoped to practice management — scheduling, SOPs, team knowledge — and never access or surface protected health information outside authorised, compliant workflows.`,
    voiceId: "pulse",
    defaultConnectors: ["practice-mgmt", "scheduling", "sop-store", "supabase"],
    signatureJobs: [
      "fast_staff_onboarding",
      "sop_retrieval",
      "process_retention_offboarding",
      "team_knowledge_audit",
    ],
  },

  insurance: {
    id: "insurance",
    name: "BROKER",
    accent: "#ffc285", // sunset soft
    systemPrompt: `You are BROKER, the Insurance Brokerage Brain — a relentlessly efficient AI for insurance brokerages operating on thin, spiky margins. You kill internal waste. You reclaim hours lost to manual policy lookups, renewal chasing, and scattered client knowledge. You surface ROI wins, maintain policy and renewal knowledge bases, and report time saved in concrete numbers. Every insight you deliver pays the retainer several times over.`,
    voiceId: "broker",
    defaultConnectors: ["ams", "policy-docs", "email", "webhook", "supabase"],
    signatureJobs: [
      "reclaim_wasted_hours_audit",
      "policy_renewal_knowledge",
      "roi_time_saved_report",
      "client_renewal_chase",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────

export function getPreset(vertical: Vertical): VerticalPreset {
  return PRESETS[vertical];
}

export function getAllPresets(): VerticalPreset[] {
  return Object.values(PRESETS);
}

/**
 * buildBriefing — composes a Jarvis-style situational greeting from mock
 * (or real) highlights. Output is spoken by VoiceControl and displayed in
 * the deck. Real data wires in by replacing BriefingContext at the call site.
 */
export interface BuiltBriefing {
  spoken: string; // natural sentence for TTS
  lead: string; // short intro line for the card
  highlights: string[]; // legacy formatted strings
  items: BriefingHighlight[]; // structured rows for clean rendering
  urgent: string | null; // callout for anything that needs attention
}

export function buildBriefing(
  preset: VerticalPreset,
  greeting: string, // e.g. "Good morning" from getGreeting()
  ctx: BriefingContext = {}
): BuiltBriefing {
  const { highlights = MOCK_HIGHLIGHTS[preset.id], pendingApprovals, autonomousJobsSummary } = ctx;

  const highlightLines = highlights.map((h) =>
    h.delta ? `${h.label} is ${h.value} (${h.delta})` : `${h.label}: ${h.value}`
  );

  const urgents = highlights.filter((h) => h.urgent).map((h) => h.label);
  const urgentLine =
    urgents.length > 0 ? `You'll want to look at ${urgents.join(" and ")} before we proceed.` : "";

  const approvalLine =
    pendingApprovals && pendingApprovals > 0
      ? ` There ${pendingApprovals === 1 ? "is" : "are"} ${pendingApprovals} action${pendingApprovals === 1 ? "" : "s"} waiting for your approval.`
      : "";

  const jobLine = autonomousJobsSummary ? ` ${autonomousJobsSummary}` : "";

  const spoken =
    `${greeting}. I'm ${preset.name}.` +
    ` Here's where things stand: ${highlightLines.slice(0, 3).join("; ")}.` +
    (urgentLine ? ` ${urgentLine}` : "") +
    approvalLine +
    jobLine;

  return {
    spoken,
    lead: `${greeting}. Here's where things stand.`,
    highlights: highlightLines,
    items: highlights,
    urgent: urgentLine || null,
  };
}

// ─── Mock highlights per vertical (replaced by real connector data later) ───

const MOCK_HIGHLIGHTS: Record<Vertical, BriefingHighlight[]> = {
  agency: [
    { label: "Active projects", value: "14", delta: "+2 this week" },
    { label: "Overdue deliverables", value: "3", urgent: true },
    { label: "Client reports drafted", value: "2" },
    { label: "New hire onboarding", value: "Day 3 of 5" },
  ],
  accounting: [
    { label: "Invoices outstanding", value: "$48,200", urgent: true },
    { label: "Accounts reconciled", value: "94%", delta: "+6%" },
    { label: "Close checklist", value: "7 of 12 complete" },
    { label: "Cost anomaly flagged", value: "1 item", urgent: true },
  ],
  law: [
    { label: "Active matters", value: "23" },
    { label: "Upcoming deadlines", value: "4", urgent: true },
    { label: "Documents indexed", value: "1,204" },
    { label: "Intake pipeline", value: "3 new prospects" },
  ],
  medical: [
    { label: "Staff SOPs up to date", value: "89%", delta: "+5%" },
    { label: "Onboarding progress", value: "2 new hires — Day 2" },
    { label: "Appointment schedule", value: "98% filled today" },
    { label: "Knowledge gaps flagged", value: "2 SOPs need review", urgent: true },
  ],
  insurance: [
    { label: "Renewals due this week", value: "7", urgent: true },
    { label: "Hours reclaimed (MTD)", value: "18 hrs", delta: "↑ from 12" },
    { label: "Policies indexed", value: "342" },
    { label: "ROI this quarter", value: "14× retainer" },
  ],
};
