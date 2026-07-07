/**
 * Cron/webhook trigger scaffold.
 * The Vercel cron route at /app/api/cron/route.ts calls runDueJobs().
 */
import type { Job } from "@/lib/types";
import { listJobs, updateJobStatus } from "./jobs";
import { createConductor } from "@/lib/orchestrator/conductor";

export async function runJob(job: Job): Promise<void> {
  await updateJobStatus(job.id, "running");
  try {
    const conductor = createConductor();
    await conductor.generate({ prompt: job.prompt });
    await updateJobStatus(job.id, "success");
  } catch {
    await updateJobStatus(job.id, "failed");
  }
}

/** Called by the Vercel cron route every minute — runs any jobs due now. */
export async function runDueJobs(): Promise<{ ran: string[] }> {
  const now = new Date();
  const jobs = await listJobs();
  const due = jobs.filter((j) => {
    if (j.status === "running") return false;
    if (j.trigger.kind === "cron" && j.nextRunAt) {
      return new Date(j.nextRunAt) <= now;
    }
    return j.trigger.kind === "manual" && j.status === "queued";
  });

  await Promise.allSettled(due.map(runJob));
  return { ran: due.map((j) => j.id) };
}
