/**
 * Field playbook — Email 1.
 *
 * Shape is lifted from the Email 1 bodies already in the Notion "Cold emails"
 * DB (2026-09-24 ATL med spa batch): one observed gap, one plain sentence on
 * what we put on top, a 15-minute ask, signature, soft opt-out. Human voice,
 * short, NO prices. The template is deterministic (no model needed); the
 * Claude path uses the same rules + examples and is linted the same way.
 */
import type { FieldContact } from "./types";

export interface Signer {
  name: string;
  company: string;
}

export interface Draft {
  subject: string;
  body: string;
}

/** "Marietta (East Cobb / Lower Roswell)" → "Marietta" */
export function shortCity(city: string): string {
  return city.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

/** "Revive Health Center & Spa" → "revive health center" (≤3 words, lowercase). */
export function shortName(name: string): string {
  const base = name.split(/\s*(?:&|\||-|–|—|,)\s*/)[0] ?? name;
  return base.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase();
}

const HOURS_GAP = /\b(hours?|closed|schedule|appointment|weekend|after[-\s]hours|mon|tue|wed|thu|fri|sat|sun)/i;
const TREATMENT_NICHE = /\b(spa|medspa|med|aesthetic|derm|wellness|clinic|laser|skin|beauty|salon|lash|brow)/i;

export function templateDraft(c: Pick<FieldContact, "name" | "city" | "gap" | "batch">, signer: Signer): Draft {
  const gap = c.gap.trim().replace(/([^.!?])$/, "$1.");
  const busy = TREATMENT_NICHE.test(`${c.batch} ${c.name}`) ? "tied up in a treatment" : "out on a job";
  const where = shortCity(c.city);
  const subject = `${shortName(c.name)} ${HOURS_GAP.test(c.gap) ? "hours" : "front desk"}`;
  const body = [
    `Saw ${c.name}${where ? ` in ${where}` : ""} this week.`,
    gap,
    `When the desk is closed or ${busy}, those rings often sit. We put missed call recovery and after hours booking on top of what you already run so those people still book.`,
    "Worth a 15 minute look?",
    `${signer.name}\n${signer.company}`,
    "Not a fit? Reply 'no' and I won't follow up.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject, body };
}

export const PLAYBOOK_SYSTEM = `You write Email 1 for Gates Technologies' Field cold outreach to local service businesses.

Rules (hard):
- Human voice. Plain, short, specific. 60-110 words. No hype, no exclamation marks, no emojis.
- NEVER mention prices, dollar amounts, fees, retainers, discounts, or plan/SKU names.
- Lead with the ONE observed gap you are given, restated in your own plain words. Do not invent facts beyond it.
- One sentence on what we do: we put missed call recovery and after hours booking on top of what they already run.
- Ask: "Worth a 15 minute look?"
- Sign off with the signer name and company on two lines.
- End with exactly: Not a fit? Reply 'no' and I won't follow up.
- Subject: 2-4 words, all lowercase, no punctuation, references the business (e.g. "cosmo med spa hours").

Examples of approved Email 1 bodies:
---
Saw Revive Health Center & Spa in Woodstock this week.

Published schedule is closed Tuesday and Sunday, so those days have no desk to take booking calls.

When the desk is closed or tied up in a treatment, those rings often sit. We put missed call recovery and after hours booking on top of what you already run so those people still book.

Worth a 15 minute look?

Thomas
Gates Technologies

Not a fit? Reply 'no' and I won't follow up.
---
Saw Cosmo Med Spa & Salon in Alpharetta this week.

Published hours are Tuesday-Saturday 9-5 with Sunday and Monday closed, so early-week callers hit a closed desk.

When the desk is closed or tied up in a treatment, those rings often sit. We put missed call recovery and after hours booking on top of what you already run so those people still book.

Worth a 15 minute look?

Thomas
Gates Technologies

Not a fit? Reply 'no' and I won't follow up.
---`;

export function playbookPrompt(c: Pick<FieldContact, "name" | "city" | "gap" | "batch">, signer: Signer): string {
  return [
    `Business: ${c.name}`,
    `City: ${shortCity(c.city) || "(unknown)"}`,
    `Niche / batch: ${c.batch || "(unknown)"}`,
    `Observed gap: ${c.gap || "(none recorded — keep it general about missed calls when the desk is busy)"}`,
    `Signer: ${signer.name}, ${signer.company}`,
    "",
    "Write Email 1 (subject + body).",
  ].join("\n");
}

/** CAN-SPAM footer appended at send time. Shown in the preview so Approve sees it. */
export function canSpamFooter(company: string, address: string): string {
  return `--\n${company}\n${address}`;
}

export function composeOutgoing(body: string, footer: string | null): string {
  return footer ? `${body.trimEnd()}\n\n${footer}` : body;
}
