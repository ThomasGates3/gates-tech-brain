/**
 * Claude for Ace (Grokbot) — offload heavy work to Claude on Thomas's Anthropic key
 * so Grok tokens go to deciding, not grinding.
 *
 * GET  /api/field/claude                         → today's Claude spend vs warn line / hard cap
 * POST /api/field/claude { prompt, system?, model?, maxTokens? }
 *   model: "light" (Haiku 4.5, default) | "standard" (Sonnet 5.5) | "copy" (Opus 5.5)
 *
 * Shares the Brain-wide daily budget (lib/budget: warn $3, hard stop $5.50). Text in,
 * text out: no tools, no sending, no Field state changes. Logged to usage as "ace".
 */
import { generateText } from "ai";
import { z } from "zod";
import { error, json, requireOperator } from "@/lib/field/api";
import { claude, HARD_DRAFT, LIGHT, OPS } from "@/lib/models";
import { costUsd, recordUsage } from "@/lib/usage";
import { budgetBlock, claudeBudget } from "@/lib/budget";

export const maxDuration = 120;

const MODELS = { light: LIGHT, standard: OPS, copy: HARD_DRAFT } as const;

const Body = z.object({
  prompt: z.string().min(1).max(200_000),
  system: z.string().max(50_000).optional(),
  model: z.enum(["light", "standard", "copy"]).default("light"),
  maxTokens: z.number().int().min(64).max(16_000).default(4_000),
});

export async function GET() {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return json({ ok: true, models: Object.keys(MODELS), budget: await claudeBudget() });
}

export async function POST(req: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  if (!process.env.ANTHROPIC_API_KEY) return error(503, "ANTHROPIC_API_KEY is not set.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, parsed.error.issues[0]?.message ?? "Expected { prompt, system?, model?, maxTokens? }.");
  const blocked = await budgetBlock();
  if (blocked) return blocked;
  const { prompt, system, model, maxTokens } = parsed.data;

  const id = MODELS[model];
  const started = Date.now();
  try {
    const r = await generateText({ model: claude(id), system, prompt, maxOutputTokens: maxTokens });
    const inTok = r.usage.inputTokens ?? 0;
    const outTok = r.usage.outputTokens ?? 0;
    await recordUsage({ model: id, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - started, source: "ace" });
    return json({
      ok: true,
      text: r.text,
      model: r.response.modelId,
      finishReason: r.finishReason,
      usage: { inputTokens: inTok, outputTokens: outTok, costUsd: Number(costUsd(id, inTok, outTok).toFixed(5)) },
      budget: await claudeBudget(),
    });
  } catch (e) {
    return error(502, `Claude call failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
