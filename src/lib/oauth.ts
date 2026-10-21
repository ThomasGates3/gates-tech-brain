/**
 * OAuth 2.1 for the MCP endpoint, so Claude's custom connectors (web + phone)
 * can sign in without pasting a bearer token. Bearer API keys keep working.
 *
 * Stateless: clients, codes and tokens are HMAC-signed with AUTH_SECRET, so no
 * DB tables. Bump OAUTH_TOKEN_GENERATION to revoke every OAuth token at once.
 *
 * Flow: Claude registers (/api/oauth/register) → sends you to /oauth/authorize
 * (sign in with your Thomas or Ace password, click Allow) → exchanges the code
 * with PKCE S256 (/api/oauth/token) → calls /api/mcp with the access token.
 * Redirects only go to claude.ai / claude.com, loopback (Claude Code), or hosts
 * listed in OAUTH_REDIRECT_HOSTS.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Operator } from "@/lib/field/types";

export const ACCESS_TTL_S = 60 * 60; // 1 hour
export const REFRESH_TTL_S = 30 * 24 * 60 * 60; // 30 days
export const CODE_TTL_S = 5 * 60;
export const SCOPE = "brain";

const ACCESS_PREFIX = "gto_";
const REFRESH_PREFIX = "gtr_";
const CLIENT_PREFIX = "gtc_";
const CODE_PREFIX = "gtk_";

type Kind = "access" | "refresh" | "code" | "client" | "secret";

function key(): string {
  const base = process.env.AUTH_SECRET || "insecure-dev-secret-set-AUTH_SECRET";
  return `oauth.v1.${process.env.OAUTH_TOKEN_GENERATION ?? "1"}.${base}`;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (kind: Kind, data: string) => createHmac("sha256", key()).update(`${kind}:${data}`).digest("base64url");

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function seal(prefix: string, kind: Kind, payload: object): string {
  const body = b64(JSON.stringify(payload));
  return `${prefix}${body}.${sign(kind, body)}`;
}

function open<T>(prefix: string, kind: Kind, token: string | null | undefined): T | null {
  if (!token?.startsWith(prefix)) return null;
  const rest = token.slice(prefix.length);
  const i = rest.lastIndexOf(".");
  if (i < 0) return null;
  const body = rest.slice(0, i);
  if (!same(rest.slice(i + 1), sign(kind, body))) return null;
  try {
    const p = JSON.parse(unb64(body)) as T & { exp?: number };
    if (p.exp !== undefined && p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

const now = () => Math.floor(Date.now() / 1000);

// ── Clients (dynamic registration, RFC 7591) ─────────────────────────────────

export type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";
export interface Client { name: string; redirectUris: string[]; auth: AuthMethod }

/** Loopback (any port) for Claude Code; https claude.ai / claude.com; plus OAUTH_REDIRECT_HOSTS. */
export function allowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:") return false;
  const extra = (process.env.OAUTH_REDIRECT_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return ["claude.ai", "claude.com", ...extra].includes(u.hostname.toLowerCase());
}

export function registerClient(c: Client): { clientId: string; clientSecret?: string } {
  const clientId = seal(CLIENT_PREFIX, "client", { n: c.name, r: c.redirectUris, a: c.auth, iat: now() });
  return c.auth === "none" ? { clientId } : { clientId, clientSecret: sign("secret", clientId) };
}

export function readClient(clientId: string | null | undefined): Client | null {
  const p = open<{ n: string; r: string[]; a: AuthMethod }>(CLIENT_PREFIX, "client", clientId);
  return p ? { name: p.n, redirectUris: p.r, auth: p.a } : null;
}

export function clientSecretOk(clientId: string, client: Client, secret: string | null | undefined): boolean {
  if (client.auth === "none") return true;
  return Boolean(secret) && same(secret!, sign("secret", clientId));
}

// ── Authorization codes (PKCE S256 required) ─────────────────────────────────

interface CodePayload { cid: string; ru: string; cc: string; op: Operator; exp: number }

export function issueCode(p: { clientId: string; redirectUri: string; codeChallenge: string; operator: Operator }): string {
  return seal(CODE_PREFIX, "code", { cid: p.clientId, ru: p.redirectUri, cc: p.codeChallenge, op: p.operator, n: randomBytes(8).toString("hex"), exp: now() + CODE_TTL_S });
}

export function redeemCode(code: string, clientId: string, redirectUri: string, verifier: string): Operator | null {
  const p = open<CodePayload>(CODE_PREFIX, "code", code);
  if (!p || p.cid !== clientId || p.ru !== redirectUri) return null;
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return null;
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return same(challenge, p.cc) ? p.op : null;
}

// ── Access + refresh tokens ──────────────────────────────────────────────────

export interface TokenSet { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string }

export function issueTokens(operator: Operator, clientId: string): TokenSet {
  const jti = randomBytes(8).toString("hex");
  return {
    access_token: seal(ACCESS_PREFIX, "access", { op: operator, cid: clientId, jti, exp: now() + ACCESS_TTL_S }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: seal(REFRESH_PREFIX, "refresh", { op: operator, cid: clientId, jti, exp: now() + REFRESH_TTL_S }),
    scope: SCOPE,
  };
}

export function readRefresh(token: string, clientId: string): Operator | null {
  const p = open<{ op: Operator; cid: string }>(REFRESH_PREFIX, "refresh", token);
  return p && p.cid === clientId ? p.op : null;
}

/** Operator + expiry for an OAuth access token, or null (not ours / bad / expired). */
export function readAccessToken(token: string | null | undefined): { operator: Operator; clientId: string; expiresAt: number } | null {
  const p = open<{ op: Operator; cid: string; exp: number }>(ACCESS_PREFIX, "access", token);
  return p ? { operator: p.op, clientId: p.cid, expiresAt: p.exp } : null;
}

export const isOAuthAccessToken = (token: string | null | undefined) => Boolean(token?.startsWith(ACCESS_PREFIX));

/** Operators that may grant MCP access (same rule as API keys: never "team"). */
export const canAuthorize = (op: Operator | null | undefined): op is "thomas" | "ace" => op === "thomas" || op === "ace";

// ── Metadata ─────────────────────────────────────────────────────────────────

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
  };
}

/** Authorize-request params, validated. Errors before redirect_uri is trusted are shown on-page, never redirected. */
export type AuthorizeCheck =
  | { ok: true; client: Client; clientId: string; redirectUri: string; codeChallenge: string; state: string | null }
  | { ok: false; error: string; redirectUri?: string; state?: string | null };

export function checkAuthorize(q: Record<string, string | undefined>): AuthorizeCheck {
  const clientId = q.client_id ?? "";
  const client = readClient(clientId);
  if (!client) return { ok: false, error: "Unknown client. Remove the connector in Claude and add it again." };
  const redirectUri = q.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!redirectUri || !client.redirectUris.includes(redirectUri) || !allowedRedirect(redirectUri)) {
    return { ok: false, error: "That redirect address isn't allowed." };
  }
  const state = q.state ?? null;
  if (q.response_type !== "code") return { ok: false, error: "unsupported_response_type", redirectUri, state };
  if (!q.code_challenge || q.code_challenge_method !== "S256") return { ok: false, error: "invalid_request", redirectUri, state };
  return { ok: true, client, clientId, redirectUri, codeChallenge: q.code_challenge, state };
}
