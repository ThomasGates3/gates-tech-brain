/**
 * Edge middleware — password gate + rate limiting + security headers.
 *
 * The gate turns ON automatically when ACCESS_PASSWORD is set (so production is
 * locked down as soon as you add the env var). Public paths: /sign-in, /api/auth.
 * Unauthenticated → /sign-in (pages) or 401 (API).
 */
import { apiRateLimiter, securityHeaders, corsHeaders } from "@/lib/security";
import { GATE_COOKIE, gateEnabled, verifyToken } from "@/lib/gate";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// /api/cron is protected by CRON_SECRET (not the password gate) so Vercel Cron can reach it.
const PUBLIC_PATHS = ["/sign-in", "/api/auth", "/api/cron", "/api/v1/openapi.json"];
// Machine APIs: a Bearer request is passed to the route, which verifies the key (env or DB) itself.
const KEY_PATHS = ["/api/field/", "/api/mcp", "/api/v1/"];
const isPublic = (p: string) => PUBLIC_PATHS.some((x) => p === x || p.startsWith(x + "/"));

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Rate limit by IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!apiRateLimiter.check(ip)) {
    return new NextResponse("Too Many Requests", { status: 429, headers: { "Retry-After": "60", ...securityHeaders } });
  }

  // Password gate.
  if (gateEnabled() && !isPublic(pathname)) {
    const bot = KEY_PATHS.some((p) => pathname.startsWith(p)) && /^Bearer\s+\S+/i.test(req.headers.get("authorization") ?? "");
    const ok = bot || (await verifyToken(req.cookies.get(GATE_COOKIE)?.value));
    if (!ok) {
      if (pathname.startsWith("/api/")) {
        return new NextResponse("Unauthorized", { status: 401, headers: { ...securityHeaders, ...corsHeaders(origin) } });
      }
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(signIn);
    }
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries({ ...securityHeaders, ...corsHeaders(origin) })) {
    if (v) res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
