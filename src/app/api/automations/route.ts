/**
 * GET  /api/automations        → list the catalog (id, name, category, description)
 * POST /api/automations {id,vars,dryRun?} → run one on demand (draft-only), return the result
 */
import { z } from "zod";
import { listAutomations } from "@/lib/automations/catalog";
import { runAutomation } from "@/lib/automations/runner";

export const maxDuration = 120;

export async function GET() {
  const items = listAutomations().map(({ id, name, category, description, trigger, requires, inputs }) => ({
    id,
    name,
    category,
    description,
    trigger: trigger.kind,
    requires,
    inputs: inputs ?? [],
  }));
  return Response.json({ automations: items });
}

const RunSchema = z.object({
  id: z.string().min(1),
  vars: z.record(z.string(), z.string()).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) return new Response("Expected { id, vars? }", { status: 400 });

  const run = await runAutomation(parsed.data.id, parsed.data.vars ?? {}, "thomas", { dryRun: parsed.data.dryRun ?? false });
  return Response.json(run, { status: run.status === "success" ? 200 : 500 });
}
