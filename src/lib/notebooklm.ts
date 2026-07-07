/**
 * NotebookLM wrapper — shells out to the notebooklm CLI venv.
 * Returns KnowledgeItem-shaped data.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import type { KnowledgeItem } from "@/lib/types";

const exec = promisify(execFile);
const CLI = process.env.NOTEBOOKLM_CLI ?? `${process.env.HOME}/.notebooklm-venv/bin/notebooklm`;

async function run(args: string[]): Promise<string> {
  const { stdout } = await exec(CLI, args, { timeout: 120_000 });
  return stdout.trim();
}

export async function createNotebook(title: string): Promise<string> {
  const out = await run(["create", "--title", title, "--json"]);
  const parsed = JSON.parse(out) as { id: string };
  return parsed.id;
}

export async function addSource(notebookId: string, url: string): Promise<string> {
  const out = await run(["add-source", "--notebook", notebookId, "--url", url, "--json"]);
  const parsed = JSON.parse(out) as { sourceId: string };
  return parsed.sourceId;
}

export async function askNotebook(notebookId: string, question: string): Promise<KnowledgeItem> {
  const out = await run(["ask", "--notebook", notebookId, "--question", question, "--json"]);
  const parsed = JSON.parse(out) as { title?: string; content: string; sourceRef?: string };
  return {
    id: `nlm_${notebookId}_${Date.now()}`,
    title: parsed.title ?? question,
    source: "notebooklm",
    sourceRef: parsed.sourceRef ?? notebookId,
    content: parsed.content,
    createdAt: new Date().toISOString(),
  };
}

export async function generateBriefing(notebookId: string): Promise<KnowledgeItem> {
  const out = await run(["generate", "--notebook", notebookId, "--type", "briefing", "--json"]);
  const parsed = JSON.parse(out) as { title?: string; content: string };
  return {
    id: `nlm_brief_${notebookId}_${Date.now()}`,
    title: parsed.title ?? "Briefing",
    source: "notebooklm",
    sourceRef: notebookId,
    content: parsed.content,
    createdAt: new Date().toISOString(),
  };
}
