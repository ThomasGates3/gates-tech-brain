/** GET/POST /api/content: the /content Studio board (same helpers as the brain_content_* tools). */
import { z } from "zod";
import { isThomasSession } from "@/lib/session";
import { recordActivity } from "@/lib/activity";
import {
  ContentError, DAYS, STATUSES, addContentIdea, board, generateWeekWithClaude, promoteIdeaToSlot,
  regenerateSlotWithClaude, setContentMode, upsertContentItem,
} from "@/lib/content/studio";

const Mode = z.enum(["slow", "fast"]);
const Day = z.enum(DAYS);
const Format = z.enum(["reel", "carousel", "story"]);
const Fields = z.object({
  id: z.string().optional(),
  day_of_week: Day.optional(),
  format: Format.optional(),
  modes: z.array(Mode).optional(),
  status: z.enum(STATUSES).optional(),
  title: z.string().max(160).optional(),
  demo_slug: z.string().max(100).optional(),
  site_url: z.string().max(500).optional(),
  top_pill_hook: z.string().max(160).optional(),
  top_pill_alt: z.string().max(160).optional(),
  shot_list: z.array(z.string().max(400)).optional(),
  caption: z.string().max(3000).optional(),
  ghl_keyword: z.string().max(40).optional(),
  ghl_dm_script: z.string().max(1000).optional(),
  posting_time_et: z.string().max(80).optional(),
  angle_note: z.string().max(500).optional(),
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_mode"), mode: Mode }),
  z.object({ action: z.literal("set_status"), id: z.string(), status: z.enum(STATUSES) }),
  Fields.extend({ action: z.literal("upsert") }),
  Fields.extend({ action: z.literal("add_idea") }),
  z.object({ action: z.literal("promote_idea"), idea_id: z.string(), day: Day }),
  z.object({ action: z.literal("generate_week"), mode: Mode.optional(), model: z.enum(["haiku", "sonnet"]).default("sonnet") }),
  z.object({ action: z.literal("regenerate_slot"), id: z.string(), custom_angle: z.string().max(500).optional(), model: z.enum(["haiku", "sonnet"]).default("sonnet") }),
]);

export async function GET() {
  try {
    return Response.json(await board());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const by = (await isThomasSession()) ? "thomas" : "team";
  const b = p.data;
  try {
    let result: unknown;
    switch (b.action) {
      case "set_mode": result = await setContentMode(b.mode, by); break;
      case "set_status":
        result = await upsertContentItem({ id: b.id, status: b.status }, by);
        if (b.status === "posted") await recordActivity({ kind: "updated", target: `IG slot ${b.id} posted`, agent: by });
        break;
      case "upsert": result = await upsertContentItem(b, by); break;
      case "add_idea": result = await addContentIdea(b, by); break;
      case "promote_idea": result = await promoteIdeaToSlot(b.idea_id, b.day, by); break;
      case "generate_week":
        result = await generateWeekWithClaude({ mode: b.mode, model: b.model }, by);
        await recordActivity({ kind: "generated", target: "Generated the weekly IG content pack with Claude", agent: by });
        break;
      case "regenerate_slot":
        result = await regenerateSlotWithClaude(b.id, { custom_angle: b.custom_angle, model: b.model }, by);
        await recordActivity({ kind: "generated", target: `Regenerated IG slot ${b.id} with Claude`, agent: by });
        break;
    }
    return Response.json({ ok: true, result, board: await board() });
  } catch (e) {
    const status = e instanceof ContentError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
