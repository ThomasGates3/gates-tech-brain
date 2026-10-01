import { anthropic } from "@ai-sdk/anthropic";
import type { ModelId, ModelTier } from "@/lib/types";

const TIER_MAP: Record<ModelTier, ModelId> = {
  standard: "claude-sonnet-5",
  flagship: "claude-opus-5-5",
};

export const HAIKU: ModelId = "claude-haiku-4-5";

export function conductorModel(tier?: ModelTier): ModelId {
  const t = tier ?? ((process.env.MODEL_TIER ?? "standard") as ModelTier);
  return TIER_MAP[t] ?? TIER_MAP.standard;
}

/** Claude via the Anthropic API directly (reads ANTHROPIC_API_KEY). */
export const claude = (id: ModelId) => anthropic(id);
