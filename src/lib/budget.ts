/**
 * Daily Claude budget — one cap across every Claude call (chat, automations,
 * Field copy, Ace/Grokbot). Warn at CLAUDE_DAILY_WARN_USD (default $3), hard stop
 * at CLAUDE_DAILY_CAP_USD (default $5.50). "Today" is the console timezone.
 * The first time each threshold is crossed in a day, it posts once to
 * Discord/Slack (if a webhook is set) and logs an alert to the activity feed.
 */
import { startOfTodayIso, todayIn } from "@/lib/field/config";
import { spentSince } from "@/lib/usage";
import { getSetting, setSetting } from "@/lib/settings";
import { deliver } from "@/lib/automations/deliver";
import { recordActivity } from "@/lib/activity";

export type BudgetStatus = "ok" | "warning" | "blocked";
export interface ClaudeBudget { spentTodayUsd: number; warnUsd: number; capUsd: number; remainingUsd: number; status: BudgetStatus; unreadable?: boolean }

const usd = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; };
const round = (n: number) => Number(n.toFixed(4));

/** Today's spend, retried (Neon's first request after idle can fail). null = couldn't read. */
async function spentToday(): Promise<number | null> {
  for (let i = 0; i < 3; i++) {
    try {
      return await spentSince(undefined, startOfTodayIso());
    } catch {
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  return null;
}

export async function claudeBudget(): Promise<ClaudeBudget> {
  const warnUsd = usd("CLAUDE_DAILY_WARN_USD", 3);
  const capUsd = usd("CLAUDE_DAILY_CAP_USD", 5.5);
  const read = await spentToday();
  // Fail closed: if spend can't be read, treat the cap as reached rather than risk overspending.
  const spent = read ?? capUsd;
  const status: BudgetStatus = spent >= capUsd ? "blocked" : spent >= warnUsd ? "warning" : "ok";
  if (read === null) return { spentTodayUsd: 0, warnUsd, capUsd, remainingUsd: 0, status, unreadable: true };
  if (status !== "ok") void alertOnce(status, spent, warnUsd, capUsd);
  return { spentTodayUsd: round(spent), warnUsd, capUsd, remainingUsd: round(Math.max(0, capUsd - spent)), status };
}

/** 429 Response when today's hard cap is reached, else null. Call before any Claude request. */
export async function budgetBlock(): Promise<Response | null> {
  const b = await claudeBudget();
  if (b.status !== "blocked") return null;
  if (b.unreadable) return Response.json({ ok: false, error: "Couldn't read today's Claude spend, so Claude is paused to protect the budget. Try again shortly.", budget: b }, { status: 503 });
  return Response.json({ ok: false, error: `Daily Claude budget reached ($${b.spentTodayUsd.toFixed(2)} of $${b.capUsd.toFixed(2)}). Resets at midnight.`, budget: b }, { status: 429 });
}

async function alertOnce(status: Exclude<BudgetStatus, "ok">, spent: number, warnUsd: number, capUsd: number) {
  const key = `budget_alert_${todayIn()}_${status}`;
  try {
    if (await getSetting(key)) return;
    await setSetting(key, new Date().toISOString());
    const title = status === "blocked" ? `Claude hard cap hit: $${spent.toFixed(2)} today` : `Claude spend warning: $${spent.toFixed(2)} today`;
    const body = status === "blocked"
      ? `Claude calls are paused until midnight (cap $${capUsd.toFixed(2)}). Field templates still work.`
      : `Past the $${warnUsd.toFixed(2)} warning line. Hard stop at $${capUsd.toFixed(2)}.`;
    await Promise.allSettled([
      deliver(["discord", "slack"], { title, body }),
      recordActivity({ kind: "alert", target: title, because: body, agent: "budget" }),
    ]);
  } catch {
    /* best-effort */
  }
}
