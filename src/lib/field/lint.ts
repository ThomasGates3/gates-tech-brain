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
