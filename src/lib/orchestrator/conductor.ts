/**
 * Conductor agent — the "brain" that plans, delegates to specialists, and streams AgentEvents.
 */
import { Experimental_Agent, gateway, tool, createAgentUIStream } from "ai";
import { z } from "zod";
import type { AgentEvent, SpecialistId } from "@/lib/types";
import { conductorModel } from "@/lib/models";
import { specialists } from "./specialists";

const CONDUCTOR_SYSTEM = `You are the AI Brain Conductor — a precise, competent orchestrator.
You plan tasks, delegate to specialists (research, data, devops, comms), and synthesize results.
Speak concisely and confidently. Surface insights proactively. Never hallucinate data.

When you receive a request:
1. Identify which specialists are needed.
2. Delegate via the delegate_to tool.
3. Synthesize all results into a clear final answer.
4. If a proactive insight exists, surface it as a briefing.`;

/** Tool that lets the Conductor hand off to a specialist agent. */
const delegateTool = tool({
  description:
    "Delegate a sub-task to a specialist agent (research, data, devops, comms). Use this when the task requires specialist knowledge or connector access.",
  inputSchema: z.object({
    specialist: z.enum(["research", "data", "devops", "comms"]).describe("Which specialist to use"),
    task: z.string().describe("Clear description of what the specialist should do"),
  }),
  execute: async ({ specialist, task }) => {
    const agent = specialists[specialist as SpecialistId];
    const result = await agent.generate({ prompt: task });
    return {
      specialist,
      result: result.text ?? "(no text response)",
    };
  },
});

export function createConductor() {
  return new Experimental_Agent({
    id: "conductor",
    model: gateway(conductorModel()),
    instructions: CONDUCTOR_SYSTEM,
    tools: { delegate_to: delegateTool },
  });
}

/** Stream the Conductor's response and translate AI SDK events → AgentEvents. */
export async function streamConductor(
  uiMessages: Parameters<typeof createAgentUIStream>[0]["uiMessages"],
  onEvent: (event: AgentEvent) => void
) {
  const conductor = createConductor();

  const stream = await createAgentUIStream({
    agent: conductor,
    uiMessages,
    onStepFinish(step) {
      if (step.text) {
        onEvent({ type: "thinking", agentId: "conductor", text: step.text, at: new Date().toISOString() });
      }
      for (const tc of step.toolCalls ?? []) {
        if (tc.toolName === "delegate_to") {
          const specialist = (tc.input as { specialist: SpecialistId }).specialist;
          onEvent({
            type: "delegating",
            to: specialist,
            task: (tc.input as { task: string }).task,
            at: new Date().toISOString(),
          });
        }
      }
    },
  });

  return stream;
}
