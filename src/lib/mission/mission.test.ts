/**
 * Mission Control tests. Run: npm test (no database, no network).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  COLUMN_LABEL, LANE_LABEL, LANES, MissionError, PRIORITY_LABEL, boardColumns, buildTask, byAgent, describeEvent, diffPatch,
  monthGrid, needsRebalance, rankBetween, shiftMonth, validate, waitingCount,
  type Actor, type Task,
} from "./model";
import { memoryStore } from "./store";
import { createTask, getTaskView, listTasks, moveTask, noteTask, updateTask } from "./service";
import { notionProps, pushTask } from "./notion-sync";
import { COPY, COLUMN_CHIP, LANE_CHIP, PRIORITY_CHIP } from "../../components/mission/chips";

const T0 = "2026-10-13T18:00:00.000Z";
let seq = 0;
const ctx = (over: Partial<Actor> = {}): Actor => ({ actor: "ace", via: "mcp", now: T0, id: () => `id_${++seq}`, ...over });
const base = { title: "Renew SAM", lane: "govcon" as const };

async function rejects(fn: () => Promise<unknown> | unknown, status: number) {
  await assert.rejects(async () => { await fn(); }, (e) => e instanceof MissionError && e.status === status);
}

test("create writes one created event with the actor and defaults", async () => {
  const s = memoryStore();
  const t = await createTask(s, base, ctx({ actor: "lynx", via: "rest" }));
  assert.equal(t.column, "not_yet");
  assert.equal(t.priority, "med");
  assert.equal(t.recurring, false);
  assert.deepEqual(t.links, []);
  assert.equal(t.createdBy, "lynx");
  const { events } = s.dump();
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "created");
  assert.equal(events[0].actor, "lynx");
  assert.equal(events[0].via, "rest");
});

test("create with a note writes created then note", async () => {
  const s = memoryStore();
  const t = await createTask(s, base, ctx(), "Started from the SAM email");
  assert.deepEqual(t.history.map((e) => e.kind), ["note", "created"]);
});

test("validation: bad input is a 422 MissionError", async () => {
  const s = memoryStore();
  await rejects(() => createTask(s, { ...base, title: "" }, ctx()), 422);
  await rejects(() => createTask(s, { ...base, title: "x".repeat(201) }, ctx()), 422);
  await rejects(() => createTask(s, { ...base, title: "Fix it — now" }, ctx()), 422);
  await rejects(() => createTask(s, { ...base, title: "Fix it – now" }, ctx()), 422);
  await rejects(() => createTask(s, { ...base, dueDate: "2026-02-30" }, ctx()), 422);
  await rejects(() => createTask(s, { ...base, links: [{ label: "x", url: "ftp://a.b/c" }] }, ctx()), 422);
  await rejects(() => createTask(s, { ...base, column: "waiting_thomas" }, ctx()), 422);
  assert.equal(s.dump().tasks.length, 0, "failed creates leave nothing behind");
  assert.doesNotThrow(() => validate({ title: "ok", dueDate: "2028-02-29", links: [{ label: "a", url: "https://a.b" }], column: "waiting_thomas", ask: "Sign" }));
  assert.ok(!LANES.includes("bogus" as never));
});

test("update logs only the fields that changed", async () => {
  const s = memoryStore();
  const t = await createTask(s, { ...base, dueDate: "2026-11-01" }, ctx());
  const u = await updateTask(s, t.id, { priority: "high" }, ctx({ now: "2026-10-14T00:00:00.000Z" }));
  assert.deepEqual(u.history[0].changes, { priority: { from: "med", to: "high" } });
  assert.equal(u.updatedAt, "2026-10-14T00:00:00.000Z");
  const n = s.dump().events.length;
  const same = await updateTask(s, t.id, { priority: "high", title: "Renew SAM" }, ctx({ now: "2026-10-15T00:00:00.000Z" }));
  assert.equal(s.dump().events.length, n, "a no-op writes no event");
  assert.equal(same.updatedAt, "2026-10-14T00:00:00.000Z");
  const cleared = await updateTask(s, t.id, { dueDate: null }, ctx({ now: "2026-10-15T12:00:00.000Z" }));
  assert.deepEqual(cleared.history[0].changes, { dueDate: { from: "2026-11-01", to: null } });
  assert.equal(cleared.dueDate, null);
});

test("move records columns, sets and clears doneAt, and pairs a note", async () => {
  const s = memoryStore();
  const t = await createTask(s, { ...base, column: "this_week" }, ctx());
  const a = await moveTask(s, t.id, "in_progress", {}, ctx({ actor: "lynx" }));
  assert.deepEqual(a.history[0].changes, { column: { from: "this_week", to: "in_progress" } });
  assert.equal(a.history[0].actor, "lynx");
  const done = await moveTask(s, t.id, "done", {}, ctx({ now: "2026-10-16T00:00:00.000Z" }));
  assert.equal(done.doneAt, "2026-10-16T00:00:00.000Z");
  const back = await moveTask(s, t.id, "in_progress", {}, ctx({ now: "2026-10-17T00:00:00.000Z" }), "Reopened, SAM wants a form");
  assert.equal(back.doneAt, null);
  assert.deepEqual(back.history.slice(0, 2).map((e) => e.kind), ["note", "moved"]);
});

test("moving to Waiting on Thomas needs an ask", async () => {
  const s = memoryStore();
  const t = await createTask(s, base, ctx());
  await rejects(() => moveTask(s, t.id, "waiting_thomas", {}, ctx()), 422);
  assert.equal((await getTaskView(s, t.id)).column, "not_yet", "failed move changes nothing");
  await updateTask(s, t.id, { ask: "Sign the SAM renewal" }, ctx());
  const w = await moveTask(s, t.id, "waiting_thomas", {}, ctx());
  assert.equal(w.column, "waiting_thomas");
  await rejects(() => updateTask(s, t.id, { ask: null }, ctx()), 422);
});

test("rankBetween covers empty, edges and midpoint", () => {
  assert.equal(rankBetween(null, null), 1000);
  assert.equal(rankBetween(2000, null), 3000);
  assert.equal(rankBetween(null, 2000), 1000);
  assert.equal(rankBetween(1000, 2000), 1500);
  assert.equal(needsRebalance([1, 2, 3]), false);
  assert.equal(needsRebalance([1, 1 + 1e-9]), true);
  assert.equal(needsRebalance([5, 5]), true);
});

test("60 inserts between the same two cards rebalance and keep order", async () => {
  const s = memoryStore();
  const a = await createTask(s, { ...base, title: "A" }, ctx());
  const z = await createTask(s, { ...base, title: "Z" }, ctx());
  const order: string[] = []; // newest insert always lands right after A, so the final order is reversed
  for (let i = 0; i < 60; i++) {
    const t = await createTask(s, { ...base, title: `m${i}`, column: "this_week" }, ctx());
    await moveTask(s, t.id, "not_yet", { afterId: a.id }, ctx());
    order.unshift(t.id);
  }
  const col = (await s.list({ column: "not_yet" })).sort((x, y) => x.rank - y.rank).map((t) => t.id);
  assert.deepEqual(col, [a.id, ...order, z.id]);
  assert.equal(needsRebalance(col.map((id) => s.dump().tasks.find((t) => t.id === id)!.rank)), false);
});

test("beforeId and afterId place a card", async () => {
  const s = memoryStore();
  const [a, b, c] = [await createTask(s, { ...base, title: "A" }, ctx()), await createTask(s, { ...base, title: "B" }, ctx()), await createTask(s, { ...base, title: "C" }, ctx())];
  await moveTask(s, c.id, "not_yet", { beforeId: a.id }, ctx());
  const names = async () => (await s.list({ column: "not_yet" })).sort((x, y) => x.rank - y.rank).map((t) => t.title);
  assert.deepEqual(await names(), ["C", "A", "B"]);
  await moveTask(s, c.id, "not_yet", { afterId: b.id }, ctx());
  assert.deepEqual(await names(), ["A", "B", "C"]);
  await rejects(() => moveTask(s, c.id, "this_week", { beforeId: a.id }, ctx()), 404);
});

function mk(over: Partial<Task>): Task {
  return { id: "t", title: "t", column: "not_yet", rank: 0, agent: null, lane: "gates", priority: "med", recurring: false, dueDate: null, ask: null, links: [], createdBy: "ace", createdAt: T0, updatedAt: T0, doneAt: null, notionPageId: null, ...over };
}

test("boardColumns pins Waiting by priority then age, other columns by rank", () => {
  const tasks = [
    mk({ id: "w1", column: "waiting_thomas", priority: "low", createdAt: "2026-10-01" }),
    mk({ id: "w2", column: "waiting_thomas", priority: "high", createdAt: "2026-10-05" }),
    mk({ id: "w3", column: "waiting_thomas", priority: "high", createdAt: "2026-10-02" }),
    mk({ id: "n2", rank: 2000 }), mk({ id: "n1", rank: 1000 }),
  ];
  const cols = boardColumns(tasks);
  assert.deepEqual(cols.waiting_thomas.map((t) => t.id), ["w3", "w2", "w1"]);
  assert.deepEqual(cols.not_yet.map((t) => t.id), ["n1", "n2"]);
  assert.equal(waitingCount(tasks), 3);
  assert.equal(waitingCount(tasks.filter((t) => t.column !== "waiting_thomas")), 0);
});

test("notes: empty and oversized fail, history is newest first with actors", async () => {
  const s = memoryStore();
  const t = await createTask(s, base, ctx({ now: "2026-10-13T10:00:00.000Z" }));
  await rejects(() => noteTask(s, t.id, "   ", ctx()), 422);
  await rejects(() => noteTask(s, t.id, "x".repeat(2001), ctx()), 422);
  await noteTask(s, t.id, "first", ctx({ actor: "lynx", now: "2026-10-13T11:00:00.000Z" }));
  const v = await noteTask(s, t.id, "second", ctx({ actor: "thomas", via: "ui", now: "2026-10-13T12:00:00.000Z" }));
  assert.deepEqual(v.history.map((e) => e.note ?? e.kind), ["second", "first", "created"]);
  assert.deepEqual(v.history.map((e) => e.actor), ["thomas", "lynx", "ace"]);
  assert.match(describeEvent(v.history[0]), /left a note: second/);
});

test("unknown id is a 404 for update, move and note", async () => {
  const s = memoryStore();
  await rejects(() => updateTask(s, "nope", { title: "x" }, ctx()), 404);
  await rejects(() => moveTask(s, "nope", "done", {}, ctx()), 404);
  await rejects(() => noteTask(s, "nope", "hi", ctx()), 404);
});

test("audit invariant: 50 random operations leave every task with an actor-stamped log", async () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const s = memoryStore();
  const actors = ["ace", "lynx", "thomas", "nick"];
  const cols = ["not_yet", "this_week", "in_progress", "done"] as const;
  const ids: string[] = [];
  for (let i = 0; i < 50; i++) {
    const c = ctx({ actor: pick(actors), now: `2026-10-13T${String(i % 24).padStart(2, "0")}:00:00.000Z` });
    const r = rnd();
    try {
      if (ids.length === 0 || r < 0.3) ids.push((await createTask(s, { ...base, title: `task ${i}` }, c)).id);
      else if (r < 0.55) await moveTask(s, pick(ids), pick(cols), {}, c);
      else if (r < 0.8) await updateTask(s, pick(ids), { priority: pick(["high", "med", "low"] as const) }, c);
      else await noteTask(s, pick(ids), `note ${i}`, c);
    } catch (e) { assert.ok(e instanceof MissionError); }
  }
  const { tasks, events } = s.dump();
  assert.ok(tasks.length > 0);
  for (const t of tasks) assert.ok(events.some((e) => e.taskId === t.id), `${t.id} has an event`);
  for (const e of events) assert.ok(e.actor.length > 0);
});

test("byAgent groups, puts Unassigned last and counts open tasks", () => {
  const g = byAgent([
    mk({ id: "1", agent: null }), mk({ id: "2", agent: "lynx" }), mk({ id: "3", agent: "lynx", column: "done" }),
    mk({ id: "4", agent: "thomas" }), mk({ id: "5", agent: "ace" }),
  ]);
  assert.deepEqual(g.map((x) => x.agent), ["thomas", "ace", "lynx", null]);
  assert.equal(g.find((x) => x.agent === "lynx")!.open, 1);
  assert.equal(g.find((x) => x.agent === "lynx")!.tasks.length, 2);
});

test("monthGrid: Oct 2026, Feb 2027, Feb 2028, placement and shiftMonth", () => {
  const oct = monthGrid("2026-10", [mk({ id: "d", dueDate: "2026-10-31" }), mk({ id: "u" }), mk({ id: "x", column: "done" })], "2026-10-13");
  const flat = oct.weeks.flat();
  assert.equal(flat.findIndex((c) => c.inMonth), 4, "Oct 1, 2026 is a Thursday");
  assert.equal(flat.filter((c) => c.inMonth).length, 31);
  assert.equal(oct.weeks.length, 5);
  assert.ok(oct.weeks.every((w) => w.length === 7));
  assert.deepEqual(flat.find((c) => c.date === "2026-10-31")!.tasks.map((t) => t.id), ["d"]);
  assert.equal(flat.find((c) => c.isToday)!.date, "2026-10-13");
  assert.deepEqual(oct.undated.map((t) => t.id), ["u"]);
  assert.equal(monthGrid("2027-02", [], "").weeks.flat().filter((c) => c.inMonth).length, 28);
  assert.equal(monthGrid("2028-02", [], "").weeks.flat().filter((c) => c.inMonth).length, 29);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("notion stub: skipped when off, maps labels, never calls the network", async () => {
  const t = mk({ column: "waiting_thomas", lane: "twin", ask: "Sign", dueDate: "2026-10-20" });
  assert.deepEqual(await pushTask(t, false), { skipped: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- nested Notion property shape
  const p = notionProps(t) as Record<string, any>;
  assert.equal(p.Status.select.name, "Waiting on Thomas");
  assert.equal(p.Lane.select.name, "Twin");
  assert.equal(p.Due.date.start, "2026-10-20");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("network call"); }) as typeof fetch;
  try {
    const lines: string[] = [];
    assert.deepEqual(await pushTask(t, true, (l) => { lines.push(l); }), { stub: true });
    assert.deepEqual(lines, ["Notion sync is a stub: nothing sent"]);
  } finally { globalThis.fetch = realFetch; }
});

test("listTasks hides done by default and reports the waiting count", async () => {
  const s = memoryStore();
  const a = await createTask(s, base, ctx());
  await updateTask(s, a.id, { ask: "Approve" }, ctx());
  await moveTask(s, a.id, "waiting_thomas", {}, ctx());
  const b = await createTask(s, { ...base, agent: "lynx" }, ctx());
  await moveTask(s, b.id, "done", {}, ctx());
  const r = await listTasks(s, {});
  assert.equal(r.tasks.length, 1);
  assert.equal(r.waiting, 1);
  assert.equal((await listTasks(s, { includeDone: true })).tasks.length, 2);
  const lynx = await listTasks(s, { agent: "lynx", includeDone: true });
  assert.equal(lynx.tasks.length, 1);
  assert.equal(lynx.waiting, 1, "waiting count ignores the filter");
});

test("diffPatch trims titles and treats equal links as unchanged", () => {
  const t = mk({ title: "A", links: [{ label: "x", url: "https://a.b" }] });
  assert.deepEqual(diffPatch(t, { title: " A ", links: [{ label: "x", url: "https://a.b" }] }), {});
  assert.deepEqual(buildTask({ title: " B ", lane: "gates" }, ctx(), 1000).task.title, "B");
});

// ── Copy and safety lint ─────────────────────────────────────────────────────
const DASHES = /[–—]/;
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("copy: no em or en dashes in labels or Mission files", () => {
  for (const v of [...Object.values(COLUMN_LABEL), ...Object.values(LANE_LABEL), ...Object.values(PRIORITY_LABEL), ...Object.values(COPY)]) assert.ok(!DASHES.test(v), v);
  assert.ok(Object.keys(COLUMN_CHIP).length === 5 && Object.keys(LANE_CHIP).length === 5 && Object.keys(PRIORITY_CHIP).length === 3);
  const files = ["src/components/mission", "src/app/mission", "src/app/api/mission", "src/lib/mission"].flatMap((d) => walk(d)).filter((f) => !f.endsWith(".test.ts"));
  assert.ok(files.length >= 4);
  for (const f of files) assert.ok(!DASHES.test(readFileSync(f, "utf8")), `${f} has a long dash`);
});

test("safety: Mission lib code makes no AI calls and only db-store touches the DB", () => {
  for (const f of walk("src/lib/mission").filter((p) => !p.endsWith(".test.ts"))) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/from "(ai|@ai-sdk\/[^"]+|@\/lib\/models)"/.test(src), `${f} imports an AI module`);
    if (!f.endsWith("db-store.ts")) assert.ok(!/from "@\/db/.test(src), `${f} imports the database`);
    assert.ok(!/from "next\//.test(src), `${f} imports Next`);
  }
});
