/**
 * Runtime settings — DB-backed key/value so changes (like model tier) apply
 * live without a redeploy. Falls back to env, then a default. Never throws.
 */
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ModelTier } from "@/lib/types";

export async function getSetting(key: string): Promise<string | undefined> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return row?.value;
  } catch {
    return undefined;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  } catch {
    /* best-effort */
  }
}

const VALID_TIERS: ModelTier[] = ["standard", "flagship"];

/** Current Conductor tier: DB setting → env → "standard". */
export async function resolveModelTier(): Promise<ModelTier> {
  const stored = (await getSetting("model_tier")) as ModelTier | undefined;
  if (stored && VALID_TIERS.includes(stored)) return stored;
  const env = process.env.MODEL_TIER as ModelTier | undefined;
  return env && VALID_TIERS.includes(env) ? env : "standard";
}

export async function setModelTier(tier: ModelTier): Promise<void> {
  if (VALID_TIERS.includes(tier)) await setSetting("model_tier", tier);
}
