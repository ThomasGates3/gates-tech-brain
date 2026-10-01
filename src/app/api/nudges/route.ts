/**
 * GET /api/nudges — proactive observations derived from REAL state:
 * today's spend, recent activity, and connector health. "NOVA noticed…".
 */
import { todayUsage } from "@/lib/usage";
import { claudeBudget } from "@/lib/budget";
import { recentActivity } from "@/lib/activity";
import { registry } from "@/lib/connectors/registry";

interface Nudge { id: string; tone: "info" | "warn" | "good"; text: string }

export async function GET() {
  const nudges: Nudge[] = [];

  const usage = await todayUsage();
  const budget = await claudeBudget();
  if (budget.status !== "ok") nudges.push({ id: "spend", tone: "warn", text: budget.unreadable
    ? "Couldn't read today's Claude spend, so Claude is paused to protect the budget."
    : budget.status === "blocked"
    ? `Claude hard cap hit: $${budget.spentTodayUsd.toFixed(2)} of $${budget.capUsd.toFixed(2)}. Claude is paused until midnight.`
    : `Claude spend is $${budget.spentTodayUsd.toFixed(2)} today, past the $${budget.warnUsd.toFixed(2)} warning. Hard stop at $${budget.capUsd.toFixed(2)}.` });
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
