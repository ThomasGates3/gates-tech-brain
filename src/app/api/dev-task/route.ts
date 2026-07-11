/**
 * POST /api/dev-task { repo, task } — dispatch a coding agent to a target repo.
 * repo ∈ { moby, ad-system }. Returns the agent's output (or a plan if
 * DEV_AGENT_ENABLED isn't set).
 */
import { z } from "zod";
import { dispatchDevTask, DEV_TARGETS } from "@/lib/builder/dev-agent";

export const maxDuration = 300;

const Schema = z.object({
  repo: z.enum(DEV_TARGETS as [string, ...string[]]),
  task: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return new Response(`Expected { repo: ${DEV_TARGETS.join("|")}, task }`, { status: 400 });

  const result = await dispatchDevTask(parsed.data.repo, parsed.data.task);
  return Response.json(result, { status: result.status === "error" ? 500 : 200 });
}
