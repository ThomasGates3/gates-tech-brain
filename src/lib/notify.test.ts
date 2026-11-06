import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { reportError } from "./notify";

const HOOK = "https://discord.invalid/hook";
const realFetch = globalThis.fetch;
const saved = process.env.DISCORD_WEBHOOK_URL;
let pings: string[] = [];

// Every other request fails, which is what a Neon outage looks like from here.
before(() => {
  process.env.DISCORD_WEBHOOK_URL = HOOK;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== HOOK) throw new Error("database down");
    pings.push(String(init?.body));
    return new Response("{}");
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  if (saved === undefined) delete process.env.DISCORD_WEBHOOK_URL;
  else process.env.DISCORD_WEBHOOK_URL = saved;
});

test("an error pings once, even with the database down, and hides secrets", async () => {
  pings = [];
  const err = new Error("connect failed postgresql://user:hunter2@db.example/neon with Bearer abc123");
  await reportError("/api/test", err);
  await reportError("/api/test", err);
  assert.equal(pings.length, 1);
  assert.match(pings[0], /Something broke: \/api\/test/);
  assert.doesNotMatch(pings[0], /hunter2|abc123/);
});

test("a failed query pings its cause once, whatever its parameters", async () => {
  pings = [];
  const failed = (at: string) => new Error(`Failed query: select * from contacts\nparams: pat@example.invalid,${at}`, { cause: new Error("connection refused") });
  await reportError("/api/query", failed("2026-01-01T10:00:00Z"));
  await reportError("/api/query", failed("2026-01-01T10:00:09Z"));
  assert.equal(pings.length, 1);
  assert.match(pings[0], /connection refused/);
  assert.doesNotMatch(pings[0], /pat@example|select \*/);
});

test("a different error pings again", async () => {
  pings = [];
  await reportError("/api/test", new Error("first"));
  await reportError("/api/test", new Error("second"));
  assert.equal(pings.length, 2);
});
