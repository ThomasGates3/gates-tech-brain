/**
 * POST /api/auth/login { password } — match the password to an operator (team /
 * thomas / ace), set a signed session cookie. GET /api/auth/logout clears it.
 */
import { z } from "zod";
import { operatorForPassword, issueToken, GATE_COOKIE, cookieOptions, gateEnabled } from "@/lib/gate";

const Schema = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!gateEnabled()) return Response.json({ ok: true, note: "gate disabled" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "Password required" }, { status: 400 });

  const operator = operatorForPassword(parsed.data.password);
  if (!operator) {
    return Response.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  const token = await issueToken(operator);
  const res = Response.json({ ok: true, operator });
  res.headers.append(
    "Set-Cookie",
    `${GATE_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${cookieOptions.maxAge}; SameSite=Lax${cookieOptions.secure ? "; Secure" : ""}`
  );
  return res;
}
