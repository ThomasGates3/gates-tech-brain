import { anthropic } from "@ai-sdk/anthropic";
import type { ModelId, ModelTier } from "@/lib/types";

const TIER_MAP: Record<ModelTier, ModelId> = {
  standard: "claude-sonnet-5-5",
  flagship: "claude-opus-5-5",
};

/** Operations: specialist sub-agents. */
export const OPS: ModelId = "claude-sonnet-5-5";
/** Copy: Field Email 1 drafts ("Draft with Claude"). */
export const COPY: ModelId = "claude-opus-5-5";

export function conductorModel(tier?: ModelTier): ModelId {
  const t = tier ?? ((process.env.MODEL_TIER ?? "standard") as ModelTier);
  return TIER_MAP[t] ?? TIER_MAP.standard;
}

/** Claude via the Anthropic API directly (reads ANTHROPIC_API_KEY). */
export const claude = (id: ModelId) => anthropic(id);
