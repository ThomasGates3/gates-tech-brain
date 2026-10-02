/**
 * POST /api/chat — the brain's direct line.
 * Streams the Conductor's reply (plain text) and lets it delegate to specialists.
 * Model is tier-driven (MODEL_TIER): Sonnet (standard) / Opus (flagship).
 * Requires ANTHROPIC_API_KEY (Claude via the Anthropic API directly).
 */
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { claude, conductorModel } from "@/lib/models";
import { budgetBlock } from "@/lib/budget";
import { resolveModelTier } from "@/lib/settings";
import { recordUsage } from "@/lib/usage";
import { specialists } from "@/lib/orchestrator/specialists";
import type { SpecialistId } from "@/lib/types";

export const maxDuration = 60;

const SYSTEM = `You are the Gates Technologies Brain: a precise, competent operator for Thomas Gates III.
Gates sells a call-recovery system to local service businesses (med spas first). The core daily work is the
Field path: Ace loads the High+Med pack → Darrell drafts Email 1 → Nick PASS/REVISE/KILL → Thomas approves →
AgentMail sends. Soft = Hold. No prices in cold copy. No autopilot.
Delegate with delegate_to when a task needs data or tools:
- data (today's Field queue, stages, sends, budget), research (NotebookLM briefings),
- devops (GitHub/Vercel for gatestech.solutions and the Brain), comms (internal notifications),
- operator (Gates Tech site + Speed to Lead lookups/drafts; Brain dev tasks on a branch).
You can't send outreach. Be concise. Never invent data; if you lack it, say so.`;

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

  if (!process.env.ANTHROPIC_API_KEY) return new Response("Chat is offline: ANTHROPIC_API_KEY is not set.", { status: 503 });
  const blocked = await budgetBlock();
  if (blocked) return new Response("Daily Claude budget reached. Chat resumes at midnight.", { status: 429 });

  const tier = await resolveModelTier();
  const model = conductorModel(tier);
  const started = Date.now();
  const result = streamText({
    model: claude(model),
    system: SYSTEM,
    prompt: parsed.data.message,
    tools: { delegate_to: delegateTool },
    stopWhen: stepCountIs(6),
    onError: ({ error }) => console.error("[chat] model call failed:", error),
    onFinish: ({ usage }) => {
      void recordUsage({ model, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, latencyMs: Date.now() - started, source: "chat" });
    },
  });

  return result.toTextStreamResponse();
}
