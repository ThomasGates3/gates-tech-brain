/**
 * GET  /api/connectors           → list connectors (id, label, auth, enabled, tool count)
 * POST /api/connectors {id}       → test a connector's reachability (live health)
 */
import { z } from "zod";
import { registry } from "@/lib/connectors/registry";

export async function GET() {
  const connectors = registry.all().map((c) => ({
    id: c.id,
    label: c.label,
    auth: c.auth,
    enabled: c.enabled,
    baseUrl: c.baseUrl,
    toolCount: c.tools.length,
    hasCredential: Boolean(c.credential),
  }));
  return Response.json({ connectors });
}

const TestSchema = z.object({ id: z.string().min(1) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) return new Response("Expected { id }", { status: 400 });

  const status = await registry.test(parsed.data.id);
  return Response.json(status);
}
