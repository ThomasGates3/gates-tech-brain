/** GET /api/mission/badge: how many tasks wait on Thomas. Never throws; a DB problem reads as zero. */
import { dbStore } from "@/lib/mission/db-store";

export async function GET() {
  try {
    const waiting = (await dbStore().list({ column: "waiting_thomas" })).length;
    return Response.json({ waiting });
  } catch {
    return Response.json({ waiting: 0 });
  }
}
