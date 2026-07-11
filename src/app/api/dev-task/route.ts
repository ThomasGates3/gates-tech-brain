/**
 * POST /api/dev-task { task } — dispatch a coding agent to the Moby repo.
 * Returns the agent's output (or a plan if MOBY_DEV_ENABLED isn't set).
 */
import { z } from "zod";
import { dispatchMobyDevTask } from "@/lib/builder/moby";

export const maxDuration = 300;

const Schema = z.object({ task: z.string().min(1).max(4000) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return new Response("Expected { task }", { status: 400 });

  const result = await dispatchMobyDevTask(parsed.data.task);
  return Response.json(result, { status: result.status === "error" ? 500 : 200 });
}
