/** GET /api/approvals — actions waiting on Thomas. Browser session only, never an API key. */
import { cookies } from "next/headers";
import { GATE_COOKIE, readSession } from "@/lib/gate";
import { listPending } from "@/lib/approvals";

export async function GET() {
  const session = await readSession((await cookies()).get(GATE_COOKIE)?.value);
  if (session?.operator !== "thomas") return Response.json({ error: "Thomas only" }, { status: 403 });
  return Response.json({ approvals: await listPending() });
}
