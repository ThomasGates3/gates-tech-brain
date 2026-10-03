/**
 * Money roadmap: nine steps from "ready to mail" to "first paid client".
 * Seeds are the 2026-10-02 truth; changes are stored in settings and only move forward.
 * Order is enforced: a step can't be done while any step above it isn't.
 */
import { appendFile } from "node:fs/promises";
import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { fieldContacts, fieldSendLog } from "@/db/schema";
import { getSetting, setSetting } from "@/lib/settings";
import { recordActivity } from "@/lib/activity";
import { getGates } from "@/lib/field/gates";

export const WARMUP_SEEDS = ["thomasthethird3@gmail.com", "lilquedog@gmail.com", "juicegodt@gmail.com"];
export const isWarmupSeed = (email: string) => WARMUP_SEEDS.includes(email.trim().toLowerCase());

export type StepStatus = "done" | "now" | "later";
export const STEP_IDS = ["offer", "send_domain", "copy_rules", "warmup", "approve_batch", "first_send", "first_reply", "booked_call", "paid_client"] as const;
export type StepId = (typeof STEP_IDS)[number];

interface Seed { id: StepId; name: string; owner: string; done_means: string; status: StepStatus; note: string; done_at: string | null }
const SEEDS: Seed[] = [
  { id: "offer", name: "Offer locked", owner: "Thomas", status: "done", done_at: "2026-10-02", done_means: "Three offers with set prices, kept off the website and cold email.",
    note: "Core is $5,000 setup plus $997 a month. Website redesign is $1,500 setup plus $97 a month. Lead reactivation is $2,500 setup plus $250 per booked appointment, no retainer. Prices stay off the website and off cold email." },
  { id: "send_domain", name: "Send domain and address", owner: "Thomas", status: "done", done_at: "2026-10-02", done_means: "A cold inbox, a physical address and AgentMail are ready.",
    note: "hello@gatesoutreach.com. Physical address on file. AgentMail connected." },
  { id: "copy_rules", name: "Copy rules and board", owner: "Brain", status: "done", done_at: "2026-10-02", done_means: "Every draft is checked and reviewed on /leads before Thomas sees it.",
    note: "Core Email 1 quotes real published hours or goes to Hold: needs published hours. Website Email 1 is three numbered fixes, no links, no jargon, no put-downs. Nick PASS then Thomas Approve. Approve does not send." },
  { id: "warmup", name: "Domain warm-up", owner: "Thomas", status: "now", done_at: null, done_means: "Thomas confirms warm-up on Control Center, which opens Field sends.",
    note: "Weekday drips are running. Thomas confirms it himself, target around Monday Oct 13, 2026. Ace must not set this gate." },
  { id: "approve_batch", name: "First approve batch", owner: "Thomas", status: "later", done_at: null, done_means: "Thomas approves the Nick PASS pile. Approve stores them unsent.", note: "" },
  { id: "first_send", name: "First Field send", owner: "Ace", status: "later", done_at: null, done_means: "AgentMail sends approved Email 1s from hello@gatesoutreach.com under the daily cap.", note: "Zero Field sends so far." },
  { id: "first_reply", name: "First reply", owner: "Lisa", status: "later", done_at: null, done_means: "A prospect replies (not a warm-up seed, not an opt-out) and Lisa drafts the answer. No auto-reply.", note: "" },
  { id: "booked_call", name: "First booked call", owner: "Lisa", status: "later", done_at: null, done_means: "A reply becomes a scheduled call. Still no price in the email.", note: "" },
  { id: "paid_client", name: "First paid client", owner: "Thomas", status: "later", done_at: null, done_means: "Thomas closes Core, Website or Lead Reactivation and the client pays.", note: "" },
];

interface Stored { status: StepStatus; note?: string; done_at?: string | null; done_by?: string | null; evidence?: string | null }
interface HistoryLine { at: string; agent: string; step: StepId; status: StepStatus; note: string }
interface State { steps: Partial<Record<StepId, Stored>>; history: HistoryLine[] }

const KEY = "roadmap_state";
const RANK: Record<StepStatus, number> = { later: 0, now: 1, done: 2 };
const nyNow = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(",", "") + " ET";

async function load(): Promise<State> {
  try { return JSON.parse((await getSetting(KEY)) ?? "") as State; } catch { return { steps: {}, history: [] }; }
}

function merged(s: State) {
  return SEEDS.map((seed) => {
    const st = s.steps[seed.id];
    return {
      id: seed.id, name: seed.name, owner: seed.owner, done_means: seed.done_means,
      status: st?.status ?? seed.status,
      note: st?.note ?? seed.note,
      done_at: st?.status === "done" ? st.done_at ?? null : seed.status === "done" ? seed.done_at : null,
      done_by: st?.done_by ?? (seed.status === "done" ? "seed" : null),
      evidence: st?.evidence ?? null,
    };
  });
}

/** The four live numbers: same predicates as the /leads board, across all pack dates. */
async function liveNumbers() {
  const count = async (where: ReturnType<typeof and>) => (await db.select({ n: sql<number>`count(*)::int` }).from(fieldContacts).where(where))[0]?.n ?? 0;
  const [pass, approved, sent, gates] = await Promise.all([
    count(and(eq(fieldContacts.stage, "nick"), eq(fieldContacts.nickVerdict, "PASS"), sql`${fieldContacts.nickHash} = ${fieldContacts.draftHash}`)),
    count(and(eq(fieldContacts.stage, "approved"))),
    db.select({ n: sql<number>`count(*)::int` }).from(fieldSendLog).where(notInArray(sql`lower(${fieldSendLog.recipient})`, WARMUP_SEEDS)).then((r) => r[0]?.n ?? 0),
    getGates(),
  ]);
  return { pass_waiting_approve: pass, approved_unsent: approved, field_sent_all_time: sent, warmup: gates.domainWarmed ? "confirmed" : "blocked" };
}

