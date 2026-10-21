/**
 * OAuth for /api/mcp — registration, PKCE codes, tokens. Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { allowedRedirect, registerClient, readClient, clientSecretOk, issueCode, redeemCode, issueTokens, readAccessToken, readRefresh, checkAuthorize, canAuthorize } from "./oauth";

process.env.AUTH_SECRET = "test-secret";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const verifier = "a".repeat(43) + "-._~";
const challenge = createHash("sha256").update(verifier).digest("base64url");

test("redirect allowlist: claude, loopback, env hosts only", () => {
  assert.ok(allowedRedirect(REDIRECT));
  assert.ok(allowedRedirect("https://claude.com/api/mcp/auth_callback"));
  assert.ok(allowedRedirect("http://localhost:33418/callback"));
  assert.ok(allowedRedirect("http://127.0.0.1:9000/cb"));
  assert.ok(!allowedRedirect("https://evil.example/cb"));
  assert.ok(!allowedRedirect("https://claude.ai.evil.example/cb"));
  assert.ok(!allowedRedirect("http://claude.ai/cb"));
  assert.ok(!allowedRedirect("javascript:alert(1)"));
  process.env.OAUTH_REDIRECT_HOSTS = "chat.example.com";
  assert.ok(allowedRedirect("https://chat.example.com/cb"));
  delete process.env.OAUTH_REDIRECT_HOSTS;
});

test("client ids are signed and round-trip; tampering fails", () => {
  const { clientId, clientSecret } = registerClient({ name: "Claude", redirectUris: [REDIRECT], auth: "none" });
  assert.equal(clientSecret, undefined);
  assert.deepEqual(readClient(clientId), { name: "Claude", redirectUris: [REDIRECT], auth: "none" });
  assert.equal(readClient(clientId.slice(0, -2) + "xx"), null);
  assert.equal(readClient("gtk_" + clientId.slice(4)), null);
  assert.equal(readClient(null), null);
});

test("confidential clients need their secret", () => {
  const { clientId, clientSecret } = registerClient({ name: "C", redirectUris: [REDIRECT], auth: "client_secret_post" });
  const c = readClient(clientId)!;
  assert.ok(clientSecretOk(clientId, c, clientSecret));
  assert.ok(!clientSecretOk(clientId, c, "nope"));
  assert.ok(!clientSecretOk(clientId, c, null));
});

test("code redeems only with the right client, redirect and PKCE verifier", () => {
  const { clientId } = registerClient({ name: "Claude", redirectUris: [REDIRECT], auth: "none" });
  const code = issueCode({ clientId, redirectUri: REDIRECT, codeChallenge: challenge, operator: "thomas" });
  assert.equal(redeemCode(code, clientId, REDIRECT, verifier), "thomas");
  assert.equal(redeemCode(code, clientId, REDIRECT, "b".repeat(43)), null);
  assert.equal(redeemCode(code, clientId, "https://claude.com/x", verifier), null);
  const other = registerClient({ name: "X", redirectUris: [REDIRECT], auth: "none" }).clientId;
  assert.equal(redeemCode(code, other, REDIRECT, verifier), null);
});

test("access and refresh tokens are not interchangeable", () => {
  const t = issueTokens("ace", "cid");
  assert.equal(readAccessToken(t.access_token)?.operator, "ace");
  assert.equal(readAccessToken(t.refresh_token), null);
  assert.equal(readRefresh(t.refresh_token, "cid"), "ace");
  assert.equal(readRefresh(t.refresh_token, "other"), null);
  assert.equal(readRefresh(t.access_token, "cid"), null);
});

test("bumping OAUTH_TOKEN_GENERATION revokes every token", () => {
  const t = issueTokens("thomas", "cid");
  process.env.OAUTH_TOKEN_GENERATION = "2";
  assert.equal(readAccessToken(t.access_token), null);
  delete process.env.OAUTH_TOKEN_GENERATION;
  assert.ok(readAccessToken(t.access_token));
});

test("authorize checks: unknown client and foreign redirect never redirect", () => {
  const { clientId } = registerClient({ name: "Claude", redirectUris: [REDIRECT], auth: "none" });
  const base = { response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s" };
  assert.equal(checkAuthorize(base).ok, true);
  const unknown = checkAuthorize({ ...base, client_id: "gtc_bad" });
  assert.ok(!unknown.ok && !unknown.redirectUri);
  const foreign = checkAuthorize({ ...base, redirect_uri: "https://claude.ai/other" });
  assert.ok(!foreign.ok && !foreign.redirectUri);
  const plain = checkAuthorize({ ...base, code_challenge_method: "plain" });
  assert.ok(!plain.ok && plain.redirectUri === REDIRECT);
  assert.ok(canAuthorize("thomas") && canAuthorize("ace") && !canAuthorize("team") && !canAuthorize(null));
});
