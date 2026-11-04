/**
 * Collapse repeated same-day activity into one expandable row:
 * ten "Prospectacle added <lead>" lines become "Prospectacle added 10 leads".
 * Pure (no DB) so the client feed can use it.
 */

export interface GroupableActivity {
  id: string;
  kind: string;
  target: string;
  agent?: string;
  ts: string; // ISO timestamp
}

export type FeedEntry<T extends GroupableActivity> =
  | { type: "single"; item: T }
  | { type: "group"; key: string; summary: string; items: T[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Each pattern turns a target into a shared stem + a summary for n matches. */
const PATTERNS: { re: RegExp; stem: (m: RegExpMatchArray) => string; summary: (m: RegExpMatchArray, n: number) => string }[] = [
  { re: /^(.+?) added (Email \d+) copy for .+$/, stem: (m) => `${m[1]}|copy|${m[2]}`, summary: (m, n) => `${m[1]} added ${m[2]} copy for ${plural(n, "lead")}` },
  { re: /^(.+?) (drafted|rewrote|approved) (Email \d+) for .+?$/, stem: (m) => `${m[1]}|${m[2]}|${m[3]}`, summary: (m, n) => `${m[1]} ${m[2]} ${m[3]} for ${plural(n, "lead")}` },
  { re: /^(.+?) opened .+'s (Email \d+)$/, stem: (m) => `${m[1]}|opened|${m[2]}`, summary: (m, n) => `${m[1]} opened ${m[2]} for ${plural(n, "lead")}` },
  { re: /^(.+?) merged a duplicate into .+$/, stem: (m) => `${m[1]}|merged`, summary: (m, n) => `${m[1]} merged duplicates into ${plural(n, "lead")}` },
  { re: /^(.+?) (added|updated) .+$/, stem: (m) => `${m[1]}|${m[2]}`, summary: (m, n) => `${m[1]} ${m[2]} ${plural(n, "lead")}` },
  { re: /^(Email \d+) sent to .+$/, stem: (m) => `sent|${m[1]}`, summary: (m, n) => `${m[1]} sent to ${plural(n, "lead")}` },
  { re: /^Nick marked .+ (PASS|REVISE|KILL)( \(Email \d+\))?$/, stem: (m) => `nick|${m[1]}`, summary: (m, n) => `Nick marked ${plural(n, "lead")} ${m[1]}` },
  { re: /^.+ (put on hold|released from hold)$/, stem: (m) => `hold|${m[1]}`, summary: (m, n) => `${plural(n, "lead")} ${m[1]}` },
  { re: /^.+ won't be emailed again$/, stem: () => "suppress", summary: (_m, n) => `${n} address${n === 1 ? "" : "es"} won't be emailed again` },
];

function classify(target: string): { stem: string; summary: (n: number) => string } {
  for (const p of PATTERNS) {
    const m = target.match(p.re);
    if (m) return { stem: p.stem(m), summary: (n) => p.summary(m, n) };
  }
  // Identical lines ("Darrell checked replies") still collapse: "… ×4".
  return { stem: `same|${target}`, summary: (n) => `${target} ×${n}` };
}

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/**
 * Group same-day items that share agent, kind and action. Order follows the
 * input (newest first); a group sits where its newest item was. Runs of
 * fewer than `min` stay as single rows.
 */
export function groupActivity<T extends GroupableActivity>(items: T[], min = 2): FeedEntry<T>[] {
  const keyOf = (it: T) => `${dayOf(it.ts)}|${it.agent ?? ""}|${it.kind}|${classify(it.target).stem}`;
  const buckets = new Map<string, { summary: (n: number) => string; items: T[] }>();
  for (const it of items) {
    const key = keyOf(it);
    let b = buckets.get(key);
    if (!b) { b = { summary: classify(it.target).summary, items: [] }; buckets.set(key, b); }
    b.items.push(it);
  }
  const out: FeedEntry<T>[] = [];
  const emitted = new Set<string>();
  for (const it of items) {
    const key = keyOf(it);
    const b = buckets.get(key)!;
    if (b.items.length < min) { out.push({ type: "single", item: it }); continue; }
    if (emitted.has(key)) continue;
    emitted.add(key);
    out.push({ type: "group", key, summary: b.summary(b.items.length), items: b.items });
  }
  return out;
}
