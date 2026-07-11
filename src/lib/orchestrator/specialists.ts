/**
 * Specialist sub-agent definitions.
 * Each has a scoped system prompt + tool subset.
 */
import { Experimental_Agent, tool, gateway } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { SpecialistId } from "@/lib/types";
import { HAIKU } from "@/lib/models";
import { executeToolCall } from "@/lib/tools/router";
import { registry } from "@/lib/connectors/registry";
import { createNotebook, addSource, askNotebook, generateBriefing } from "@/lib/notebooklm";
import { dispatchDevTask, DEV_TARGETS } from "@/lib/builder/dev-agent";

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

/** Dev-agent: spins up a coding agent against a target repo (Moby, Ad System). */
const devTool = tool({
  description:
    "Dispatch a coding agent to do a development task on one of the business apps (create a feature, fix a bug, refactor). Runs on a branch; returns the agent's output.",
  inputSchema: z.object({
    repo: z.enum(DEV_TARGETS as [string, ...string[]]).describe("Which repo to work on"),
    task: z.string().describe("Clear, self-contained dev task"),
  }),
  execute: async ({ repo, task }) => dispatchDevTask(repo, task),
});

function makeAgent(id: SpecialistId, system: string, tools: ToolSet) {
  return new Experimental_Agent({
    id,
    model: gateway(HAIKU),
    instructions: system,
    tools,
  });
}

export const specialists: Record<SpecialistId, Experimental_Agent> = {
  research: makeAgent(
    "research",
    "You are the Research specialist. Use NotebookLM tools to create notebooks, ingest sources, and generate briefings. Return structured, cited answers.",
    notebooklmTools
  ),
  data: makeAgent(
    "data",
    "You are the Data specialist. Use database connectors (Supabase, BigQuery) to query, analyze, and summarize business data. Always show the SQL or query used.",
    connectorTools(["supabase", "bigquery"])
  ),
  devops: makeAgent(
    "devops",
    "You are the DevOps specialist. Use GitHub, Vercel, and AWS connectors to inspect deployments, repos, metrics, and workflows. Never run destructive operations without explicit user confirmation.",
    connectorTools(["github", "vercel", "aws"])
  ),
  comms: makeAgent(
    "comms",
    "You are the Comms/Reporting specialist. Use webhook connectors to send notifications and deliver report artifacts to Slack, email, or other channels.",
    connectorTools(["webhook"])
  ),
  operator: makeAgent(
    "operator",
    "You are the Operator specialist — you run the business's own apps. Use the connectors for Twin Trading (content), Twin Trading Link-in-Bio, Ad System (Veo/HeyGen video + leads), AI Link in Bio, Gates Tech (bookings/intake), and Speed to Lead (lead outreach) to perform real tasks. You can also dispatch a coding agent to the Moby app via moby_dev_task for development work. Confirm before anything destructive (sending outreach, spending).",
    {
      ...connectorTools(["twin-trading", "twin-trading-bio", "ad-system", "ai-link-bio", "gates-tech", "speed-to-lead"]),
      dev_task: devTool,
    }
  ),
};
