/**
 * Mission Control model: constants, types, reducers, diffing, sorting, ranking and the
 * calendar grid. Pure code. No DB, no Next, no AI calls, so it runs under `npm test`.
 */

export const COLUMNS = ["not_yet", "this_week", "in_progress", "waiting_thomas", "done"] as const;
export type Column = (typeof COLUMNS)[number];
export const COLUMN_LABEL: Record<Column, string> = {
  not_yet: "Not yet",
  this_week: "This week",
  in_progress: "In progress",
  waiting_thomas: "Waiting on Thomas",
  done: "Done",
};

export const LANES = ["gates", "twin", "fleet", "govcon", "career"] as const;
export type Lane = (typeof LANES)[number];
export const LANE_LABEL: Record<Lane, string> = { gates: "Gates", twin: "Twin", fleet: "Fleet", govcon: "GovCon", career: "Career" };

export const PRIORITIES = ["high", "med", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", med: "Medium", low: "Low" };

export interface TaskLink { label: string; url: string }

export interface Task {
  id: string;
  title: string;
  column: Column;
  rank: number;
  agent: string | null;
  lane: Lane;
  priority: Priority;
  recurring: boolean;
  dueDate: string | null;
  ask: string | null;
  links: TaskLink[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  notionPageId: string | null;
}

export type Changes = Record<string, { from: unknown; to: unknown }>;
export type EventKind = "created" | "updated" | "moved" | "note";
export type Via = "mcp" | "rest" | "ui";

export interface TaskEvent {
  id: string;
  taskId: string;
  kind: EventKind;
  actor: string;
  via: Via;
  changes: Changes | null;
  note: string | null;
  at: string;
}

export interface NewTask {
  title: string;
  lane: Lane;
  agent?: string | null;
  priority?: Priority;
  recurring?: boolean;
  dueDate?: string | null;
  column?: Column;
  ask?: string | null;
  links?: TaskLink[];
}
export type TaskPatch = Partial<Pick<Task, "title" | "agent" | "lane" | "priority" | "recurring" | "dueDate" | "ask" | "links">>;

/** Who is acting, how, and when. `id` makes ids deterministic in tests. */
export interface Actor { actor: string; via: Via; now: string; id?: () => string }

export class MissionError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export const TITLE_MAX = 200;
export const NOTE_MAX = 2000;
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

export const newId = (prefix: string, ctx?: Pick<Actor, "id">) =>
  ctx?.id ? ctx.id() : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Today in New York as YYYY-MM-DD. */
export const todayNY = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** Validates title (1..200, no em or en dash), dueDate (real calendar date), links (http/https), ask (required in Waiting on Thomas). */
export function validate(t: Pick<Task, "title" | "dueDate" | "links" | "column" | "ask">): void {
  const title = t.title.trim();
  if (!title) throw new MissionError(422, "Give the task a title.");
  if (title.length > TITLE_MAX) throw new MissionError(422, `Title is too long (max ${TITLE_MAX} characters).`);
  if (DASH.test(title)) throw new MissionError(422, "Titles can't use long dashes. Use a comma or a period instead.");
  if (t.dueDate != null && !isRealDate(t.dueDate)) throw new MissionError(422, "Due date must be a real date written YYYY-MM-DD.");
  if (t.links.length > 10) throw new MissionError(422, "A task can hold at most 10 links.");
  for (const l of t.links) {
    let ok = false;
    try { const u = new URL(l.url); ok = u.protocol === "http:" || u.protocol === "https:"; } catch { ok = false; }
    if (!ok) throw new MissionError(422, `Link "${l.label}" must start with http:// or https://.`);
    if (!l.label.trim()) throw new MissionError(422, "Every link needs a label.");
  }
  if (t.column === "waiting_thomas" && !t.ask?.trim()) throw new MissionError(422, "Waiting on Thomas needs an ask: say what Thomas has to do.");
}

export function buildTask(input: NewTask, ctx: Actor, rank: number): { task: Task; event: TaskEvent } {
  const task: Task = {
    id: newId("task", ctx),
    title: input.title.trim(),
    column: input.column ?? "not_yet",
    rank,
    agent: input.agent ?? null,
    lane: input.lane,
    priority: input.priority ?? "med",
    recurring: input.recurring ?? false,
    dueDate: input.dueDate ?? null,
    ask: input.ask?.trim() || null,
    links: input.links ?? [],
    createdBy: ctx.actor,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    doneAt: input.column === "done" ? ctx.now : null,
    notionPageId: null,
  };
  validate(task);
  const event: TaskEvent = { id: newId("tev", ctx), taskId: task.id, kind: "created", actor: ctx.actor, via: ctx.via, changes: null, note: null, at: ctx.now };
  return { task, event };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only fields that actually changed. An empty diff means no write. */
export function diffPatch(before: Task, patch: TaskPatch): Changes {
  const out: Changes = {};
  for (const [k, v] of Object.entries(patch) as [keyof TaskPatch, unknown][]) {
    if (v === undefined) continue;
    const next = k === "title" && typeof v === "string" ? v.trim() : k === "ask" && typeof v === "string" ? v.trim() || null : v;
    if (!same(before[k], next)) out[k] = { from: before[k], to: next };
  }
  return out;
}

export function applyPatch(before: Task, patch: TaskPatch, ctx: Actor): { task: Task; event: TaskEvent } | null {
  const changes = diffPatch(before, patch);
  if (Object.keys(changes).length === 0) return null;
  const task = { ...before, updatedAt: ctx.now } as Task;
  for (const [k, c] of Object.entries(changes)) (task as unknown as Record<string, unknown>)[k] = c.to;
  validate(task);
  const event: TaskEvent = { id: newId("tev", ctx), taskId: task.id, kind: "updated", actor: ctx.actor, via: ctx.via, changes, note: null, at: ctx.now };
  return { task, event };
}

export function makeNote(task: Task, note: string, ctx: Actor): TaskEvent {
  const text = note.trim();
  if (!text) throw new MissionError(422, "A note can't be empty.");
  if (text.length > NOTE_MAX) throw new MissionError(422, `A note can be at most ${NOTE_MAX} characters.`);
  return { id: newId("tev", ctx), taskId: task.id, kind: "note", actor: ctx.actor, via: ctx.via, changes: null, note: text, at: ctx.now };
}

/** Sets column and rank. Sets doneAt when entering done and clears it when leaving. Rejects Waiting on Thomas without an ask. */
export function applyMove(before: Task, to: Column, rank: number, ctx: Actor, note?: string): { task: Task; events: TaskEvent[] } {
  const task: Task = { ...before, column: to, rank, updatedAt: ctx.now };
  if (to === "done" && before.column !== "done") task.doneAt = ctx.now;
  if (to !== "done") task.doneAt = null;
  validate(task);
  const changes: Changes = {};
  if (before.column !== to) changes.column = { from: before.column, to };
  else if (before.rank !== rank) changes.rank = { from: before.rank, to: rank };
  const events: TaskEvent[] = [];
  if (Object.keys(changes).length) events.push({ id: newId("tev", ctx), taskId: task.id, kind: "moved", actor: ctx.actor, via: ctx.via, changes, note: null, at: ctx.now });
  if (note?.trim()) events.push(makeNote(task, note, ctx));
  return { task, events };
}

// ── Ranking ──────────────────────────────────────────────────────────────────
export const RANK_STEP = 1000;
export const MIN_GAP = 1e-6;

/** Fractional rank between two neighbors (before = the card above, after = the card below). */
export function rankBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return RANK_STEP;
  if (before == null) return (after as number) - RANK_STEP;
  if (after == null) return before + RANK_STEP;
  return (before + after) / 2;
}

/**
 * Where a moved card lands among its new column mates. `peers` must exclude the moved card and be sorted by rank.
 * `beforeId` = just above that card, `afterId` = just below it, neither = bottom. Returns null when the anchor isn't in `peers`.
 */
export function placeRank(peers: Pick<Task, "id" | "rank">[], place: { beforeId?: string; afterId?: string }): { rank: number; index: number } | null {
  let index = peers.length;
  const anchorId = place.beforeId ?? place.afterId;
  if (anchorId) {
    const at = peers.findIndex((t) => t.id === anchorId);
    if (at < 0) return null;
    index = place.beforeId ? at : at + 1;
  }
  return { index, rank: rankBetween(index > 0 ? peers[index - 1].rank : null, index < peers.length ? peers[index].rank : null) };
}

/** True when two neighbors are too close (or equal) to split again. */
export function needsRebalance(ranks: number[]): boolean {
  const s = [...ranks].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] < MIN_GAP) return true;
  return false;
}

