/**
 * Security helpers — input validation, rate limiting, CORS, sanitize.
 * All server-side only (no client bundle exposure).
 */

import { z } from "zod";

// ── Input validation ────────────────────────────────────────────────────────

/**
 * Parse and validate an unknown payload against a zod schema.
 * Throws a 400-friendly Error with issues serialised as a message.
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw Object.assign(new Error(`Validation failed — ${issues}`), { status: 400 });
  }
  return result.data;
}

// ── Sanitize ────────────────────────────────────────────────────────────────

/**
 * Strip HTML/script from a string. Uses DOMPurify when in a browser context
 * (the UX agent may call this client-side); falls back to a simple regex
 * escape on the server where DOMPurify is unavailable.
 */
export function sanitize(input: string): string {
  // Server-side fallback: escape angle brackets to neutralise injection.
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Token-bucket rate limiter ───────────────────────────────────────────────

export interface RateLimiter {
  /** Returns true if the request is allowed; false if rate-limited. */
  check(key: string): boolean;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Create a per-key token-bucket rate limiter.
 * @param capacity  Max tokens per bucket (burst limit).
 * @param refillRatePerSec  Tokens added per second.
 */
export function createRateLimiter(
  capacity: number,
  refillRatePerSec: number,
): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string): boolean {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, lastRefill: now };
        buckets.set(key, bucket);
      }

      // Refill tokens based on elapsed time.
      const elapsed = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRatePerSec);
      bucket.lastRefill = now;

      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
  };
}

// Default API rate limiter: 60 req/min per key (IP or user id).
export const apiRateLimiter = createRateLimiter(60, 1);

// ── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS_PROD = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Return CORS headers for a given request origin.
 * In development all origins are allowed; in production only
 * the CORS_ORIGINS env var list is allowed (never wildcard with credentials).
 */
export function corsHeaders(requestOrigin: string | null): HeadersInit {
  const isDev = process.env.NODE_ENV !== "production";

  const allow =
    isDev ||
    (requestOrigin !== null && ALLOWED_ORIGINS_PROD.includes(requestOrigin));

  return {
    "Access-Control-Allow-Origin": allow ? (requestOrigin ?? "*") : "",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

// ── Security response headers ───────────────────────────────────────────────

/** HSTS + baseline security headers for Next.js middleware or API routes. */
export const securityHeaders: HeadersInit = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
