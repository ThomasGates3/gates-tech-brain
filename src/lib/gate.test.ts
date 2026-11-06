import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { authSecret, gateEnabled, sameString, issueToken, readSession } from "@/lib/gate";
import { isLockedOut, MAX_FAILURES, WINDOW_MINUTES } from "@/lib/login-limit";

const env = process.env as Record<string, string | undefined>;
const saved = { NODE_ENV: env.NODE_ENV, AUTH_SECRET: env.AUTH_SECRET };
afterEach(() => Object.assign(env, saved));

test("production refuses the dev signing secret", () => {
  env.NODE_ENV = "production";
  delete env.AUTH_SECRET;
  assert.throws(authSecret, /AUTH_SECRET/);
});

test("production keeps the gate on with no passwords set", () => {
  env.NODE_ENV = "production";
  for (const k of ["ACCESS_PASSWORD", "FIELD_THOMAS_PASSWORD", "FIELD_ACE_PASSWORD", "FIELD_ACE_API_KEY"]) delete env[k];
  assert.equal(gateEnabled(), true);
});

test("sameString matches only exact values", () => {
  assert.equal(sameString("abc", "abc"), true);
  assert.equal(sameString("abd", "abc"), false);
  assert.equal(sameString("ab", "abc"), false);
  assert.equal(sameString("abcd", "abc"), false);
  assert.equal(sameString("", ""), false);
});

test("session cookies reject a tampered signature or operator", async () => {
  env.AUTH_SECRET = "test-secret";
  const token = await issueToken("team");
  assert.deepEqual(await readSession(token), { operator: "team" });
  assert.equal(await readSession(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")), null);
  assert.equal(await readSession(token.replace("v2.team.", "v2.thomas.")), null);
});

test("login lockout applies at the limit and ends with the window", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  assert.equal(isLockedOut(MAX_FAILURES - 1, minutesAgo(1), now), false);
  assert.equal(isLockedOut(MAX_FAILURES, minutesAgo(1), now), true);
  assert.equal(isLockedOut(MAX_FAILURES, minutesAgo(WINDOW_MINUTES + 1), now), false);
});