// ── Views ────────────────────────────────────────────────────────────────────
const PRI_ORDER: Record<Priority, number> = { high: 0, med: 1, low: 2 };

/** Waiting on Thomas: high priority first, then oldest. Every other column: by rank. */
export function boardColumns(tasks: Task[]): Record<Column, Task[]> {
  const out = Object.fromEntries(COLUMNS.map((c) => [c, [] as Task[]])) as unknown as Record<Column, Task[]>;
  for (const t of tasks) out[t.column].push(t);
  for (const c of COLUMNS) {
    out[c].sort(c === "waiting_thomas"
      ? (a, b) => PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || a.createdAt.localeCompare(b.createdAt)
      : (a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt));
  }
  return out;
}

export const waitingCount = (tasks: Task[]) => tasks.filter((t) => t.column === "waiting_thomas").length;

/** One group per assignee: Thomas first, then bots A to Z, Unassigned last. */
export function byAgent(tasks: Task[]): { agent: string | null; tasks: Task[]; open: number }[] {
  const groups = new Map<string | null, Task[]>();
  for (const t of tasks) groups.set(t.agent, [...(groups.get(t.agent) ?? []), t]);
  const colIdx = (c: Column) => COLUMNS.indexOf(c);
  const rankOf = (a: string | null) => (a === null ? 2 : a === "thomas" ? 0 : 1);
  return [...groups.entries()]
    .sort(([a], [b]) => rankOf(a) - rankOf(b) || (a ?? "").localeCompare(b ?? ""))
    .map(([agent, list]) => ({
      agent,
      tasks: [...list].sort((a, b) => colIdx(a.column) - colIdx(b.column) || a.rank - b.rank),
      open: list.filter((t) => t.column !== "done").length,
    }));
}

