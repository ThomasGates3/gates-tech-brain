/**
 * Drizzle-backed Mission Control store. The only Mission file that imports @/db.
 * Like field/store.ts it THROWS on DB failure: callers decide how to degrade.
 */
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { missionTasks, missionTaskEvents } from "@/db/schema";
import type { Changes, Task, TaskEvent } from "./model";
import type { TaskFilter, TaskStore } from "./store";

const toTask = (r: typeof missionTasks.$inferSelect): Task => ({ ...r, links: (r.links ?? []) as Task["links"] }) as unknown as Task;
const toEvent = (r: typeof missionTaskEvents.$inferSelect): TaskEvent => ({ ...r, changes: (r.changes ?? null) as Changes | null }) as unknown as TaskEvent;

export function dbStore(): TaskStore {
  return {
    async get(id) {
      const [r] = await db.select().from(missionTasks).where(eq(missionTasks.id, id)).limit(1);
      return r ? toTask(r) : null;
    },
    async list(f: TaskFilter = {}) {
      const where = and(
        f.column ? eq(missionTasks.column, f.column) : undefined,
        f.lane ? eq(missionTasks.lane, f.lane) : undefined,
        f.agent === undefined ? undefined : f.agent === null ? undefined : eq(missionTasks.agent, f.agent),
        f.dueFrom ? gte(missionTasks.dueDate, f.dueFrom) : undefined,
        f.dueTo ? lte(missionTasks.dueDate, f.dueTo) : undefined,
      );
      const rows = await db.select().from(missionTasks).where(where).orderBy(asc(missionTasks.column), asc(missionTasks.rank));
      const tasks = rows.map(toTask);
      return f.agent === null ? tasks.filter((t) => t.agent === null) : tasks;
    },
    async insert(t) { await db.insert(missionTasks).values(t); },
    async save(t) { await db.update(missionTasks).set(t).where(eq(missionTasks.id, t.id)); },
    async saveMany(list) { for (const t of list) await db.update(missionTasks).set(t).where(eq(missionTasks.id, t.id)); },
    async appendEvents(list) { if (list.length) await db.insert(missionTaskEvents).values(list); },
    async events(taskId, limit = 100) {
      const rows = await db.select().from(missionTaskEvents).where(eq(missionTaskEvents.taskId, taskId)).orderBy(desc(missionTaskEvents.at)).limit(limit);
      return rows.map(toEvent);
    },
  };
}
