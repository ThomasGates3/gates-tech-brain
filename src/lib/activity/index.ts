/**
 * Activity log — the real, persisted stream of things the Brain gets done.
 * Backed by Neon (survives reloads/sessions). Never throws: if the DB is
 * unavailable, record() no-ops and recent() returns [] so the deck still renders.
 */
import { db } from "@/db";
import { activity } from "@/db/schema";
import { desc } from "drizzle-orm";

export type ActivityKind = "generated" | "updated" | "spawned" | "connected" | "sent" | "queried" | "alert";

export interface ActivityInput {
  kind: ActivityKind;
  target: string;
  because?: string;
  agent?: string;
}

export interface ActivityRow extends ActivityInput {
  id: string;
  at: string;
}

export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    await db.insert(activity).values({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: input.kind,
      target: input.target,
      because: input.because,
      agent: input.agent,
      at: new Date().toISOString(),
    });
  } catch {
    /* DB unavailable — activity logging is best-effort */
  }
}

export async function recentActivity(limit = 20): Promise<ActivityRow[]> {
  try {
    const rows = await db.select().from(activity).orderBy(desc(activity.at)).limit(limit);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as ActivityKind,
      target: r.target,
      because: r.because ?? undefined,
      agent: r.agent ?? undefined,
      at: r.at,
    }));
  } catch {
    return [];
  }
}
