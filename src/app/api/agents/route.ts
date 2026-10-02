/** GET /api/agents — Gates roster with real idle/active status (from Activity). */
import { agentStatuses } from "@/lib/agents";

export async function GET() {
  return Response.json({ agents: await agentStatuses() });
}
