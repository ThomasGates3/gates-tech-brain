import { z } from "zod";
import type { FieldContact } from "@/lib/field/types";
import { WEBSITE_MASTER_PROMPT } from "./master-prompt";
import { SITE_TEMPLATE } from "./site-template";
import { mediaBrief } from "./media";
import { WEBSITE_BLUEPRINT } from "./blueprint";
import { LAUNCH_CHECKLIST } from "./checklist";

/** The master prompt's "Before you build" checklist; anything not known yet becomes a question. */
export const BriefAnswers = z.object({
  what_they_sell: z.string().max(300).optional(),
  offer: z.string().max(300).optional(),
  target_customer: z.string().max(300).optional(),
  desired_outcome: z.string().max(300).optional(),
  conversion_goal: z.string().max(200).optional(),
  differentiator: z.string().max(300).optional(),
  social_proof: z.string().max(600).optional(),
  brand_personality: z.string().max(120).optional(),
  pages: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  // Optional HeyGen spokesperson; never asked for, used when given.
  spokesperson_script: z.string().max(1500).optional(),
  heygen_avatar_id: z.string().max(100).optional(),
});
export type BriefAnswers = z.infer<typeof BriefAnswers>;

type Asked = Exclude<keyof BriefAnswers, "spokesperson_script" | "heygen_avatar_id">;

const QUESTIONS: Record<Asked, string> = {
  what_they_sell: "Business name and what they sell (product, service, or offer)",
  offer: "Their primary offer (the main service or package a visitor should act on)",
  target_customer: "Target customer (who are they, what do they want, what are they afraid of?)",
  desired_outcome: "The outcome the customer wants from them",
  conversion_goal: "Primary conversion goal (book a call, buy now, sign up, get a quote?)",
  differentiator: "Key differentiator (why this business over competitors?)",
  social_proof: "Social proof available (testimonials, logos, metrics, awards?)",
  brand_personality: "Brand personality (premium, friendly, bold, minimal, luxury, energetic?)",
  pages: "Must-have pages (home, about, services, contact, pricing, etc.)",
  phone: "Business phone number (for the tap-to-call button)",
};

/**
 * Website build brief for a lead: the master prompt verbatim, the Gates Website
 * Blueprint (4-part layout + 20-point launch checklist, wins over the master
 * prompt), the filled "Build a website for…" message, the static site template,
 * and the Higgsfield / HeyGen media brief. Unknown answers stay as [BRACKETS] and
 * are returned as questions.
 */
export function websiteBrief(c: FieldContact, a: BriefAnswers = {}) {
  const v = (k: keyof BriefAnswers, slot: string) => a[k]?.trim() || `[${slot}]`;
  const where = c.city ? ` in ${c.city}` : "";
  const message =
    `Build a website for ${c.name}${where}. They are a ${v("what_they_sell", "TYPE OF BUSINESS")} that helps ${v("target_customer", "TARGET CUSTOMER")} achieve ${v("desired_outcome", "DESIRED OUTCOME")}. ` +
    `Their primary offer is ${v("offer", "OFFER")}. Their brand personality is ${v("brand_personality", "PERSONALITY")}. The main conversion goal is ${v("conversion_goal", "ACTION")}. ` +
    `Here's what I know about their social proof: ${v("social_proof", "PROOF")}.` +
    (a.differentiator ? `\nKey differentiator: ${a.differentiator}.` : "") +
    (a.pages ? `\nMust-have pages: ${a.pages}.` : "") +
    (a.phone ? `\nPhone for tap-to-call: ${a.phone}.` : "") +
    (c.siteUrl ? `\nTheir current site: ${c.siteUrl}` : "") +
    (c.gap || c.notes ? `\nWhat we observed on it: ${[c.gap, c.notes].filter(Boolean).join(" ")}` : "") +
    "\nFollow the Gates Website Blueprint: hero video + CTA with free scrolling, then See the Transformation, Real Reviews (verified Google reviews only) and the quote form wired to our lead sheet / GoHighLevel webhook. " +
    "Ship and verify all 20 launch checklist items before opening a PR.";
  const ask = (Object.keys(QUESTIONS) as Asked[]).filter((k) => !a[k]?.trim()).map((k) => ({ field: k, question: QUESTIONS[k] }));
  const media = mediaBrief(c, [a.what_they_sell, a.offer].filter(Boolean).join(" "), a);
  return { master_prompt: WEBSITE_MASTER_PROMPT, blueprint: WEBSITE_BLUEPRINT, launch_checklist: LAUNCH_CHECKLIST.map(({ n, label }) => ({ n, label })), build_message: message, site_template: SITE_TEMPLATE, media, ask, ready: ask.length === 0 };
}
