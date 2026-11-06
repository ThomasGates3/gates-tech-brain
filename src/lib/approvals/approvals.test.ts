import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals as table } from "@/db/schema";
import { listPending, requestApproval, resolveApproval } from "@/lib/approvals";
import { executeToolCall } from "@/lib/tools/router";
import { registry } from "@/lib/connectors/registry";
import { scrub } from "@/lib/audit";
import type { ToolCall } from "@/lib/types";

const call = (over: Partial<ToolCall> = {}): ToolCall => ({
  id: "tc_test", connectorId: "test-connector", toolName: "noop", args: { a: 1, b: 2 }, risk: "write",
  status: "running", agentId: "operator", createdAt: new Date().toISOString(), ...over,
});

function connectorTool(risk: "read" | "write") {
  for (const c of registry.all().filter((x) => URL.canParse(x.baseUrl))) {
    const spec = c.tools.find((t) => t.risk === risk && !Object.values(t.params ?? {}).some((p) => p.in === "path"));
    if (spec) {
      if (c.credential) process.env[c.credential.vaultKey] = "test-credential";
      return call({ connectorId: c.id, toolName: spec.name, risk });
    }
  }
  throw new Error(`no ${risk} tool`);
}

/** Records connector requests; anything else (the database driver) fails, so the gate can't save a row. */
function stubFetch() {
  const real = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/sql")) throw new Error("db down");
    hits.push(u);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { hits, restore: () => { globalThis.fetch = real; } };
}

test("a write tool never reaches the connector when the approval can't be saved", async () => {
  const f = stubFetch();
  try {
    const r = await executeToolCall(connectorTool("write"));
    assert.equal(r.status, "error");
    assert.deepEqual(f.hits, []);
  } finally { f.restore(); }
});

test("a read tool runs without approval", async () => {
  const f = stubFetch();
  try {
    const r = await executeToolCall(connectorTool("read"));
    assert.equal(r.status, "success", r.error);
    assert.equal(f.hits.length, 1);
  } finally { f.restore(); }
});

test("scrub redacts secret fields, nested and inside arrays", () => {
  assert.deepEqual(scrub({ apiKey: "x", ok: 1, nested: { token: "y" }, list: [{ password: "z", name: "n" }] }), {
    apiKey: "[REDACTED]", ok: 1, nested: { token: "[REDACTED]" }, list: [{ password: "[REDACTED]", name: "n" }],
  });
});

// Writes one row to the real approvals table and removes it. Skipped without DATABASE_URL.
test("approval lifecycle in Neon: dedupe, run-once claim, expiry", { skip: !process.env.DATABASE_URL }, async () => {
  const args = { run: Date.now() };
  const first = await requestApproval(call({ args }), "test");
  const expired = `apr_test_expired_${Date.now()}`;
  try {
    assert.equal(first.created, true);
    const again = await requestApproval(call({ args }), "test");
    assert.deepEqual(again, { id: first.id, created: false });
    assert.ok((await listPending()).some((p) => p.id === first.id));

    const claims = await Promise.all([resolveApproval(first.id, "approved", "thomas"), resolveApproval(first.id, "approved", "thomas")]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(await resolveApproval(first.id, "denied", "thomas"), null);
    assert.ok(!(await listPending()).some((p) => p.id === first.id));

    await db.insert(table).values({ id: expired, toolCall: call(), reason: "test", requestedAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
    assert.ok(!(await listPending()).some((p) => p.id === expired));
    assert.equal(await resolveApproval(expired, "approved", "thomas"), null);
  } finally {
    await db.delete(table).where(eq(table.id, first.id));
    await db.delete(table).where(eq(table.id, expired));
  }
});
