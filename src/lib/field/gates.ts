/**
 * Field gates Thomas controls at runtime (brain_set_gate): domain warm-up and the
 * daily send cap. Stored in settings; env values are the defaults. Every flip is
 * logged (who + when) to the activity feed and audit log.
 */
import { getSetting, setSetting } from "@/lib/settings";
import { recordActivity } from "@/lib/activity";
import audit from "@/lib/audit";
import { fieldEnv } from "./config";

export interface Gates { domainWarmed: boolean; dailyCap: number; warmNote: string; setBy: string | null; setAt: string | null }

export async function getGates(): Promise<Gates> {
  const [warm, cap, by, at] = await Promise.all(["gate_domain_warmed", "gate_daily_cap", "gate_set_by", "gate_set_at"].map((k) => getSetting(k).catch(() => undefined)));
  const domainWarmed = warm === undefined ? fieldEnv.domainWarmed() : warm === "true";
  const dailyCap = cap && Number(cap) > 0 ? Math.floor(Number(cap)) : fieldEnv.dailyCap();
  return {
    domainWarmed,
    dailyCap,
    warmNote: domainWarmed ? `Warm-up confirmed${by ? ` by ${by}` : ""}. Approved emails can send.` : "Warm-up not confirmed: approved emails wait until Thomas confirms it.",
    setBy: by ?? null,
    setAt: at ?? null,
  };
}

export async function setGates(change: { domainWarmed?: boolean; dailyCap?: number }, by: string): Promise<Gates> {
  const at = new Date().toISOString();
  const before = await getGates();
  if (change.domainWarmed !== undefined) await setSetting("gate_domain_warmed", String(change.domainWarmed));
  if (change.dailyCap !== undefined) await setSetting("gate_daily_cap", String(change.dailyCap));
  await Promise.all([setSetting("gate_set_by", by), setSetting("gate_set_at", at)]);
  const after = await getGates();
  const what = [
    change.domainWarmed !== undefined && `domainWarmed ${before.domainWarmed} → ${after.domainWarmed}`,
    change.dailyCap !== undefined && `dailyCap ${before.dailyCap} → ${after.dailyCap}`,
  ].filter(Boolean).join(", ");
  audit.record({ action: "connector_change", actor: by, target: "field_gates", detail: { ...change, at } });
  await recordActivity({ kind: "updated", target: `Field gates: ${what}`, because: `set by ${by}`, agent: by });
  // Thomas confirming warm-up also completes that roadmap step (the roadmap never sets the gate).
  if (by === "thomas" && !before.domainWarmed && after.domainWarmed) {
    const { advance } = await import("@/lib/roadmap");
    await advance("warmup", "done", "thomas", "thomas-confirmed");
  }
  return after;
}
