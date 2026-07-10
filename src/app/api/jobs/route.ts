/**
 * GET    /api/jobs        → list scheduled jobs
 * POST   /api/jobs        → create a job { name, prompt, trigger, vertical?, nextRunAt? }
 * DELETE /api/jobs?id=... → delete a job
 *
 * Backed by Neon (scheduler/jobs.ts). If the tables don't exist yet, returns a
 * clear hint to run `npm run db:push` instead of a raw DB crash.
 */
import { z } from "zod";
import { listJobs, createJob, deleteJob } from "@/lib/scheduler/jobs";

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : "Database error";
  const needsMigrate = /relation .* does not exist|no such table/i.test(msg);
  return Response.json(
    { error: msg, hint: needsMigrate ? "Run `npm run db:push` to create the tables in your Neon database." : undefined },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return Response.json({ jobs: await listJobs() });
  } catch (e) {
    return dbError(e);
  }
}

const TriggerSchema = z.union([
  z.object({ kind: z.literal("cron"), expression: z.string().min(1) }),
  z.object({ kind: z.literal("webhook"), secretRef: z.string().min(1) }),
  z.object({ kind: z.literal("manual") }),
]);

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4000),
  trigger: TriggerSchema,
  vertical: z.enum(["agency", "accounting", "law", "medical", "insurance"]).optional(),
  nextRunAt: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid job", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const job = await createJob(parsed.data);
    return Response.json(job, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing ?id", { status: 400 });
  try {
    await deleteJob(id);
    return Response.json({ ok: true, id });
  } catch (e) {
    return dbError(e);
  }
}
