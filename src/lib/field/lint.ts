/**
 * Copy lint — the OUTREACH-BRIEF.md "never assert" list as code. Runs in the
 * browser for the live banner and on the server as a hard gate on Nick submit,
 * Approve, and Send. Anything flagged must be rewritten, not overridden.
 */

export interface LintIssue {
  rule: string;
  match: string;
}

export const MAX_WORDS = 110;

const RULES: { rule: string; re: RegExp }[] = [
  { rule: "Dollar amount", re: /\$\s?\d[\d,.]*\s?[kKmM]?/g },
  { rule: "Currency word", re: /\b\d[\d,.]*\s?(?:k\s)?(?:dollars?|bucks|usd)\b/gi },
  { rule: "Currency code", re: /\bUSD\b/g },
  { rule: "Recurring amount", re: /\b\d[\d,.]*\s?(?:\/\s?(?:mo|month|yr|year|wk|week)|per\s+(?:month|year|week|meeting|lead|booked))\b/gi },
  { rule: "Price talk", re: /\b(?:price[ds]?|pricing|retainer|invoice|discount(?:ed)?|deposit|setup fee|monthly fee)\b/gi },
  { rule: "Percentage", re: /\b\d+(?:\.\d+)?\s?%/g },
  { rule: "Client claim", re: /\b\d+\+?\s+(?:clients|customers|businesses|companies|med ?spas|spas|practices|shops)\b/gi },
  { rule: "Gates SKU", re: /\b(?:offer\s?1|speed[-\s]to[-\s]lead|google reviews desk|gates core|care plan)\b/gi },
  { rule: "Banned word", re: /\b(?:weak|week)\w*/gi },
  { rule: "Em dash", re: /—/g },
  { rule: "En dash", re: /–/g },
  // A hyphen standing alone between words is punctuation; real compounds (after-hours) have no spaces.
  { rule: "Clause hyphen", re: /(?<=\S)\s+-\s+(?=\S)/g },
  { rule: "HIPAA claim", re: /\bHIPAA[-\s]+(?:compliant|compliance|certified|certification|approved)\b/gi },
  { rule: "Banned phrase", re: /\b(?:never miss (?:a|another) call|hope this (?:email )?finds you|quick question|circling back|just bumping|game[-\s]?changer|revolutionary|supercharge\w*|ai transformation|act now|guarantee[ds]?|free)\b|\b10x\b/gi },
  // AI-isms (voice rules): sound templated, never how Thomas talks.
  { rule: "AI-ism", re: /\b(?:one[-\s]?pagers?|tear[-\s]?downs?|pulled an?\b|quick question about|deep[-\s]?dive|touch(?:ing)? base|leverag(?:e|ing)|synerg\w*|streamlin\w*|unlock(?:ing)? (?:growth|revenue|potential))\b/gi },
  { rule: "Replaces staff", re: /\breplac\w*\s+(?:your\s+)?(?:staff|team|receptionists?|front desk)\b/gi },
  { rule: "Exclamation mark", re: /!/g },
  { rule: "Emoji", re: /\p{Extended_Pictographic}/gu },
];

