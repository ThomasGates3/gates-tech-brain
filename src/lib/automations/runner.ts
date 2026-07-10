/**
 * Run an automation on demand. Executes the Conductor with the (filled) prompt,
 * captures the result text, and records it to the audit log. Returns the output
 * so a caller (API route / deck) can display or deliver it.
 */
import { createConductor } from "@/lib/orchestrator/conductor";
import audit from "@/lib/audit";
import { deliver } from "./deliver";
import { getAutomation, fillPrompt, type AutomationTemplate } from "./catalog";

export interface AutomationRun {
  id: string;
  name: string;
  status: "success" | "error";
  output: string;
  ranAt: string;
  error?: string;
}

export async function runAutomation(
  idOrTemplate: string | AutomationTemplate,
  vars: Record<string, string> = {},
  actor = "system"
): Promise<AutomationRun> {
  const tpl = typeof idOrTemplate === "string" ? getAutomation(idOrTemplate) : idOrTemplate;
  const ranAt = new Date().toISOString();

  if (!tpl) {
    return { id: String(idOrTemplate), name: "unknown", status: "error", output: "", ranAt, error: "Automation not found" };
  }

  const prompt = fillPrompt(tpl.prompt, vars);

  try {
    const conductor = createConductor();
    const result = await conductor.generate({ prompt });
    const output = result.text ?? "(no output)";

    audit.record({
      action: "job_run",
      actor,
      target: tpl.id,
      detail: { name: tpl.name, deliverTo: tpl.deliverTo, chars: output.length },
    });

    // Push the result to its channels (Slack/email). Never blocks the run.
    await deliver(tpl.deliverTo, { title: tpl.name, body: output });

    return { id: tpl.id, name: tpl.name, status: "success", output, ranAt };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error";
    audit.record({ action: "job_run", actor, target: tpl.id, detail: { name: tpl.name, error } });
    return { id: tpl.id, name: tpl.name, status: "error", output: "", ranAt, error };
  }
}
