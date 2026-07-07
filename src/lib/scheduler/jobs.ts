/**
 * Job model helpers — CRUD over the DB + status management.
 * Actual DB implementation uses the drizzle schema in src/db/.
 */
import type { Job, JobStatus } from "@/lib/types";
import { db } from "@/db";
import { jobs as jobsTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listJobs(): Promise<Job[]> {
  const rows = await db.select().from(jobsTable).orderBy(jobsTable.createdAt);
  return rows.map(rowToJob);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const [row] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  return row ? rowToJob(row) : undefined;
}

export async function createJob(data: Omit<Job, "id" | "status" | "lastRunAt">): Promise<Job> {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(jobsTable)
    .values({
      id,
      name: data.name,
      prompt: data.prompt,
      trigger: data.trigger,
      status: "idle",
      vertical: data.vertical,
      nextRunAt: data.nextRunAt,
      report: data.report,
    })
    .returning();
  return rowToJob(row);
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<void> {
  await db
    .update(jobsTable)
    .set({ status, lastRunAt: status === "running" ? new Date().toISOString() : undefined })
    .where(eq(jobsTable.id, id));
}

export async function deleteJob(id: string): Promise<void> {
  await db.delete(jobsTable).where(eq(jobsTable.id, id));
}

function rowToJob(row: typeof jobsTable.$inferSelect): Job {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    trigger: row.trigger as Job["trigger"],
    status: row.status as JobStatus,
    vertical: row.vertical as Job["vertical"],
    lastRunAt: row.lastRunAt ?? undefined,
    nextRunAt: row.nextRunAt ?? undefined,
    report: row.report as Job["report"],
  };
}
