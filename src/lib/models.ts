import { anthropic } from "@ai-sdk/anthropic";
import type { ModelId, ModelTier } from "@/lib/types";

const TIER_MAP: Record<ModelTier, ModelId> = {
  standard: "claude-sonnet-5-5",
  flagship: "claude-opus-5-5",
};

/** Operations: specialists that take real actions (devops, operator). */
export const OPS: ModelId = "claude-sonnet-5-5";
/** Light work: read, summarize, format, notify (research, data, comms). Half Sonnet's price. */
export const LIGHT: ModelId = "claude-haiku-4-5";
/** Field Email 1 drafts: Sonnet by default, Opus only for hard drafts. */
export const DRAFT: ModelId = "claude-sonnet-5-5";
export const HARD_DRAFT: ModelId = "claude-opus-5-5";

export function conductorModel(tier?: ModelTier): ModelId {
  const t = tier ?? ((process.env.MODEL_TIER ?? "standard") as ModelTier);
  return TIER_MAP[t] ?? TIER_MAP.standard;
}

/** Claude via the Anthropic API directly (reads ANTHROPIC_API_KEY). */
export const claude = (id: ModelId) => anthropic(id);