export const isOverdue = (t: Task, today: string) => Boolean(t.dueDate && t.dueDate < today && t.column !== "done");

// ── Calendar ─────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));

/** Month grid (Sunday start): every day of the month with its tasks, padded to full weeks. Undated open tasks come back separately. */
export function monthGrid(month: string, tasks: Task[], today: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) if (t.dueDate) byDate.set(t.dueDate, [...(byDate.get(t.dueDate) ?? []), t]);
  const cells: { date: string; inMonth: boolean; isToday: boolean; tasks: Task[] }[] = [];
  const lead = first.getUTCDay();
  const total = Math.ceil((lead + days) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    const date = ymd(d);
    cells.push({ date, inMonth: d.getUTCMonth() === m - 1, isToday: date === today, tasks: byDate.get(date) ?? [] });
  }
  const weeks = Array.from({ length: total / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  return { weeks, undated: tasks.filter((t) => !t.dueDate && t.column !== "done") };
}

// ── History text ─────────────────────────────────────────────────────────────
/** "2026-10-13 14:02 ET" */
export function formatET(iso: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ET`;
}

const FIELD_LABEL: Record<string, string> = { title: "title", agent: "assignee", lane: "lane", priority: "priority", recurring: "repeat", dueDate: "due date", ask: "ask", links: "links", rank: "order" };

const show = (field: string, v: unknown): string => {
  if (v == null || v === "") return "nothing";
  if (field === "column") return COLUMN_LABEL[v as Column] ?? String(v);
  if (field === "lane") return LANE_LABEL[v as Lane] ?? String(v);
  if (field === "priority") return PRIORITY_LABEL[v as Priority] ?? String(v);
  if (field === "recurring") return v ? "yes" : "no";
  if (field === "links") return `${(v as TaskLink[]).length} link(s)`;
  return String(v);
};

/** One plain-English line for the History list, e.g. "moved from This week to In progress". */
export function describeEvent(e: TaskEvent, nameOf: (id: string) => string = (id) => id): string {
  if (e.kind === "created") return "created the task";
  if (e.kind === "note") return `left a note: ${e.note ?? ""}`;
  const c = e.changes ?? {};
  if (e.kind === "moved") {
    if (c.column) return `moved from ${show("column", c.column.from)} to ${show("column", c.column.to)}`;
    return "reordered the card";
  }
  const parts = Object.entries(c).map(([k, v]) => {
    const f = FIELD_LABEL[k] ?? k;
    const fmt = (x: unknown) => (k === "agent" ? (x == null ? "nobody" : nameOf(String(x))) : show(k, x));
    return `changed ${f} from ${fmt(v.from)} to ${fmt(v.to)}`;
  });
  return parts.join(", ") || "updated the task";
}
