import { z } from "zod";
import type { FieldContact } from "@/lib/field/types";
import { WEBSITE_MASTER_PROMPT } from "./master-prompt";

/** The master prompt's "Before you build" checklist; anything not known yet becomes a question. */
export const BriefAnswers = z.object({
  what_they_sell: z.string().max(300).optional(),
  target_customer: z.string().max(300).optional(),
  desired_outcome: z.string().max(300).optional(),
  conversion_goal: z.string().max(200).optional(),
  differentiator: z.string().max(300).optional(),
  social_proof: z.string().max(600).optional(),
  brand_personality: z.string().max(120).optional(),
  pages: z.string().max(200).optional(),
});
export type BriefAnswers = z.infer<typeof BriefAnswers>;

const QUESTIONS: Record<keyof BriefAnswers, string> = {
  what_they_sell: "Business name and what they sell (product, service, or offer)",
  target_customer: "Target customer (who are they, what do they want, what are they afraid of?)",
  desired_outcome: "The outcome the customer wants from them",
  conversion_goal: "Primary conversion goal (book a call, buy now, sign up, get a quote?)",
  differentiator: "Key differentiator (why this business over competitors?)",
  social_proof: "Social proof available (testimonials, logos, metrics, awards?)",
  brand_personality: "Brand personality (premium, friendly, bold, minimal, luxury, energetic?)",
  pages: "Must-have pages (home, about, services, contact, pricing, etc.)",
};

/**
 * Website build brief for a lead: the master prompt verbatim, then the filled
 * "Build a website for…" message. Unknown answers stay as [BRACKETS] and are returned as questions.
 */
export function websiteBrief(c: FieldContact, a: BriefAnswers = {}) {
  const v = (k: keyof BriefAnswers, slot: string) => a[k]?.trim() || `[${slot}]`;
  const where = c.city ? ` in ${c.city}` : "";
  const message =
    `Build a website for ${c.name}${where}. They are a ${v("what_they_sell", "TYPE OF BUSINESS")} that helps ${v("target_customer", "TARGET CUSTOMER")} achieve ${v("desired_outcome", "DESIRED OUTCOME")}. ` +
    `Their primary offer is ${v("what_they_sell", "OFFER")}. Their brand personality is ${v("brand_personality", "PERSONALITY")}. The main conversion goal is ${v("conversion_goal", "ACTION")}. ` +
    `Here's what I know about their social proof: ${v("social_proof", "PROOF")}.` +
    (a.differentiator ? `\nKey differentiator: ${a.differentiator}.` : "") +
    (a.pages ? `\nMust-have pages: ${a.pages}.` : "") +
    (c.siteUrl ? `\nTheir current site: ${c.siteUrl}` : "") +
    (c.gap || c.notes ? `\nWhat we observed on it: ${[c.gap, c.notes].filter(Boolean).join(" ")}` : "");
  const ask = (Object.keys(QUESTIONS) as (keyof BriefAnswers)[]).filter((k) => !a[k]?.trim()).map((k) => ({ field: k, question: QUESTIONS[k] }));
  return { master_prompt: WEBSITE_MASTER_PROMPT, build_message: message, ask, ready: ask.length === 0 };
}
