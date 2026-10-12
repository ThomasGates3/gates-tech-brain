/**
 * Copy lint — the OUTREACH-BRIEF.md "never assert" list as code. Runs in the
 * browser for the live banner and on the server as a hard gate on Nick submit,
 * Approve, and Send. Anything flagged must be rewritten, not overridden.
 */

export interface LintIssue {
  rule: string;
  match: string;
  /** Missing means "block". Only humanizerWarnings() returns "warn". */
  severity?: "block" | "warn";
  /** Short fix hint for the writer. */
  message?: string;
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

/**
 * AI-writing tells from blader/humanizer (based on Wikipedia "Signs of AI writing").
 * "block" rules run inside lintCopy; "warn" rules only run in humanizerWarnings and never gate a send.
 * Vocabulary rules are body-only and lowercase-only so capitalized business names ("Elevate Med Spa") never match.
 */
interface HumanizerRule { rule: string; re: RegExp; severity: "block" | "warn"; message: string; bodyOnly?: boolean }

const HUMANIZER_RULES: HumanizerRule[] = [
  {
    rule: "Not X but Y", severity: "block", message: "State the point directly instead of contrasting it with something nobody claimed.",
    re: /\bnot\s+(?:just|only|merely|simply)\b[^.?!\n]{1,60}?\bbut\b|\b(?:it|this|that)['’]s\s+not\s+[^.?!\n]{1,40}?[,;.]\s*(?:it|this|that)['’]s\b|\b(?:it|this|that) is not\s+[^.?!\n]{1,40}?[,;.]\s*(?:it|this|that) is\b|\bnot\s+(?:a|an|the)\s+\w+(?:\s+\w+)?,?\s+but\s+(?:a|an|the)\b/gi,
  },
  {
    rule: "Dramatic closer", severity: "block", message: "Cut the one-line closer; end on the last concrete fact.",
    re: /\b(?:let that sink in|read that again|that['’]?s the real (?:win|story|difference)|that is the real (?:win|story|difference)|that distinction matters|the message (?:is|was) clear)\b|\b\w+\.\s+single\.\s+\w+\./gi,
  },
  {
    rule: "Deep saying", severity: "block", message: "Replace the saying with the specific claim.",
    re: /\b(?:the real question is|at its core|in reality|what really matters|the heart of the matter|the deeper issue|fundamentally)\b/gi,
  },
  {
    rule: "Staged opener", severity: "block", message: "Drop the run-up and make the point.",
    re: /(?:^|(?<=[.?!]\s))\s*(?:let['’]?s (?:dive in|dive into|explore|break (?:this|it) down|be honest)|here['’]?s the thing|the thing is|here['’]?s what you need to know|without further ado|real talk|honestly\?|look,)|\bin today['’]?s (?:fast[-\s]paced|digital|competitive|busy|modern|ever[-\s]changing|world|market)\b/gim,
  },
  {
    rule: "Arguing with no one", severity: "block", message: "Remove the defense of a point nobody raised.",
    re: /\b(?:i['’]?m not saying|to be clear|don['’]?t get me wrong|this is(?:n['’]?t| not) (?:to say|about)|this isn['’]t (?:just |really |mainly )?about|you might think|one might (?:be tempted|think|argue)|some might say)\b/gi,
  },
  {
    rule: "Chatbot residue", severity: "block", message: "Remove the chat wrapper and keep the content.",
    re: /\b(?:i hope this helps|hope (?:this|that) helps|let me know if you['’]?d like|let me know if you have any (?:other )?questions|feel free to (?:reach out|contact|let me know)|don['’]?t hesitate to (?:reach out|contact)|great question|you['’]?re absolutely right|as an ai)\b|(?:^|(?<=[.?!]\s))(?:certainly|of course|absolutely)[,.!]/gim,
  },
  {
    rule: "AI vocabulary", severity: "block", bodyOnly: true, message: "Use a plain word an owner would say.",
    re: /\b(?:delv(?:e|es|ed|ing)|tapestr(?:y|ies)|testament|seamless(?:ly)?|meticulous(?:ly)?|pivotal|crucial(?:ly)?|intricat(?:e|ely|ies)|underscor(?:e|es|ed|ing)|foster(?:s|ed|ing)?|elevat(?:e|es|ed|ing)|empower(?:s|ed|ing|ment)?|cutting[-\s]edge|transformative|revolutioni[sz](?:e|es|ed|ing)|world[-\s]class|best[-\s]in[-\s]class|state[-\s]of[-\s]the[-\s]art|next[-\s]level|unlock(?:s|ed)\b|unlock(?:ing)?\b(?!\s+(?:growth|revenue|potential)\b)|navigat(?:e|es|ing) the (?:complex|world|ever|challenges|landscape|intricacies)|(?:digital|competitive|evolving|ever[-\s]changing|business|marketing|current|modern|tech) landscape)\b/g,
  },
  {
    rule: "Rule of three", severity: "warn", message: "Three same-shaped words in a row read as a forced triad.",
    re: /\b(\w+(?:ly|ing|er|est)),\s+(\w+(?:ly|ing|er|est)),?\s+(?:and|or)\s+(\w+(?:ly|ing|er|est))\b/gi,
  },
  {
    rule: "Stacked hedge", severity: "warn", message: "Pick one qualifier or none.",
    re: /\b(?:could|may|might|would)\s+(?:potentially|possibly|perhaps|arguably|conceivably)\b|\b(?:potentially|possibly)\s+(?:could|may|might)\b/gi,
  },
  {
    rule: "Curly quotes", severity: "warn", message: "Use straight quotes.",
    re: /[“”‘’]/g,
  },
  {
    rule: "-ing rider", severity: "warn", message: "Cut the trailing -ing phrase or state it as its own fact.",
    re: /,\s+(?:highlighting|emphasizing|ensuring|reflecting|symbolizing|contributing to|cultivating|encompassing)\b/gi,
  },
  {
    rule: "Soft AI vocabulary", severity: "warn", bodyOnly: true, message: "Say it plainly unless it is a fact the prospect publishes.",
    re: /\b(?:robust|vibrant|holistic|showcas(?:e|es|ed|ing)|enhanc(?:e|es|ed|ing)|additionally|garner\w*|boasts?|nestled|in the heart of|align(?:s|ed)? with)\b/g,
  },
];

/** Lint a draft. `subject` gets the subject-only rules; every text gets the rest. */
export function lintCopy(subject: string, body = ""): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  const add = (rule: string, match: string, message?: string) => {
    const key = `${rule}:${match.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ rule, match: match.trim(), ...(message ? { message } : {}) });
  };
  for (const text of [subject, body]) for (const { rule, re } of RULES) for (const m of text.matchAll(re)) add(rule, m[0]);
  for (const { rule, re, severity, message, bodyOnly } of HUMANIZER_RULES) {
    if (severity !== "block") continue;
    for (const text of bodyOnly ? [body] : [subject, body]) for (const m of text.matchAll(re)) add(rule, m[0], message);
  }
  if (/^\s*(?:re|fwd?):/i.test(subject)) add("Fake reply subject", subject.slice(0, 4));
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) add("Too long", `${words} words (max ${MAX_WORDS})`);
  if ((body.match(/https?:\/\/|www\./gi) ?? []).length > 1) add("Too many links", "max one link");
  return issues;
}

/** Three short sentences in a row that open with the same word ("No setup. No contracts. No waiting."). */
function repeatedOpenings(body: string): string[] {
  const sentences = body.split(/(?<=[.?!])\s+|\n+/).map((x) => x.trim()).filter((x) => x && /[a-z]/i.test(x));
  const hits: string[] = [];
  for (let i = 0; i + 2 < sentences.length; i++) {
    const trio = sentences.slice(i, i + 3);
    if (trio.some((x) => x.split(/\s+/).length > 10)) continue;
    const first = trio.map((x) => x.split(/\s+/)[0].toLowerCase().replace(/[^a-z']/g, ""));
    if (first[0] && first[0] === first[1] && first[1] === first[2]) hits.push(trio.join(" "));
  }
  return hits;
}

/** Weak AI tells. Advisory only: never part of lintCopy/lintDraft, so they never block a draft. */
export function humanizerWarnings(subject: string, body = ""): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  const add = (rule: string, match: string, message: string) => {
    const key = `${rule}:${match.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ rule, match: match.trim(), severity: "warn", message });
  };
  for (const { rule, re, severity, message, bodyOnly } of HUMANIZER_RULES) {
    if (severity !== "warn") continue;
    for (const text of bodyOnly ? [body] : [subject, body]) for (const m of text.matchAll(re)) add(rule, m[0], message);
  }
  for (const m of repeatedOpenings(body)) add("Repeated openings", m, "Merge the sentences or change how they start.");
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
