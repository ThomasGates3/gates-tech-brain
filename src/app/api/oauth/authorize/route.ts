/**
 * POST /api/oauth/authorize — the Allow / Deny button on /oauth/authorize.
 * Needs the deck session cookie (Thomas or Ace); the SameSite=Lax cookie means
 * a cross-site form can't post here. Redirects back to the client with a code.
 */
import { cookies } from "next/headers";
import { getPublicOrigin } from "mcp-handler";
import { GATE_COOKIE, readSession } from "@/lib/gate";
import { canAuthorize, checkAuthorize, issueCode } from "@/lib/oauth";

export async function POST(req: Request) {
  const form = await req.formData();
  const q = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const check = checkAuthorize(q);
  if (!check.ok && !check.redirectUri) return new Response(check.error, { status: 400 });

  const back = new URL(check.redirectUri!);
  if (check.state) back.searchParams.set("state", check.state);
  back.searchParams.set("iss", getPublicOrigin(req));

  if (!check.ok) {
    back.searchParams.set("error", check.error);
  } else if (q.decision !== "allow") {
    back.searchParams.set("error", "access_denied");
  } else {
    const session = await readSession((await cookies()).get(GATE_COOKIE)?.value);
    if (!canAuthorize(session?.operator)) return new Response("Sign in as Thomas or Ace first.", { status: 403 });
    back.searchParams.set("code", issueCode({ clientId: check.clientId, redirectUri: check.redirectUri, codeChallenge: check.codeChallenge, operator: session.operator }));
  }
  return Response.redirect(back.toString(), 303);
}
