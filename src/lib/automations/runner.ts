/**
 * Run an automation. DRAFT-ONLY by construction: the model gets no connector or
 * sending tools (web search only, where the template allows it), so a run can
 * produce text but never act. {{field}} / {{activity}} are filled with real data.
 *
 * dryRun: true  → generate only (nothing delivered anywhere).
 * dryRun: false → generate, then deliver the text to the template's channels
 *                 (deck activity + Discord/Slack). Still never sends outreach.
 */
import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import audit from "@/lib/audit";
import { deliver } from "./deliver";
import { recordActivity, recentActivity } from "@/lib/activity";
import { claude, OPS } from "@/lib/models";
import { claudeBudget } from "@/lib/budget";
import { recordUsage } from "@/lib/usage";
import { fieldSnapshot } from "@/lib/field/snapshot";
import { getAutomation, fillPrompt, type AutomationTemplate } from "./catalog";

export interface AutomationRun {
  id: string;
  name: string;
  status: "success" | "error";
  dryRun: boolean;
  delivered: string[];
  output: string;
  ranAt: string;
  error?: string;
}

const SYSTEM =
  "You are the Gates Technologies Brain, writing internal drafts for Thomas Gates III. Be precise and plain-spoken. " +
  "Never invent numbers, clients or results; use only what you are given (or cite web sources when searching). " +
  "You cannot send or post anything; your output is a draft for a human.";

export async function runAutomation(
  idOrTemplate: string | AutomationTemplate,
  vars: Record<string, string> = {},
  actor = "system",
  opts: { dryRun?: boolean } = {}
): Promise<AutomationRun> {
  const dryRun = opts.dryRun ?? false;
  const tpl = typeof idOrTemplate === "string" ? getAutomation(idOrTemplate) : idOrTemplate;
  const ranAt = new Date().toISOString();
  const base = { dryRun, delivered: [] as string[], output: "", ranAt };
  if (!tpl) return { ...base, id: String(idOrTemplate), name: "unknown", status: "error", error: "Automation not found" };
  if ((await claudeBudget()).status === "blocked") return { ...base, id: tpl.id, name: tpl.name, status: "error", error: "Daily Claude budget reached" };

  try {
    const filled = { ...vars };
    if (tpl.prompt.includes("{{field}}")) filled.field = JSON.stringify(await fieldSnapshot());
    if (tpl.prompt.includes("{{activity}}")) {
      const acts = await recentActivity(25);
      filled.activity = acts.map((a) => `${a.at} ${a.agent ?? ""} ${a.kind}: ${a.target}`).join("\n") || "(none)";
    }
    const started = Date.now();
    const r = await generateText({
      model: claude(OPS),
      system: SYSTEM,
      prompt: fillPrompt(tpl.prompt, filled),
      maxOutputTokens: 4000,
      ...(tpl.webSearch && { tools: { web_search: anthropic.tools.webSearch_20260209({ maxUses: 5 }) }, stopWhen: stepCountIs(3) }),
    });
    void recordUsage({ model: OPS, inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens, latencyMs: Date.now() - started, source: "automation" });
    const output = r.text || "(no output)";

    audit.record({ action: "job_run", actor, target: tpl.id, detail: { name: tpl.name, dryRun, chars: output.length } });
    const delivered = dryRun ? [] : tpl.deliverTo;
    if (!dryRun) await deliver(tpl.deliverTo.filter((c) => c !== "deck"), { title: tpl.name, body: output });
    await recordActivity({ kind: "generated", target: `${tpl.name}${dryRun ? " (dry run)" : ""}`, because: dryRun ? "dry run: not delivered" : `delivered: ${delivered.join(", ")}`, agent: actor });

    return { ...base, id: tpl.id, name: tpl.name, status: "success", delivered, output };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error";
    audit.record({ action: "job_run", actor, target: tpl.id, detail: { name: tpl.name, error } });
    return { ...base, id: tpl.id, name: tpl.name, status: "error", error };
  }
}
