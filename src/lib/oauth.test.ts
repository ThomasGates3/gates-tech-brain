/**
 * OAuth for /api/mcp — registration, PKCE codes, tokens. Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { allowedRedirect, registerClient, readClient, clientSecretOk, issueCode, redeemCode, issueTokens, readAccessToken, readRefresh, checkAuthorize, canAuthorize, isCimdClientId, clientFromMetadata, resolveClient } from "./oauth";

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

test("authorize checks: unknown client and foreign redirect never redirect", async () => {
  const { clientId } = registerClient({ name: "Claude", redirectUris: [REDIRECT], auth: "none" });
  const base = { response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s" };
  assert.equal((await checkAuthorize(base)).ok, true);
  const unknown = await checkAuthorize({ ...base, client_id: "gtc_bad" });
  assert.ok(!unknown.ok && !unknown.redirectUri);
  const foreign = await checkAuthorize({ ...base, redirect_uri: "https://claude.ai/other" });
  assert.ok(!foreign.ok && !foreign.redirectUri);
  const plain = await checkAuthorize({ ...base, code_challenge_method: "plain" });
  assert.ok(!plain.ok && plain.redirectUri === REDIRECT);
  assert.ok(canAuthorize("thomas") && canAuthorize("ace") && !canAuthorize("team") && !canAuthorize(null));
});

const CIMD = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const cimdDoc = { client_id: CIMD, client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" };

test("CIMD client ids: https with a path on a real hostname only", () => {
  assert.ok(isCimdClientId(CIMD));
  for (const bad of ["http://claude.ai/x", "https://claude.ai/", "https://127.0.0.1/x", "https://localhost/x", "https://[::1]/x", "https://claude.ai:8443/x", "https://metadata.internal/x", "gtc_abc", null]) {
    assert.ok(!isCimdClientId(bad), String(bad));
  }
});

test("CIMD document must name itself and be a public client", () => {
  assert.deepEqual(clientFromMetadata(CIMD, cimdDoc), { name: "Claude", redirectUris: [REDIRECT], auth: "none" });
  assert.equal(clientFromMetadata(CIMD, { ...cimdDoc, client_id: "https://evil.example/x" }), null);
  assert.equal(clientFromMetadata(CIMD, { ...cimdDoc, redirect_uris: [] }), null);
  assert.equal(clientFromMetadata(CIMD, { ...cimdDoc, token_endpoint_auth_method: "private_key_jwt" }), null);
});

test("CIMD flow: authorize with Claude's published identity, then redeem the code", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url: string) => {
    calls++;
    assert.equal(url, CIMD);
    return new Response(JSON.stringify(cimdDoc), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const check = await checkAuthorize({ response_type: "code", client_id: CIMD, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256" });
    assert.ok(check.ok);
    const client = await resolveClient(CIMD);
    assert.equal(calls, 1, "metadata is cached");
    assert.ok(client && clientSecretOk(CIMD, client, null));
    const code = issueCode({ clientId: CIMD, redirectUri: REDIRECT, codeChallenge: challenge, operator: "thomas" });
    assert.equal(redeemCode(code, CIMD, REDIRECT, verifier), "thomas");
    const foreign = await checkAuthorize({ response_type: "code", client_id: CIMD, redirect_uri: "https://evil.example/cb", code_challenge: challenge, code_challenge_method: "S256" });
    assert.ok(!foreign.ok && !foreign.redirectUri);
  } finally {
    globalThis.fetch = real;
  }
});
