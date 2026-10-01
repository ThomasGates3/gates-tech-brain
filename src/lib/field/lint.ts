/**
 * Price lint — Email 1 copy must never carry prices, dollar amounts, or Gates
 * SKU names (Field playbook rule). Runs in the browser for the live banner and
 * on the server as a hard gate on Nick submit, Approve, and Send.
 */

export interface LintIssue {
  rule: string;
  match: string;
}

const RULES: { rule: string; re: RegExp }[] = [
  { rule: "Dollar amount", re: /\$\s?\d[\d,.]*\s?[kKmM]?/g },
  { rule: "Currency word", re: /\b\d[\d,.]*\s?(?:k\s)?(?:dollars?|bucks|usd)\b/gi },
  { rule: "Currency code", re: /\bUSD\b/g },
  { rule: "Recurring amount", re: /\b\d[\d,.]*\s?(?:\/\s?(?:mo|month|yr|year|wk|week)|per\s+(?:month|year|week|meeting|lead|booked))\b/gi },
  { rule: "Price talk", re: /\b(?:price[ds]?|pricing|retainer|invoice|discount(?:ed)?|deposit|setup fee|monthly fee)\b/gi },
  { rule: "Percent off", re: /\b\d+\s?%\s?off\b/gi },
  // Gates SKUs (Field offers page) — these are sales-call words, not Email 1 words.
  { rule: "Gates SKU", re: /\b(?:offer\s?1|speed[-\s]to[-\s]lead|google reviews desk|missed[-\s]call text[-\s]back|gates core|care plan)\b/gi },
];

export function lintPrices(...texts: string[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const { rule, re } of RULES) {
      for (const m of text.matchAll(re)) {
        const key = `${rule}:${m[0].toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({ rule, match: m[0].trim() });
      }
    }
  }
  return issues;
}
