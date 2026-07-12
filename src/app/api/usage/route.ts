/** GET /api/usage — today's real token/spend/latency totals + current model. */
import { todayUsage } from "@/lib/usage";
import { resolveModelTier } from "@/lib/settings";

export async function GET() {
  const [summary, tier] = await Promise.all([todayUsage(), resolveModelTier()]);
  return Response.json({ ...summary, modelTier: tier });
}
