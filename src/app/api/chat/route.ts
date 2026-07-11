/**
 * POST /api/chat — the brain's direct line.
 * Streams the Conductor's reply (plain text) and lets it delegate to specialists.
 * Model is tier-driven (MODEL_TIER): Sonnet (standard) / Opus (flagship).
 * Requires AI_GATEWAY_API_KEY (or Vercel OIDC) to reach the gateway.
 */
import { streamText, tool, stepCountIs, gateway } from "ai";
import { z } from "zod";
import { conductorModel } from "@/lib/models";
import { specialists } from "@/lib/orchestrator/specialists";
import type { SpecialistId } from "@/lib/types";

export const maxDuration = 60;

const SYSTEM = `You are the AI Brain Conductor — a precise, competent orchestrator for a business.
You plan tasks, delegate to specialists via the delegate_to tool when a task needs connector
access or specialist knowledge, then synthesize a clear, confident answer. Specialists:
- research (NotebookLM), data (Postgres/BigQuery), devops (GitHub/Vercel/AWS), comms (Slack/email),
- operator (runs the business apps: Twin Trading, Ad System, Gates Tech, Speed to Lead, AI Link in Bio,
  and can dispatch a coding agent to the Moby app for dev tasks).
Be concise. Surface useful insights proactively. Never invent data — if you lack a connector, say so.`;

const delegateTool = tool({
  description: "Delegate a sub-task to a specialist agent (research, data, devops, comms, operator).",
  inputSchema: z.object({
    specialist: z.enum(["research", "data", "devops", "comms", "operator"]),
    task: z.string().describe("Clear description of what the specialist should do"),
  }),
  execute: async ({ specialist, task }) => {
    const agent = specialists[specialist as SpecialistId];
    const r = await agent.generate({ prompt: task });
    return { specialist, result: r.text ?? "(no response)" };
  },
});

const BodySchema = z.object({ message: z.string().min(1).max(4000) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Message is required (1–4000 chars).", { status: 400 });
  }

  const result = streamText({
    model: gateway(conductorModel()),
    system: SYSTEM,
    prompt: parsed.data.message,
    tools: { delegate_to: delegateTool },
    stopWhen: stepCountIs(6),
  });

  return result.toTextStreamResponse();
}
