/**
 * GET  /api/settings — current model tier + resolved model id.
 * POST /api/settings { modelTier } — switch the Conductor model live.
 */
import { z } from "zod";
import { resolveModelTier, setModelTier } from "@/lib/settings";
import { conductorModel } from "@/lib/models";

export async function GET() {
  const tier = await resolveModelTier();
  return Response.json({
    modelTier: tier,
    model: conductorModel(tier),
    options: [
      { tier: "standard", label: "Sonnet", model: conductorModel("standard"), note: "Fast + cost-efficient. Great default." },
      { tier: "flagship", label: "Opus", model: conductorModel("flagship"), note: "Most capable. For hard reasoning / premium clients." },
    ],
  });
}

const Schema = z.object({ modelTier: z.enum(["standard", "flagship"]) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return new Response("Expected { modelTier: standard|flagship }", { status: 400 });

  await setModelTier(parsed.data.modelTier);
  return Response.json({ ok: true, modelTier: parsed.data.modelTier, model: conductorModel(parsed.data.modelTier) });
}
