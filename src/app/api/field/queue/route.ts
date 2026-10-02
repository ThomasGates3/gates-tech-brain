/**
 * GET  /api/field/queue?date=YYYY-MM-DD — the day's pack + console config/gates.
 * POST /api/field/queue { source: "notion", date } — pull the morning pack from Notion.
 * POST /api/field/queue { source: "csv", csv, date } — CSV fallback.
 */
import { z } from "zod";
import { consoleConfig, error, json, requireOperator } from "@/lib/field/api";
import { todayIn } from "@/lib/field/config";
import { listQueue } from "@/lib/field/store";
import { loadPack } from "@/lib/field/actions";
import type { QueueResponse } from "@/lib/field/types";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(req: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  const param = new URL(req.url).searchParams.get("date");
  const date = DateStr.safeParse(param).success ? param! : todayIn();
  try {
    const body: QueueResponse = { date, contacts: await listQueue(date), config: await consoleConfig(auth.operator) };
    return json(body);
  } catch (e) {
    return error(500, `Queue unavailable: ${e instanceof Error ? e.message : String(e)}. Run npm run db:push if the field_* tables are missing.`);
  }
}

const LoadSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("notion"), date: DateStr }),
  z.object({ source: z.literal("csv"), date: DateStr, csv: z.string().min(1).max(2_000_000) }),
]);

export async function POST(req: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  const parsed = LoadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, "Expected { source: 'notion' | 'csv', date: YYYY-MM-DD, csv? }.");
  const input = parsed.data;

  try {
    const summary = await loadPack(input.source, input.date, input.source === "csv" ? input.csv : undefined);
    return json({ ok: true, ...summary });
  } catch (e) {
    return error(502, e instanceof Error ? e.message : String(e));
  }
}
