/**
 * Cron/webhook trigger scaffold.
 * The Vercel cron route at /app/api/cron/route.ts calls runDueJobs().
 */
import type { Job } from "@/lib/types";
import { listJobs, updateJobStatus } from "./jobs";
import { createConductor } from "@/lib/orchestrator/conductor";
import audit from "@/lib/audit";

export async function runJob(job: Job): Promise<void> {
  await updateJobStatus(job.id, "running");
  try {
    const conductor = createConductor();
    const result = await conductor.generate({ prompt: job.prompt });
    const output = result.text ?? "(no output)";
    // Capture the result so it isn't discarded — audit now, deliverTo channels next.
    audit.record({
      action: "job_run",
      actor: "scheduler",
      target: job.id,
      detail: { name: job.name, deliverTo: job.report?.deliverTo, chars: output.length },
    });
    await updateJobStatus(job.id, "success");
  } catch (e) {
    audit.record({
      action: "job_run",
      actor: "scheduler",
      target: job.id,
      detail: { name: job.name, error: e instanceof Error ? e.message : "unknown" },
    });
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
