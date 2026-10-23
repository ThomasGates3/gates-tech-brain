/**
 * Mission Control service. No @/db import: callers pass the store and the actor.
 * Every write appends at least one event before it returns, so the log is complete.
 */
import {
  MissionError, applyMove, applyPatch, buildTask, makeNote, needsRebalance, placeRank, rankBetween, RANK_STEP, waitingCount,
  type Actor, type Column, type NewTask, type Task, type TaskEvent, type TaskPatch,
} from "./model";
import type { TaskFilter, TaskStore } from "./store";

export type TaskView = Task & { history: TaskEvent[] };
export interface ListFilter extends TaskFilter { includeDone?: boolean; limit?: number }

async function must(s: TaskStore, id: string): Promise<Task> {
  const t = await s.get(id);
  if (!t) throw new MissionError(404, `No task with id ${id}.`);
  return t;
}

export async function getTaskView(s: TaskStore, id: string): Promise<TaskView> {
  const t = await must(s, id);
  return { ...t, history: await s.events(id, 100) };
}

const byRank = (a: Task, b: Task) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt);

export async function createTask(s: TaskStore, input: NewTask, ctx: Actor, note?: string): Promise<TaskView> {
  const column = input.column ?? "not_yet";
  const peers = (await s.list({ column })).sort(byRank);
  const rank = rankBetween(peers.length ? peers[peers.length - 1].rank : null, null);
  const { task, event } = buildTask({ ...input, column }, ctx, rank);
  const events = [event];
  if (note?.trim()) events.push(makeNote(task, note, ctx));
  await s.insert(task);
  await s.appendEvents(events);
  return getTaskView(s, task.id);
}

export async function updateTask(s: TaskStore, id: string, patch: TaskPatch, ctx: Actor): Promise<TaskView> {
  const before = await must(s, id);
  const r = applyPatch(before, patch, ctx);
  if (r) {
    await s.save(r.task);
    await s.appendEvents([r.event]);
  }
  return getTaskView(s, id);
}

/**
 * Move a card. `beforeId` puts it just above that card, `afterId` just below it.
 * With neither it goes to the bottom of the column. Renumbers the column when ranks get too close.
 */
export async function moveTask(
  s: TaskStore, id: string, to: Column, place: { beforeId?: string; afterId?: string }, ctx: Actor, note?: string,
): Promise<TaskView> {
  const before = await must(s, id);
  const peers = (await s.list({ column: to })).filter((t) => t.id !== id).sort(byRank);
  const spot = placeRank(peers, place);
  if (!spot) throw new MissionError(404, `Card ${place.beforeId ?? place.afterId} is not in ${to}.`);
  const { rank, index } = spot;
  const { task, events } = applyMove(before, to, rank, ctx, note);
  const ordered = [...peers.slice(0, index), task, ...peers.slice(index)];
  if (needsRebalance(ordered.map((t) => t.rank))) {
    const renumbered = ordered.map((t, i) => ({ ...t, rank: (i + 1) * RANK_STEP }));
    const mine = renumbered[index];
    await s.save({ ...task, rank: mine.rank });
    await s.saveMany(renumbered.filter((t) => t.id !== id && peers.find((p) => p.id === t.id)?.rank !== t.rank));
  } else {
    await s.save(task);
  }
  await s.appendEvents(events);
  return getTaskView(s, id);
}

export async function noteTask(s: TaskStore, id: string, note: string, ctx: Actor): Promise<TaskView> {
  const t = await must(s, id);
  await s.appendEvents([makeNote(t, note, ctx)]);
  return getTaskView(s, id);
}

export async function listTasks(s: TaskStore, f: ListFilter = {}): Promise<{ tasks: Task[]; waiting: number }> {
  const { includeDone, limit, ...filter } = f;
  const all = await s.list(filter);
  const waiting = waitingCount(filter.column || filter.agent !== undefined || filter.lane ? await s.list({ column: "waiting_thomas" }) : all);
  const shown = (includeDone || filter.column === "done" ? all : all.filter((t) => t.column !== "done")).slice(0, limit ?? 100);
  return { tasks: shown, waiting };
}
