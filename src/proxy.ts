/**
 * Proxy — password gate + rate limiting + security headers.
 *
 * The gate is always on in production (lib/gate). Public paths are listed below.
 * Unauthenticated → /sign-in (pages) or 401 (API).
 */
import { apiRateLimiter, securityHeaders, corsHeaders } from "@/lib/security";
import { GATE_COOKIE, gateEnabled, verifyToken } from "@/lib/gate";
import { isPhoneUA } from "@/lib/ux/approve-queue";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const VIEW_COOKIE = "brain_view";

// /api/cron is protected by CRON_SECRET (not the password gate) so Vercel Cron can reach it.
// /api/mcp checks its own auth (API key or OAuth) and must answer 401 + WWW-Authenticate itself.
// OAuth discovery, client registration and token exchange are public by design (lib/oauth).
const PUBLIC_PATHS = ["/sign-in", "/api/auth", "/api/cron", "/api/health", "/api/v1/openapi.json", "/api/mcp", "/.well-known", "/api/oauth/register", "/api/oauth/token", "/manifest.webmanifest"];
// Machine APIs: a Bearer request is passed to the route, which verifies the key (env or DB) itself.
const KEY_PATHS = ["/api/field/", "/api/v1/"];
const isPublic = (p: string) => PUBLIC_PATHS.some((x) => p === x || p.startsWith(x + "/"));

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Rate limit APIs by IP. Pages stay out: moving between them and link prefetching would use up the budget.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (pathname.startsWith("/api/") && !apiRateLimiter.check(ip)) {
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
      signIn.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
      return NextResponse.redirect(signIn);
    }
  }

  // Phone view: phones opening / land on the /m approve view. "?view=desktop" (the
  // "Desktop view" link) remembers the choice in a cookie; "?view=phone" clears it.
  const view = req.nextUrl.searchParams.get("view");
  if (view === "phone" || view === "desktop") {
    const res = NextResponse.redirect(new URL(view === "phone" ? "/m" : "/", req.url));
    if (view === "desktop") res.cookies.set(VIEW_COOKIE, "desktop", { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
    else res.cookies.delete(VIEW_COOKIE);
    return res;
  }
  if (pathname === "/" && req.method === "GET" && req.cookies.get(VIEW_COOKIE)?.value !== "desktop" && isPhoneUA(req.headers.get("user-agent"))) {
    return NextResponse.redirect(new URL("/m", req.url));
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
