/**
 * POST /api/auth/login { password } — verify the shared password, set a signed
 * session cookie. GET /api/auth/logout clears it.
 */
import { z } from "zod";
import { passwordOk, issueToken, GATE_COOKIE, cookieOptions, gateEnabled } from "@/lib/gate";

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

  if (!passwordOk(parsed.data.password)) {
    return Response.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  const token = await issueToken();
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${GATE_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${cookieOptions.maxAge}; SameSite=Lax${cookieOptions.secure ? "; Secure" : ""}`
  );
  return res;
}
