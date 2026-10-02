/**
 * Gates Technologies Grok bot roster. Status is real: a bot is "active" when it
 * logged activity (via MCP / REST, agent = its id) in the last 30 minutes.
 * Roster + status only — nothing here wakes a bot or sends anything.
 */
import { recentActivity } from "@/lib/activity";

export type AgentStatus = "idle" | "active";
export interface Agent { id: string; label: string; role: string; optional?: boolean }

export const AGENTS: Agent[] = [
  { id: "ace", label: "Ace", role: "CoS / Field ops: queue load, Nick chase, send log" },
  { id: "darrell", label: "Darrell", role: "Cold Email 1 drafts (Field playbook, no prices)" },
  { id: "nick", label: "Nick", role: "Third-party audit PASS / REVISE / KILL (Approve locked until PASS)" },
  { id: "engine", label: "Engine", role: "Business-model / Legacy Labs canon guard (check-only, no send)" },
  { id: "ashley", label: "Ashley", role: "Med-spa / Field missed-call leads (core lane)" },
  { id: "prospectacle", label: "Prospectacle", role: "Website-client scout + Email 1 drafts for the website lane" },
  { id: "vera", label: "Vera", role: "Gap notes from survivors" },
  { id: "todd", label: "Todd", role: "One-page audits from Vera" },
  { id: "ukyo", label: "Ukyo", role: "Instagram client scout" },
  { id: "toga", label: "Toga", role: "IG DM openers" },
  { id: "brandi", label: "Brandi", role: "Site / brand critique" },
  { id: "spec", label: "Spec", role: "PRDs for builds" },
  { id: "lynx", label: "Lynx", role: "Builds from Spec packs only" },
  { id: "kennedy", label: "Kennedy", role: "Adversarial QA" },
  { id: "lisa", label: "Lisa", role: "Mail / calendar short replies" },
  { id: "hermes", label: "Hermes", role: "On-demand research" },
  { id: "floor", label: "Floor", role: "Sales floor", optional: true },
  { id: "gates-tech", label: "Gates Tech", role: "Brand bot", optional: true },
];
export const AGENT_IDS = AGENTS.map((a) => a.id) as [string, ...string[]];

const ACTIVE_MS = 30 * 60 * 1000;

export async function agentStatuses(): Promise<(Agent & { status: AgentStatus; lastSeen: string | null; lastAction: string | null })[]> {
  const recent = await recentActivity(300);
  return AGENTS.map((a) => {
    const last = recent.find((r) => r.agent === a.id);
    const active = Boolean(last && Date.now() - Date.parse(last.at) < ACTIVE_MS);
    return { ...a, status: active ? "active" : "idle", lastSeen: last?.at ?? null, lastAction: last?.target ?? null };
  });
}
