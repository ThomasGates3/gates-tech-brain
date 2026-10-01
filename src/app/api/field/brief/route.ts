/**
 * GET /api/field/brief — the outreach brief (markdown) Ace must write inside,
 * plus the Email 1 rules the console enforces on top of it.
 */
import { requireOperator } from "@/lib/field/api";
import { OUTREACH_BRIEF } from "@/lib/field/brief";
import { MAX_WORDS } from "@/lib/field/lint";

export async function GET() {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return Response.json({
    brief: OUTREACH_BRIEF,
    email1: {
      maxWords: MAX_WORDS,
      footer: "Physical address + opt-out are appended to every send. Do not write them into the draft.",
      lint: "Nick submit, Approve and Send reject any draft that fails the copy lint (see `lint` on each contact response).",
    },
  });
}
