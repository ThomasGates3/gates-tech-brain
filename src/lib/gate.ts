/**
 * Simple password gate — one shared password, a signed cookie. Edge-compatible
 * (Web Crypto), so it works in middleware and on Vercel with zero OAuth setup.
 *
 * Enable by setting ACCESS_PASSWORD. Cookies are signed with AUTH_SECRET.
 * If ACCESS_PASSWORD is unset, the gate is OFF (open) — fine for local dev only.
 */

export const GATE_COOKIE = "brain_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(sig);
}

export function gateEnabled(): boolean {
  return Boolean(process.env.ACCESS_PASSWORD);
}

/** Constant-ish time compare to avoid trivially leaking length/prefix. */
export function passwordOk(input: string): boolean {
  const expected = process.env.ACCESS_PASSWORD ?? "";
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function secret(): string {
  return process.env.AUTH_SECRET || "insecure-dev-secret-set-AUTH_SECRET";
}

export async function issueToken(): Promise<string> {
  const payload = `v1.${Date.now() + TTL_MS}`;
  return `${payload}.${await hmac(secret(), payload)}`;
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const [v, exp] = payload.split(".");
  if (v !== "v1" || !exp || Number(exp) < Date.now()) return false;
  return sig === (await hmac(secret(), payload));
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: TTL_MS / 1000,
};