/** Lint a draft. `subject` gets the subject-only rules; every text gets the rest. */
export function lintCopy(subject: string, body = ""): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  const add = (rule: string, match: string) => {
    const key = `${rule}:${match.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ rule, match: match.trim() });
  };
  for (const text of [subject, body]) for (const { rule, re } of RULES) for (const m of text.matchAll(re)) add(rule, m[0]);
  if (/^\s*(?:re|fwd?):/i.test(subject)) add("Fake reply subject", subject.slice(0, 4));
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) add("Too long", `${words} words (max ${MAX_WORDS})`);
  if ((body.match(/https?:\/\/|www\./gi) ?? []).length > 1) add("Too many links", "max one link");
  return issues;
}

/**
 * Website-lane Email 1 (Prospectacle): the "asset" is three concrete site fixes
 * written inside the body as "1." "2." "3." lines. No links or attachments.
 */
export function websiteEmail1Lint(body: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const nums = [...body.matchAll(/^\s*(\d+)[.)]\s+\S/gm)].map((m) => Number(m[1]));
  const ok = nums.length === 3 && nums[0] === 1 && nums[1] === 2 && nums[2] === 3;
  if (!ok) issues.push({ rule: "Website fixes", match: `needs exactly 3 numbered fixes (1. 2. 3.), found ${nums.length}` });
  for (const m of body.matchAll(/https?:\/\/\S+|\bwww\.\S+/gi)) issues.push({ rule: "Link in website Email 1", match: m[0] });
  if (/\b(attach(ed|ment)|see (the )?(file|pdf|deck)|download)\b/i.test(body)) issues.push({ rule: "Attachment mention", match: "no files or attachments in cold email" });
  for (const m of body.matchAll(WEBSITE_JARGON)) issues.push({ rule: "Website jargon", match: m[0] });
  for (const m of body.matchAll(WEBSITE_PEJORATIVE)) issues.push({ rule: "Put-down", match: m[0] });
  if (!body.includes(WEBSITE_CLOSER)) issues.push({ rule: "Website closer", match: `needs the line "${WEBSITE_CLOSER}"` });
  // The name isn't famous: only the signature (and the CAN-SPAM footer, added at send) may say Gates.
  const unsigned = body.split("\n").filter((l) => !/^\s*(?:Thomas Gates III|Gates Technologies\b.*)\s*$/.test(l)).join("\n");
  for (const m of unsigned.matchAll(/\bGates\b/gi)) issues.push({ rule: "Gates in body", match: m[0] });
  return issues;
}

/** The only closer before the ask on every website Email 1. */
export const WEBSITE_CLOSER = "We build sites with booking built in.";

// Terms an owner wouldn't recognize, and openers that fail the annoyance test (2026-10-02 Nick audit).
const WEBSITE_JARGON = /\b(?:x?html\d?|classic[-\s]mobile|legacy table(?:[-\s]layout)?|table[-\s]html|webador|wix|squarespace|godaddy builder|cms|seo|template stack|dom|css|javascript)\b/gi;
const WEBSITE_PEJORATIVE = /\b(?:seo filler|generic filler|thin brand|unfinished for|junk site|looks cheap|amateur|bad site|terrible|ugly)\b/gi;

// ── Core lane: hours honesty ────────────────────────────────────────────────
const DAY = /\b(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)s?\b/gi;
const TIME = /\b(?:\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)|\d{1,2}(?::\d{2})?\s?(?:to|-|–)\s?\d{1,2}(?::\d{2})?|(?:at|until|till|by|from|opens at|closes at)\s\d{1,2}(?::\d{2})?|noon|midnight)\b/i;
const VAGUE_HOURS = /\b(?:limited (?:blocks|hours|windows)|sparse (?:saturday|weekend|hours)|depending on when the desk closes|unclear who answers|after[-\s]close coverage depends|odd hours|irregular hours|whenever the desk)\b/gi;

/** Published hours a reader can check: at least two weekdays named and a concrete time. */
export function hasConcreteHours(text: string): boolean {
  const days = new Set((text.match(DAY) ?? []).map((d) => d.toLowerCase().slice(0, 3)));
  return days.size >= 2 && TIME.test(text);
}

/** Core Email 1: the opener must quote real published times; no vague hours talk. */
export function coreEmail1Lint(body: string): LintIssue[] {
  const issues: LintIssue[] = [];
  // The opener is the first real paragraph; a greeting line ("Rabah," / "Hi Nina,") doesn't count.
  const SALUTATION = /^(?:(?:hi|hello|hey|dear)\s+)?[\p{L}.'-]+(?:\s[\p{L}.'-]+)?,$/u;
  const opener = body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !SALUTATION.test(p)) ?? "";
  const sentences = opener.split(/(?<=[.!?])\s+/);
  if (!sentences.some((x) => (x.match(DAY) ?? []).length > 0 && TIME.test(x)))
    issues.push({ rule: "Hours opener", match: "first lines must name a day and a published time (e.g. \"Wednesday 9 to 4\")" });
  for (const m of body.matchAll(VAGUE_HOURS)) issues.push({ rule: "Vague hours", match: m[0] });
  if (/monday (?:to|through|-|–) friday[^.\n]{0,80}\bfriday\b/i.test(body)) issues.push({ rule: "Friday contradiction", match: "say \"Monday to Thursday … and Friday …\"" });
  return issues;
}

/** All copy issues for a draft, including lane rules for website Email 1. */
export function lintDraft(subject: string, body: string, opts: { lane?: string; emailN?: number } = {}): LintIssue[] {
  const base = lintCopy(subject, body);
  if ((opts.emailN ?? 1) !== 1) return base;
  if (opts.lane === "website") return [...base, ...websiteEmail1Lint(body)];
  if (opts.lane === "core") return [...base, ...coreEmail1Lint(body)];
  return base;
}
