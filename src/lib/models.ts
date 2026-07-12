import type { ModelId, ModelTier } from "@/lib/types";

const TIER_MAP: Record<ModelTier, ModelId> = {
  standard: "anthropic/claude-sonnet-4-6",
  flagship: "anthropic/claude-opus-4-8",
};

export const HAIKU: ModelId = "anthropic/claude-haiku-4-5";

export function conductorModel(tier?: ModelTier): ModelId {
  const t = tier ?? ((process.env.MODEL_TIER ?? "standard") as ModelTier);
  return TIER_MAP[t] ?? TIER_MAP.standard;
}
