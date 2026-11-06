/** Key-authed paths skip the cookie gate on any Bearer header, so each route must verify the key itself. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = new Set(["src/app/api/v1/openapi.json/route.ts"]);
const routesIn = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts")).map((f) => join(dir, f));

test("every /api/field and /api/v1 route checks the caller", () => {
  const routes = ["src/app/api/field", "src/app/api/v1"].flatMap(routesIn).filter((f) => !PUBLIC.has(f));
  assert.ok(routes.length >= 7, `expected the key-authed routes, found ${routes.length}`);
  for (const file of routes) {
    assert.match(readFileSync(file, "utf8"), /requireOperator|currentOperator/, `${file} has no operator check`);
  }
});

test("/api/mcp requires auth", () => {
  assert.match(readFileSync("src/app/api/mcp/route.ts", "utf8"), /required:\s*true/);
});
