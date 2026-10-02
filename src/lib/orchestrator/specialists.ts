/**
 * Specialist sub-agent definitions.
 * Each has a scoped system prompt + tool subset.
 */
import { Experimental_Agent, tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { SpecialistId } from "@/lib/types";
import { claude, LIGHT, OPS } from "@/lib/models";
import { executeToolCall } from "@/lib/tools/router";
import { registry } from "@/lib/connectors/registry";
import { createNotebook, addSource, askNotebook, generateBriefing } from "@/lib/notebooklm";
import { dispatchDevTask, DEV_TARGETS } from "@/lib/builder/dev-agent";
import { fieldSnapshot } from "@/lib/field/snapshot";
import { listLog, listQueue } from "@/lib/field/store";
import { todayIn } from "@/lib/field/config";

function makeConnectorTool(connectorId: string, toolName: string) {
  const connector = registry.get(connectorId);
  const spec = connector?.tools.find((t) => t.name === toolName);
  if (!spec || !connector) return null;

  // Build a zod schema from the ToolSpec params
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, param] of Object.entries(spec.params ?? {})) {
    let zType: z.ZodTypeAny = z.string();
    if (param.type === "number") zType = z.number();
    else if (param.type === "boolean") zType = z.boolean();
    else if (param.type === "object") zType = z.record(z.string(), z.unknown());
    else if (param.type === "array") zType = z.array(z.unknown());
    shape[key] = param.required ? zType : zType.optional();
  }

  return tool({
    description: spec.description,
    inputSchema: z.object(shape),
    execute: async (args) => {
      const id = `tc_${connectorId}_${toolName}_${Date.now()}`;
      return executeToolCall({
        id,
        connectorId,
        toolName,
        args: args as Record<string, unknown>,
        risk: spec.risk,
        status: "running",
        agentId: connectorId as SpecialistId,
        createdAt: new Date().toISOString(),
      });
    },
  });
}

function connectorTools(connectorIds: string[]) {
  const tools: ToolSet = {};
  for (const connId of connectorIds) {
    const connector = registry.get(connId);
    if (!connector?.enabled) continue;
    for (const spec of connector.tools) {
      // No autopilot: agents never get tools that send/spend. Those happen only via the Field path.
      if (spec.risk === "destructive") continue;
      const t = makeConnectorTool(connId, spec.name);
      if (t) tools[`${connId}__${spec.name}`] = t;
    }
  }
  return tools;
}

const notebooklmTools = {
  notebooklm__create: tool({
    description: "Create a new NotebookLM notebook and return its ID",
    inputSchema: z.object({ title: z.string().describe("Notebook title") }),
    execute: async ({ title }) => createNotebook(title),
  }),
  notebooklm__add_source: tool({
    description: "Add a URL source to a NotebookLM notebook",
    inputSchema: z.object({ notebookId: z.string(), url: z.string().url() }),
    execute: async ({ notebookId, url }) => addSource(notebookId, url),
  }),
  notebooklm__ask: tool({
    description: "Ask a question to a NotebookLM notebook",
    inputSchema: z.object({ notebookId: z.string(), question: z.string() }),
    execute: async ({ notebookId, question }) => askNotebook(notebookId, question),
  }),
  notebooklm__briefing: tool({
    description: "Generate a briefing/summary from a NotebookLM notebook",
    inputSchema: z.object({ notebookId: z.string() }),
    execute: async ({ notebookId }) => generateBriefing(notebookId),
  }),
};

/** Dev-agent (Lynx builds): spins up a coding agent against a Gates repo, on a branch. Local only. */
const devTool = tool({
  description:
    "Dispatch a coding agent to do a development task on one of the business apps (create a feature, fix a bug, refactor). Runs on a branch; returns the agent's output.",
  inputSchema: z.object({
    repo: z.enum(DEV_TARGETS as [string, ...string[]]).describe("Which repo to work on"),
    task: z.string().describe("Clear, self-contained dev task"),
  }),
  execute: async ({ repo, task }) => dispatchDevTask(repo, task),
});

function makeAgent(id: SpecialistId, system: string, tools: ToolSet, model = OPS) {
  return new Experimental_Agent({
    id,
    model: claude(model),
    instructions: system,
    tools,
  });
}

/** Read-only Field data for the Data specialist (real Neon data, no connectors needed). */
const fieldTools = {
  field__snapshot: tool({
    description: "Today's real Field status: queue counts by stage, sends today vs cap, Claude spend vs budget, gates, next actions.",
    inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    execute: async ({ date }) => fieldSnapshot(date),
  }),
  field__queue: tool({
    description: "Contacts in a day's Field queue (name, priority, stage, Nick verdict, gap). Read-only.",
    inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    execute: async ({ date }) =>
      (await listQueue(date ?? todayIn())).map(({ id, name, priority, stage, nickVerdict, gap, city, suppressed }) => ({ id, name, priority, stage, nickVerdict, gap, city, suppressed })),
  }),
  field__send_log: tool({
    description: "Recent Email 1 sends (time, recipient, AgentMail id, operator). Read-only.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    execute: async ({ limit }) => listLog(limit),
  }),
};

export const specialists: Record<SpecialistId, Experimental_Agent> = {
  research: makeAgent(
    "research",
    "You are the Research specialist (Hermes) for Gates Technologies. Use NotebookLM to ingest sources and build briefings; return structured, cited answers. NotebookLM is a creative assist only: never include prices in cold-outreach assets.",
    notebooklmTools,
    LIGHT
  ),
  data: makeAgent(
    "data",
    "You are the Data specialist for Gates Technologies. Use the Field tools to answer questions about today's outreach queue, stages, sends and budget. Report only what the tools return; never invent figures.",
    fieldTools,
    LIGHT
  ),
  devops: makeAgent(
    "devops",
    "You are the DevOps specialist (supports Lynx). Use GitHub and Vercel to inspect the gatestech.solutions and Brain repos and deployments. Read and report; never run destructive operations.",
    connectorTools(["github", "vercel"])
  ),
  comms: makeAgent(
    "comms",
    "You are the Comms specialist. Use the webhook connector to deliver internal notifications and reports to Thomas. Never contact prospects or clients.",
    connectorTools(["webhook"]),
    LIGHT
  ),
  operator: makeAgent(
    "operator",
    "You are the Operator specialist for Gates Technologies. Use the Gates Tech site (bookings/intake) and Speed to Lead connectors to look things up and prepare drafts. You cannot send outreach: anything outbound goes through the Field path (Nick PASS, then Thomas approves). For build work, dispatch the coding agent to the Brain repo on a branch.",
    {
      ...connectorTools(["gates-tech", "speed-to-lead"]),
      dev_task: devTool,
    }
  ),
};