export async function getRoadmap() {
  const s = await load();
  const steps = merged(s);
  return { steps, now: steps.find((x) => x.status === "now")?.id ?? null, numbers: await liveNumbers(), history: s.history.slice(-50).reverse() };
}

export class RoadmapError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/**
 * Change one step. Forward only (later → now → done) or note-only; no skipping.
 * `thomas` = the caller is a Thomas session/key. Steps 1–4 are Thomas-only; warm-up done also
 * needs domainWarmed already confirmed (this never sets the gate).
 */
export async function setStep(input: { agent: string; step_id: StepId; status: StepStatus; note?: string; evidence?: string }, thomas: boolean) {
  const s = await load();
  const steps = merged(s);
  const i = STEP_IDS.indexOf(input.step_id);
  const cur = steps[i];
  if (i < 4 && !thomas) throw new RoadmapError(403, `Only Thomas can change "${cur.name}".`);
  if (input.step_id === "warmup" && input.status === "done" && !(await getGates()).domainWarmed)
    throw new RoadmapError(409, "Warm-up isn't confirmed. Thomas uses Confirm warm-up on Control Center; that marks this step done.");
  if (RANK[input.status] < RANK[cur.status]) throw new RoadmapError(409, `"${cur.name}" is ${cur.status}. Steps only move forward.`);
  if (input.status === "done" && cur.status !== "done") {
    const open = steps.slice(0, i).find((x) => x.status !== "done");
    if (open) throw new RoadmapError(409, `"${open.name}" isn't done yet, so "${cur.name}" can't be done.`);
  }
  if (input.status === cur.status && input.note === undefined && input.evidence === undefined) return getRoadmap();
  const becameDone = input.status === "done" && cur.status !== "done";
  const at = nyNow();
  s.steps[input.step_id] = {
    status: input.status,
    note: input.note ?? cur.note,
    done_at: becameDone ? at : cur.done_at,
    done_by: becameDone ? input.agent : cur.done_by,
    evidence: input.evidence ?? cur.evidence,
  };
  const line: HistoryLine = { at, agent: input.agent, step: input.step_id, status: input.status, note: input.note ?? "" };
  s.history = [...s.history, line].slice(-200);
  await setSetting(KEY, JSON.stringify(s));
  await recordActivity({ kind: "updated", target: `Money roadmap: ${cur.name} is ${input.status}`, because: input.note || (input.evidence ? `evidence: ${input.evidence}` : `set by ${input.agent}`), agent: input.agent });
  // Local/dev only: the deployed filesystem is read-only, so production history lives in brain_roadmap_get.
  await appendFile("CHANGELOG.md", `- ${at} · ${input.agent} · ${input.step_id} → ${input.status}${input.note ? ` · ${input.note}` : ""}\n`).catch(() => {});
  return getRoadmap();
}

/**
 * Brain-wired moves from real events. Marks `target` (and any earlier steps in `implied`
 * the event proves) without ever skipping an unproven step. Never throws.
 */
export async function advance(target: StepId, status: StepStatus, by: string, evidence: string, implied: StepId[] = []) {
  try {
    for (const id of [...implied, target]) {
      const st = (await getRoadmap()).steps.find((x) => x.id === id)!;
      const want = id === target ? status : "done";
      if (RANK[st.status] < RANK[want]) await setStep({ agent: by, step_id: id, status: want, evidence }, true);
    }
  } catch (e) {
    await recordActivity({ kind: "alert", target: `Money roadmap didn't update (${target})`, because: e instanceof Error ? e.message : String(e), agent: "brain" });
  }
}

export const OFFERS = { core: "Core", website: "Website redesign", reactivation: "Lead reactivation" } as const;
export type Offer = keyof typeof OFFERS;

/** "Booked call" / "Paid" on a lead: stored on the lead, and they flip the roadmap. Only for leads we actually emailed. */
export async function markLead(contactId: string, what: { booked: true } | { paid: Offer }, by: string) {
  const [c] = await db.select().from(fieldContacts).where(and(eq(fieldContacts.id, contactId), isNotNull(fieldContacts.sentAt)));
  if (!c) throw new RoadmapError(409, "Only a lead we sent Email 1 to can be booked or paid.");
  const at = nyNow();
  if ("booked" in what) {
    await db.update(fieldContacts).set({ bookedAt: at, bookedBy: by }).where(eq(fieldContacts.id, contactId));
    await advance("booked_call", "done", by, `lead ${contactId}`, ["first_reply"]);
  } else {
    await db.update(fieldContacts).set({ paidAt: at, paidOffer: what.paid, bookedAt: c.bookedAt ?? at, bookedBy: c.bookedBy ?? by }).where(eq(fieldContacts.id, contactId));
    await advance("paid_client", "done", by, `lead ${contactId} · ${OFFERS[what.paid]}`, ["first_reply", "booked_call"]);
  }
  await recordActivity({ kind: "updated", target: `${c.name}: ${"booked" in what ? "call booked" : `paid (${OFFERS[what.paid]})`}`, because: `marked by ${by}`, agent: by });
  return getRoadmap();
}
