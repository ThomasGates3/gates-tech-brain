/**
 * POST /api/approvals/[id] { decision } — Thomas approves or denies a pending action.
 * Browser session only, so an agent or API key can never approve its own request.
 * Approving runs the stored call once; a failure is reported, never retried.
 */
import { cookies } from "next/headers";
import { z } from "zod";
import { GATE_COOKIE, readSession } from "@/lib/gate";
import { resolveApproval } from "@/lib/approvals";
import { runToolCall } from "@/lib/tools/router";
import { recordActivity } from "@/lib/activity";
import audit from "@/lib/audit";

const Schema = z.object({ decision: z.enum(["approved", "denied"]) });

export async function POST(req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const session = await readSession((await cookies()).get(GATE_COOKIE)?.value);
  if (session?.operator !== "thomas") return Response.json({ error: "Thomas only" }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "decision must be approved or denied" }, { status: 400 });
  const { decision } = parsed.data;

  const { id } = await ctx.params;
  const call = await resolveApproval(id, decision, session.operator);
  if (!call) return Response.json({ error: "Already decided or expired." }, { status: 409 });

  const name = `${call.connectorId} ${call.toolName}`;
  await audit.record({ action: "approval", actor: session.operator, target: name, detail: { approvalId: id, decision, args: call.args } });
  if (decision === "denied") {
    await recordActivity({ kind: "updated", target: `Denied: ${name}`, because: "Thomas denied it", agent: "thomas" });
    return Response.json({ ok: true, decision });
  }

  const result = await runToolCall(call);
  await audit.record({ action: "tool_call", actor: session.operator, target: name, detail: { approvalId: id, status: result.status, error: result.error } });
  await recordActivity({
    kind: result.status === "success" ? "updated" : "alert",
    target: `${result.status === "success" ? "Ran" : "Failed"}: ${name}`,
    because: result.error ?? "Thomas approved it",
    agent: call.agentId,
  });
  return Response.json({ ok: result.status === "success", decision, result });
}
