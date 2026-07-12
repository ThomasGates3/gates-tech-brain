/** GET/POST /api/auth/logout — clear the session cookie. */
import { GATE_COOKIE } from "@/lib/gate";

function clear() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${GATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  return res;
}

export const GET = clear;
export const POST = clear;
