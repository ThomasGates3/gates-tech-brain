/**
 * Simple password gate — shared password plus optional per-operator passwords,
 * a signed cookie. Edge-compatible (Web Crypto), so it works in middleware and
 * on Vercel with zero OAuth setup.
 *
 * ACCESS_PASSWORD        → operator "team" (the deck; no Field Console greenlight)
 * FIELD_THOMAS_PASSWORD  → operator "thomas" (Field Console Approve / Send)
 * FIELD_ACE_PASSWORD     → operator "ace" (Field Console ops, browser sign-in)
 * FIELD_ACE_API_KEY      → operator "ace" via `Authorization: Bearer <key>` on
 *                          /api/field/* only (Ace is a bot — no cookie needed)
 * The gate turns on when any of them is set. Cookies are signed with AUTH_SECRET.
 * With none set, the gate is OFF (open) — fine for local dev only.
 */
import type { Operator } from "@/lib/field/types";

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

const PASSWORDS: [Operator, string][] = [
  ["thomas", "FIELD_THOMAS_PASSWORD"],
  ["ace", "FIELD_ACE_PASSWORD"],
  ["team", "ACCESS_PASSWORD"],
];

export function gateEnabled(): boolean {
  return [...PASSWORDS.map(([, env]) => env), "FIELD_ACE_API_KEY"].some((env) => Boolean(process.env[env]));
}

/** Constant-ish time compare to avoid trivially leaking length/prefix. */
function sameString(input: string, expected: string): boolean {
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Which operator this password belongs to (most privileged match wins), or null. */
export function operatorForPassword(input: string): Operator | null {
  for (const [op, env] of PASSWORDS) if (sameString(input, process.env[env] ?? "")) return op;
  return null;
}

/** Ace's bot API key, from an `Authorization: Bearer` header. Field API only. */
export function operatorForBearer(header: string | null | undefined): Operator | null {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  return m && sameString(m[1].trim(), process.env.FIELD_ACE_API_KEY ?? "") ? "ace" : null;
}

function secret(): string {
  return process.env.AUTH_SECRET || "insecure-dev-secret-set-AUTH_SECRET";
}

const OPERATORS: Operator[] = ["thomas", "ace", "team"];

export async function issueToken(operator: Operator = "team"): Promise<string> {
  const payload = `v2.${operator}.${Date.now() + TTL_MS}`;
  return `${payload}.${await hmac(secret(), payload)}`;
}

/** Verify a session cookie and return who it belongs to (v1 cookies → "team"). */
export async function readSession(token: string | undefined): Promise<{ operator: Operator } | null> {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const parts = payload.split(".");
  let operator: Operator;
  let exp: string | undefined;
  if (parts[0] === "v1" && parts.length === 2) {
    operator = "team";
    exp = parts[1];
  } else if (parts[0] === "v2" && parts.length === 3 && OPERATORS.includes(parts[1] as Operator)) {
    operator = parts[1] as Operator;
    exp = parts[2];
  } else {
    return null;
  }
  if (!exp || Number(exp) < Date.now()) return null;
  if (sig !== (await hmac(secret(), payload))) return null;
  return { operator };
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  return (await readSession(token)) !== null;
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: TTL_MS / 1000,
};
