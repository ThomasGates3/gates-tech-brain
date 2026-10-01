/**
 * Field playbook — Email 1, built on docs/outreach-brief.md (the only source of
 * truth for what we may say). Shape: one verified observation (the Notion
 * "Gap"), the problem as a scene, one plain line on what we do, an
 * interest-first ask, a human signature. Under 110 words, no prices, no claims.
 * The physical address + opt-out are NOT in the draft: canSpamFooter() appends
 * them to every send so they can never be edited out.
 */
import { OUTREACH_BRIEF } from "./brief";
import type { FieldContact } from "./types";

export interface Signer {
  name: string;
  company: string;
  site: string;
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

const HOURS_GAP = /\b(hours?|close[ds]?|schedule|after[-\s]hours|weekends?|mon|tue|wed|thu|fri|sat|sun)/i;
const TREATMENT_NICHE = /\b(spa|medspa|med|aesthetic|derm|wellness|clinic|laser|skin|beauty|salon|lash|brow|barber|dental)/i;

/** Rewrite a gap note into brief-safe copy: no banned "week" words, no em dashes. */
export function cleanGap(gap: string): string {
  return gap
    .trim()
    .replace(/\bweekends\b/gi, "Saturdays and Sundays")
    .replace(/\bweekend\b/gi, "Saturday and Sunday")
    .replace(/\bweekdays?\b/gi, "Monday to Friday")
    .replace(/\b(?:all|the whole|seven days a) week\b/gi, "every day")
    .replace(/\b(?:each|every|per|a) week\b/gi, "every seven days")
    .replace(/\s*—\s*/g, ", ")
    .replace(/([^.!?])$/, "$1.");
}

export function signature(signer: Signer): string {
  return `${signer.name}\n${signer.company}${signer.site ? ` · ${signer.site}` : ""}`;
}

/** Deterministic Email 1. With no verified gap it sends the generic version (brief §7). */
export function templateDraft(c: Pick<FieldContact, "name" | "gap" | "batch">, signer: Signer): Draft {
  const gap = c.gap.trim() ? cleanGap(c.gap) : "";
  const hours = HOURS_GAP.test(gap);
  const busy = TREATMENT_NICHE.test(`${c.batch} ${c.name}`) ? "with a client" : "out on a job";
  const scene = !gap
    ? "When the phone rings and nobody can pick up, that call usually doesn't come back."
    : hours
      ? "So a call after you close has nowhere to go."
      : `So a call that comes in while you're ${busy} has nowhere to go.`;
  const body = [
    gap,
    `${scene} Most people don't leave a voicemail and they don't call twice. They book with whoever picks up.`,
    "We set up a system that answers after hours, texts back any missed call, and puts the appointment into whatever calendar you already run.",
    "Worth a look, or do you have that covered already?",
    signature(signer),
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: hours ? "calls after you close" : `missed calls at ${shortName(c.name)}`, body };
}

export const PLAYBOOK_SYSTEM = `You write Email 1 (the first cold touch) for Gates Technologies.
The outreach brief below is the ONLY source of truth. If a fact is not in it, you do not know it.

How this console works (overrides the brief's template where they differ):
- Return a subject and a body. The body ends with the signature exactly as given. Do NOT write a
  physical address or an opt-out line: the console appends both to every send automatically.
- The "Observed gap" is the one verified fact about this business. Use it as the observation
  line, in plain words, without adding anything to it. If it is empty, send the generic version.
- Do not mention the city. Do not guess an owner name. No link in Email 1.
- Body under 110 words including the signature.
- The banned-word rule includes "weekday", "weekdays", "weeknight", "weekend" and "weekly". Write
  "Monday to Friday", "Saturday and Sunday" or "every seven days" instead.

<outreach_brief>
${OUTREACH_BRIEF}
</outreach_brief>`;

export function playbookPrompt(c: Pick<FieldContact, "name" | "gap" | "batch">, signer: Signer): string {
  return [
    `Business: ${c.name}`,
    `Niche / batch: ${c.batch || "(unknown, do not assume a vertical)"}`,
    `Observed gap: ${c.gap.trim() ? cleanGap(c.gap) : "(none verified, send the generic version)"}`,
    `Signature:\n${signature(signer)}`,
    "",
    "Write Email 1 (subject + body).",
  ].join("\n");
}

/** CAN-SPAM footer appended at send time. Shown in the preview so Approve sees it. */
export function canSpamFooter(address: string): string {
  return `${address}\nReply "stop" and I won't write again.`;
}

export function composeOutgoing(body: string, footer: string | null): string {
  return footer ? `${body.trimEnd()}\n\n${footer}` : body;
}
