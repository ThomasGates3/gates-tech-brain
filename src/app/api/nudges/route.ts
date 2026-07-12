/**
 * GET /api/nudges — proactive observations derived from REAL state:
 * today's spend, recent activity, and connector health. "NOVA noticed…".
 */
import { todayUsage } from "@/lib/usage";
import { recentActivity } from "@/lib/activity";
import { registry } from "@/lib/connectors/registry";

interface Nudge { id: string; tone: "info" | "warn" | "good"; text: string }

export async function GET() {
  const nudges: Nudge[] = [];

  const usage = await todayUsage();
  if (usage.spendUsd > 5) nudges.push({ id: "spend", tone: "warn", text: `Spend is $${usage.spendUsd.toFixed(2)} today across ${usage.calls} calls — worth a glance.` });
  if (usage.calls === 0) nudges.push({ id: "idle", tone: "info", text: "Quiet so far today — ask me to run a briefing or an automation." });

  const acts = await recentActivity(5);
  const errors = acts.filter((a) => a.kind === "alert");
  if (errors.length) nudges.push({ id: "alert", tone: "warn", text: `${errors.length} thing${errors.length > 1 ? "s" : ""} flagged recently — top: ${errors[0].target}.` });
  const spawned = acts.find((a) => a.kind === "spawned");
  if (spawned) nudges.push({ id: "dev", tone: "good", text: `A dev task ran recently: ${spawned.target}.` });

  // Connectors with no credential set (can't actually run yet).
  const noKey = registry.all().filter((c) => c.enabled && !c.credential).length;
  const missingKeys = registry.all().filter((c) => c.enabled && c.credential).length;
  if (missingKeys > 0 && usage.calls === 0) {
    nudges.push({ id: "connect", tone: "info", text: `${missingKeys} connectors are wired but need keys to go live. Add one to unlock real data.` });
  }
  void noKey;

  return Response.json({ nudges: nudges.slice(0, 3) });
}
