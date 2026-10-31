/**
 * Mission Control storage contract plus an in-memory store for tests.
 * The Drizzle-backed store lives in db-store.ts so this file never touches @/db.
 */
import type { Column, Lane, Task, TaskEvent } from "./model";

export interface TaskFilter { column?: Column; agent?: string | null; lane?: Lane; dueFrom?: string; dueTo?: string }

export interface TaskStore {
  get(id: string): Promise<Task | null>;
  list(filter?: TaskFilter): Promise<Task[]>;
  insert(task: Task): Promise<void>;
  save(task: Task): Promise<void>;
  /** Used when a column is renumbered. */
  saveMany(tasks: Task[]): Promise<void>;
  appendEvents(events: TaskEvent[]): Promise<void>;
  /** Newest first. */
  events(taskId: string, limit?: number): Promise<TaskEvent[]>;
}

export function matches(t: Task, f: TaskFilter = {}): boolean {
  if (f.column && t.column !== f.column) return false;
  if (f.agent !== undefined && t.agent !== f.agent) return false;
  if (f.lane && t.lane !== f.lane) return false;
  if (f.dueFrom && (!t.dueDate || t.dueDate < f.dueFrom)) return false;
  if (f.dueTo && (!t.dueDate || t.dueDate > f.dueTo)) return false;
  return true;
}

export function memoryStore(seed: { tasks?: Task[]; events?: TaskEvent[] } = {}): TaskStore & { dump(): { tasks: Task[]; events: TaskEvent[] } } {
  const tasks = new Map<string, Task>((seed.tasks ?? []).map((t) => [t.id, structuredClone(t)]));
  const events: TaskEvent[] = (seed.events ?? []).map((e) => structuredClone(e));
  return {
    async get(id) { const t = tasks.get(id); return t ? structuredClone(t) : null; },
    async list(f) { return [...tasks.values()].filter((t) => matches(t, f)).map((t) => structuredClone(t)); },
    async insert(t) { tasks.set(t.id, structuredClone(t)); },
    async save(t) { tasks.set(t.id, structuredClone(t)); },
    async saveMany(list) { for (const t of list) tasks.set(t.id, structuredClone(t)); },
    async appendEvents(list) { events.push(...list.map((e) => structuredClone(e))); },
    async events(taskId, limit = 100) {
      // Reverse first so events written at the same instant come back latest first.
      return events.filter((e) => e.taskId === taskId).reverse().sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map((e) => structuredClone(e));
    },
    dump() { return { tasks: [...tasks.values()].map((t) => structuredClone(t)), events: events.map((e) => structuredClone(e)) }; },
  };
}
