/**
 * Next.js Edge Middleware — auth enforcement + rate limiting + security headers.
 *
 * Routes protected:
 *   /api/**   — all API routes (unauthenticated → 401)
 *   /sign-in  — public (excluded)
 *   /         — public landing; redirects to /sign-in if no session
 *
 * Rate limiting: 60 req/min per IP (token bucket via in-memory store).
 * Note: Edge runtime has no shared memory across instances — for multi-instance
 * production rate limiting, swap to Vercel KV / Upstash Redis.
 */

import { auth } from "@/auth";
import { apiRateLimiter, securityHeaders, corsHeaders } from "@/lib/security";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/sign-in", "/api/auth"]);

function isPublic(pathname: string): boolean {
  return [...PUBLIC_PATHS].some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default auth(async function middleware(req: NextRequest & { auth?: unknown }) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  // ── CORS pre-flight ───────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // ── Rate limiting (by IP) ─────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!apiRateLimiter.check(ip)) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60", ...securityHeaders },
    });
  }

  // ── Auth guard ────────────────────────────────────────────────────────────
  const session = (req as { auth?: { user?: { id?: string } } }).auth;

  if (!isPublic(pathname) && !session) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { ...securityHeaders, ...corsHeaders(origin) },
      });
    }
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signIn);
  }

  // ── Pass through with security headers ───────────────────────────────────
  const res = NextResponse.next();
  for (const [k, v] of Object.entries({ ...securityHeaders, ...corsHeaders(origin) })) {
    if (v) res.headers.set(k, v);
  }
  return res;
});

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static files.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
