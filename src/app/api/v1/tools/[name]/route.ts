/**
 * REST mirror of the MCP tools: POST /api/v1/tools/:name with the tool's JSON args.
 * Auth: Authorization: Bearer <API key>. Spec: /api/v1/openapi.json
 */
import { callTool } from "@/lib/brain/tools";
import { currentOperator } from "@/lib/field/config";

export const maxDuration = 120;

export async function POST(req: Request, ctx: RouteContext<"/api/v1/tools/[name]">) {
  const operator = await currentOperator();
  if (operator !== "ace" && operator !== "thomas") return Response.json({ ok: false, error: "Valid API key required (Authorization: Bearer <key>)." }, { status: 401 });
  const { name } = await ctx.params;
  const r = await callTool(name, await req.json().catch(() => ({})), { operator, via: "rest" });
  return r.ok ? Response.json({ ok: true, result: r.result }) : Response.json({ ok: false, error: r.error }, { status: r.status });
}
