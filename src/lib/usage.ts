/**
 * Real token + spend tracking. Records each model call's usage and cost, and
 * summarizes today's totals for the deck's System panel. Never throws.
 *
 * Prices are USD per 1M tokens (approximate — override via env). Verify against
 * current Anthropic / AI Gateway pricing for billing-grade accuracy.
 */
import { db } from "@/db";
import { usage } from "@/db/schema";
import { gte } from "drizzle-orm";

interface Price { input: number; output: number } // $ per 1M tokens

function priceFor(model: string): Price {
  const m = model.toLowerCase();
  if (m.includes("opus")) return { input: num("PRICE_OPUS_IN", 15), output: num("PRICE_OPUS_OUT", 75) };
  if (m.includes("haiku")) return { input: num("PRICE_HAIKU_IN", 0.8), output: num("PRICE_HAIKU_OUT", 4) };
  return { input: num("PRICE_SONNET_IN", 3), output: num("PRICE_SONNET_OUT", 15) }; // sonnet default
}
const num = (k: string, d: number) => Number(process.env[k] ?? d);

export function costUsd(model: string, inTok: number, outTok: number): number {
  const p = priceFor(model);
  return (inTok / 1e6) * p.input + (outTok / 1e6) * p.output;
}

export interface UsageInput {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  source?: "chat" | "automation" | "dev";
}

export async function recordUsage(u: UsageInput): Promise<void> {
  const inTok = u.inputTokens ?? 0;
  const outTok = u.outputTokens ?? 0;
  try {
    await db.insert(usage).values({
      id: `use_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      model: u.model,
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens: inTok + outTok,
      costUsd: costUsd(u.model, inTok, outTok).toFixed(6),
      latencyMs: Math.round(u.latencyMs ?? 0),
      source: u.source ?? "chat",
      at: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  }
}

export interface UsageSummary {
  tokens: number;
  spendUsd: number;
  avgLatencyMs: number;
  calls: number;
}

export async function todayUsage(): Promise<UsageSummary> {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await db.select().from(usage).where(gte(usage.at, start.toISOString()));
    if (!rows.length) return { tokens: 0, spendUsd: 0, avgLatencyMs: 0, calls: 0 };
    const tokens = rows.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
    const spendUsd = rows.reduce((s, r) => s + Number(r.costUsd ?? 0), 0);
    const latency = rows.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / rows.length;
    return { tokens, spendUsd, avgLatencyMs: Math.round(latency), calls: rows.length };
  } catch {
    return { tokens: 0, spendUsd: 0, avgLatencyMs: 0, calls: 0 };
  }
}
