/**
 * GET /api/deck — real numbers for the command deck (no mock metrics):
 * Field briefing, Operations stats and HUD readouts, all from live state.
 */
import { fieldSnapshot } from "@/lib/field/snapshot";
import { agentStatuses } from "@/lib/agents";
import { recentActivity } from "@/lib/activity";
import { registry } from "@/lib/connectors/registry";
import { resolveModelTier } from "@/lib/settings";
import { listApiKeys } from "@/lib/api-keys";

export async function GET() {
  const [snap, agents, acts, tier, keys] = await Promise.all([
    fieldSnapshot(),
    agentStatuses(),
    recentActivity(300),
    resolveModelTier(),
    listApiKeys().catch(() => []),
  ]);
  const dayAgo = Date.now() - 24 * 3600e3;
  const toolCalls24h = acts.filter((a) => Date.parse(a.at) > dayAgo && /^(MCP|REST) /.test(a.because ?? "")).length;
  const conns = [...registry.all().filter((c) => c.enabled).map((c) => Boolean(c.credential)), snap.gates.agentmail, snap.gates.notion];
  const live = conns.filter(Boolean).length;
  const active = agents.filter((a) => a.status === "active").length;
  const q = snap.queue;
  return Response.json({
    briefing: {
      lead: snap.next[0] ?? "Field is clear. Nothing waiting on you.",
      items: [
        { label: "High+Med in today's pack", value: String(q.highMed), detail: `${q.soft} Soft on Hold · ${q.undrafted} not drafted` },
        { label: "Waiting on Nick", value: String(q.atNick + q.drafted), urgent: q.atNick > 0 },
        { label: "PASS, waiting on your approval", value: String(q.passAwaitingApprove), urgent: q.passAwaitingApprove > 0 },
        { label: "Email 1 sent today", value: `${snap.sentToday} / ${snap.dailyCap}` },
      ],
      next: snap.next,
    },
    ops: [
      { label: "Connectors live", value: `${live} / ${conns.length}`, bar: Math.round((live / conns.length) * 100) },
      { label: "Bot tool calls", value: String(toolCalls24h), sub: "24h" },
      { label: "Active agents", value: String(active), bar: Math.round((active / agents.length) * 100) },
      { label: "Approvals", value: String(q.passAwaitingApprove), sub: "PASS waiting" },
      { label: "API keys", value: String(keys.filter((k) => !k.revokedAt).length), sub: "active" },
    ],
    readouts: { tier: tier.toUpperCase(), activeAgents: active, sent: `${snap.sentToday}/${snap.dailyCap}`, claude: `$${snap.claudeBudget.spentTodayUsd.toFixed(2)}/$${snap.claudeBudget.capUsd.toFixed(2)}` },
  });
}
